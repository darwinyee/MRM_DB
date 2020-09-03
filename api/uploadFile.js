const express = require('express')
const router = express.Router();
const pool = require('../dbcon.js').pool;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadFileHeaders = require('../importFileHeaders.js').fileHeaders;

//<-----------multer storage engine setup----------------->
let storage = multer.diskStorage({
    destination: function (req, file, cb){
        cb(null, './public/uploads');
    },
    filename: function(req, file, cb){
        let timestamp = Date.now();
        let filenameArr = file.originalname.split('.');
        cb(null, filenameArr[0]+ '_' + timestamp + '.' + filenameArr[1]);
    }
});

let upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb){
        let ext = path.extname(file.originalname);
        if(ext != '.csv' && ext != '.fasta'){
            return cb(new Error('.csv Only!'));
        }
        cb(null, true);
    }
}).single('uploadFile')
//<-----------End multer storage engine setup----------------->


//Make query to database, can do multiple key,value pairs with either all AND or OR
function queryDB(criteria, table, shouldMatchAll){   //criteria is {column,value} pair, no checking if column exists
    //console.log(value);
    let promise = new Promise((resolve, reject) => {
        //no error checking for incorrect column

        //build query string
        let linker = (shouldMatchAll)?' AND ':' OR ';
        let queryString = '';
        for(let item in criteria){
            queryString = queryString + item + '=\'' + criteria[item] + '\'' + linker;
        }
        if(queryString == ''){
            queryString = '1=1';
        }else{
            queryString = queryString.substr(0, queryString.length-4);
        }
        //console.log(queryString);
        

        //select query based on column
        pool.query('SELECT * FROM ' + table + ' WHERE ' + queryString, (err, result) => {
            if(err){
                resolve({"error": "in queryDB: " + err});
            }else{
                resolve({"queryResult":result});
            }
        });
    });
    return promise;
}


//<-----------Update transition table in database----------------->
function insertTrans(trans){
    //console.log(trans)
    let promise = new Promise((resolve, reject) => {

        pool.query('INSERT INTO transitions (CatalogNumber,Peptide,istd,Precursor_Ion,MS1_Res,Product_Ion,MS2_Res,Dwell,OptimizedCE,Ion_Name,peptideId,ModificationString,FromFile)' + 
                    ' VALUES (?,?,?,?,?,?,?,?,?,?,?)', 
                    [trans.CatalogNumber,trans.Peptide,trans.istd,trans.Precursor_Ion,trans.MS1_Res,trans.Product_Ion,trans.MS2_Res,trans.Dwell,trans.OptimizedCE,trans.Ion_Name,trans.peptideId,trans.ModificationString,trans.FromFile],
                    (err,result)=>{
                        if(err){
                            resolve({"error":err});
                        }else{
                            resolve({"insertID":result.insertId});
                        }
                    });

    });
    return promise;
}

function updateTrans(trans, id){
    let promise = new Promise((resolve, reject) => {
        //no check of the id
        pool.query('UPDATE transitions SET ' + 
                   'CatalogNumber=?,Peptide=?,istd=?,Precursor_Ion=?,MS1_Res=?,Product_Ion=?,MS2_Res=?,Dwell=?,OptimizedCE=?,Ion_Name=?,peptideId=?,Modificationstring=?,FromFile=?' + 
                   ' WHERE id=' + id,
                   [
                    trans.CatalogNumber,
                    trans.Peptide,
                    trans.istd,
                    trans.Precursor_Ion,
                    trans.MS1_Res,
                    trans.Product_Ion,
                    trans.MS2_Res,
                    trans.Dwell || 5,
                    trans.OptimizedCE,
                    trans.Ion_Name,
                    trans.peptideId,
                    trans.ModificationString,
                    trans.FromFile 
                   ],(err, result)=>{
                        if(err){
                            resolve({"error":err});
                        }else{
                            resolve({"insertID":result.insertId});
                        }
                   });

    });
    return promise;
}

function addTrans(trans){
    //check if trans already exists in the database, if yes, update; if not, insert
    let promise = new Promise(async (resolve, reject) => {
        let queryResult = await queryDB({CatalogNumber:trans.CatalogNumber,
                                         Peptide:trans.Peptide,
                                         Precursor_Ion:trans.Precursor_Ion,
                                         Product_Ion:trans.Product_Ion}, 'transitions', true);
        if(queryResult['error'] == undefined){
            if(queryResult['queryResult'].length == 0){  //no entry found in transitions table
                let insertResult = await insertTrans(trans);
                resolve(insertResult);
            }else{  //entry found, update
                let updateResult = await updateTrans(trans, queryResult['queryResult'][0].id);
                resolve(updateResult);
            }
        }else{
            resolve({'error':queryResult['error']});
        }
    });
    return promise;
}
//<------------End update transition table functions--------------->


//<-----------Update heavy peptide table in database----------------->
function insertNewPeptide(peptideInfo){
    let promise = new Promise((resolve, reject) => {
        pool.query('INSERT INTO heavypeptide_info (AccessionNumber,CatalogNumber,ProteinSymbol,Peptide,PeptideType,PeptideQuality,InStock,StorageLocation,UniprotAccession,GeneSymbol,Species,ProteinName)' + 
                        ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                        [
                           peptideInfo.AccessionNumber || '',
                           peptideInfo.CatalogNumber,
                           peptideInfo.ProteinSymbol || '',
                           peptideInfo.Peptide,
                           peptideInfo.PeptideType || 'heavy',
                           peptideInfo.PeptideQuality || '',
                           peptideInfo.InStock || 'unknown',
                           peptideInfo.StorageLocation || 'unknown',
                           peptideInfo.UniprotAccession || '',
                           peptideInfo.GeneSymbol || '',
                           peptideInfo.Species || '',
                           peptideInfo.Proteinname || ''
                        ],async (err,result)=>{
                            if(err){
                                resolve({'error':'in insertNewPeptide'+err});
                            }else{
                                //need to insert M:M relationship
                                for(let i = 0; i < peptideInfo.Modification.length; i++){
                                    let updateMMresult = await updatePeptideModRelationship(result.insertId, peptideInfo.Modification[i].id, peptideInfo.Modification[i].Position);
                                    //console.log(updateMMresult);
                                    //console.log("yeah" + i);
                                }
                                resolve(result.insertId);
                            }
                        });
    }); 
    return promise;
}

function updatePeptide(newPeptideInfo, oldPeptideInfo){
    let promise = new Promise((resolve, reject) => {
        //peptideId is valid by assumption
        pool.query('UPDATE heavypeptide_info SET ' + 
                   'AccessionNumber=?,CatalogNumber=?,ProteinSymbol=?,Peptide=?,PeptideType=?,PeptideQuality=?,InStock=?,StorageLocation=?,UniprotAccession=?,GeneSymbol=?,Species=?,ProteinName=?' +
                   ' WHERE id=' + oldPeptideInfo.id,
                   [
                    newPeptideInfo.AccessionNumber || oldPeptideInfo.AccessionNumber,
                    newPeptideInfo.CatalogNumber,
                    newPeptideInfo.ProteinSymbol || oldPeptideInfo.ProteinSymbol,
                    newPeptideInfo.Peptide,
                    newPeptideInfo.PeptideType || oldPeptideInfo.PeptideType,
                    newPeptideInfo.PeptideQuality || oldPeptideInfo.PeptideQuality,
                    newPeptideInfo.InStock || oldPeptideInfo.InStock,
                    newPeptideInfo.StorageLocation || oldPeptideInfo.StorageLocation,
                    newPeptideInfo.UniprotAccession || oldPeptideInfo.UniprotAccession,
                    newPeptideInfo.GeneSymbol || oldPeptideInfo.GeneSymbol,
                    newPeptideInfo.Species || oldPeptideInfo.Species,
                    newPeptideInfo.ProteinName || oldPeptideInfo.ProteinName
                   ],async (err, result)=>{
                       if(err){
                           resolve({"error": 'in updatePeptide: ' + err});
                       }else{
                           //need to delete old M:M relationship and add new M:M relationship
                           let deleteResult = await deletePeptideModRelationship(oldPeptideInfo.id);

                           if(deleteResult.error !== undefined){
                               resolve({'error': 'in updatePeptide: heavypeptide_info updated but M:M update error-' + deleteResult['error']});
                           }else{

                                for(let i = 0; i < newPeptideInfo.Modification.length; i++){
                                        let updateMMresult = await updatePeptideModRelationship(oldPeptideInfo.id, newPeptideInfo.Modification[i].id, newPeptideInfo.Modification[i].Position);
                                        //console.log(updateMMresult);
                                        //console.log("yeah" + i);
                                    }

                                resolve({"updateID":oldPeptideInfo.id});
                            }
                       }
                   })
    });
    return promise;
}

function addPeptideInfo(peptideInfo){
    let promise = new Promise(async (resolve, reject) => {
        let queryResult = await queryDB({'CatalogNumber':peptideInfo.CatalogNumber}, 'heavypeptide_info', true);
        if(queryResult['error'] !== undefined){
            resolve({'error':'in addPeptideInfo'+queryResult['error']});
        }
        else if (queryResult['queryResult'].length == 0){
            //insert new peptide info
            let insertResult = await insertNewPeptide(peptideInfo);
            resolve(insertResult);
        }else{
            let updateResult = await updatePeptide(peptideInfo, queryResult['queryResult'][0]);
            resolve(updateResult.updateID);  //modify to check for error if wanted
        }
    });
    return promise;
}
//<-----------End Update heavy peptide table in database----------------->


//<-----------Update peptide-modification table in database----------------->
function deletePeptideModRelationship(peptideId){
    let promise = new Promise(async (resolve, reject)=>{
        let queryResult = await queryDB({peptideId:peptideId}, 'peptides_modifications', true);
        if(queryResult['error'] !== undefined){
            resolve({'error': 'in deletePeptideModRelationship ' + queryResult['error']});
        }else if(queryResult['queryResult'].length == 0){
            //not found, no need to delete
            resolve({'done': 'no entry in db'});
        }else{
            //some entries exists
            pool.query('DELETE FROM peptides_modifications WHERE peptideId = ?', [peptideId], (err, rows) =>{
                if(err){
                    resolve({'error': 'in DELETE deletePeptideModRelationship ' + err});
                }else{
                    //console.log(rows);
                    resolve({'done' : 'delete existing entries'});
                }
            });
        }
    });
    return promise;
}

function updatePeptideModRelationship(peptideId, modId, modPosition){
    let promise = new Promise(async (resolve, reject) => {
        //console.log({peptideId:peptideId,modificationId:modId,modPosition:modPosition});
        let queryResult = await queryDB({peptideId:peptideId,modificationId:modId,modPosition:modPosition}, 'peptides_modifications', true);
        if(queryResult['error'] !== undefined){
            resolve({'error':'in updatePeptideModRelationship'+queryResult['error']});
        }else if (queryResult['queryResult'].length == 0){
            //not found, insert relationship
            pool.query('INSERT INTO peptides_modifications (peptideId, modificationId, modPosition) VALUES (?,?,?)', 
                        [peptideId, modId, modPosition], (err, result) => {
                            if(err){
                                resolve({'error' : 'in updatePeptideModRelationship ' + err });
                            }else{
                                resolve({"insertID":result.insertId});
                            }
                        });
        }else{
            resolve(queryResult);
        }
    });
    return promise;
}
//<-----------End Update peptide-modification table in database----------------->


//<-----------Extract Modification information from a modification string----------------->
function getModificationId(peptide, modificationString){
    const spaceRgx = /\s/gi;
    modificationString = modificationString.replace(spaceRgx,'');
    let result = {modification:[], PeptideType:'light'};
    let promise = new Promise(async (resolve, reject) => {
        //two types: C2(CAM);R14(heavy) or CAM|15

        //find out which type
        let type = "transListType"
        let testIfPeptideInfoType = /[\(]/gi;
        if (testIfPeptideInfoType.test(modificationString)){
            type = "peptideInfoType";
        }

        if(type == "transListType"){
            let mods = modificationString.split('|')
            for(let i = 0; i < mods.length; i++){
                let Modification = "";
                const capturingRegex = /^\d+$/;   //number only
                if(capturingRegex.test(mods[i])){
                    Modification = 'Heavy' + peptide.charAt(mods[i]-1);
                }else if(mods[i] == 'CAM'){  //not a number, then CAM  (other options need to be added manually)
                    Modification = 'CAM';
                }
                //get the modification id
                if(Modification != ""){
                    let queryResult = await queryDB({'Modification': Modification}, 'modifications', true);
                    //console.log(queryResult);

                    if(Modification == 'CAM'){
                        for(let i = 0; i < peptide.length; i++){
                            if(peptide.charAt(i) == 'C'){
                                result['modification'].push({
                                    id: queryResult['queryResult'][0].id,
                                    Modification: queryResult['queryResult'][0].Modification,
                                    TargetedSite: queryResult['queryResult'][0].TargetedSite,
                                    ModificationType: queryResult['queryResult'][0].ModificationType,
                                    Position: i+1
                                });
                            }
                        }
                    }else if (Modification == 'Heavy' + peptide.charAt(mods[i]-1)){
                        result['modification'].push({
                            id: queryResult['queryResult'][0].id,
                            Modification: queryResult['queryResult'][0].Modification,
                            TargetedSite: queryResult['queryResult'][0].TargetedSite,
                            ModificationType: queryResult['queryResult'][0].ModificationType,
                            Position: Number(mods[i])
                        });
                        result['PeptideType'] = 'heavy';
                    }
                }
            }
        }else{
            let mods = modificationString.split(';');
            for(let i = 0; i < mods.length; i++){
                const extractInfo = /(?<aminoAcid>[A-Z])(?<Position>\d+)\((?<Modification>\w+)\)/
                if(extractInfo.test(mods[i])){
                    const found = mods[i].match(extractInfo);
                    //console.log(found.groups.Modification);
                    let Modification = found.groups.Modification;
                    if(Modification.toUpperCase() == 'HEAVY'){
                        Modification = 'Heavy' + found.groups.aminoAcid;
                        result['PeptideType'] = 'heavy';
                    }

                    Modification = (found.groups.Modification == 'PO3H2')?'Pho'
                                    + found.groups.aminoAcid:Modification;
                    let queryResult = await queryDB({'Modification': Modification}, 'modifications', true);
                    result['modification'].push({
                        id: queryResult['queryResult'][0].id,
                        Modification: queryResult['queryResult'][0].Modification,
                        TargetedSite: queryResult['queryResult'][0].TargetedSite,
                        ModificationType: queryResult['queryResult'][0].ModificationType,
                        Position: found.groups.Position
                    });
                    
                }
            }
        }
        resolve(result);
    });
    return promise; //result is {modification:[{id:,Modification:,TargetedSite:,ModificationType:,Position:}]}
}
//<-----------End Extract Modification information from a modification string----------------->


//<-----------Reading/Storing Peptide information from Uniprot Database----------------->
function digestProtein(enyzme, proteinSeq, aaLowerLimit,aaUpperLimit){
    let promise = new Promise((resolve, reject) => {
        //return a list of peptides, proteinSeq must be uppercase
        let peptideList =[];

        let cutSite = '';
        let ignoreIfNext = '';
        if(enyzme == 'Trypsin'){
            cutSite = ['K','R'];
            ignoreIfNext = ['P'];
        }

        if(cutSite != ''){
            let previousAA = 0;
            for (let i = 0; i < proteinSeq.length-1; i++){
                if(cutSite.includes(proteinSeq.charAt(i))){
                    if(!ignoreIfNext.includes(proteinSeq.charAt(i+1))){
                        //save this peptide
                        let curPeptide = proteinSeq.substr(previousAA, (i-previousAA+1));
                        if(curPeptide.length >= aaLowerLimit && curPeptide.length <= aaUpperLimit){
                            peptideList.push(curPeptide);
                        }
                        previousAA = i+1;
                    }
                }
            }
            //add the last peptide
            let lastPeptide = proteinSeq.substr(previousAA, (proteinSeq.length-previousAA));
            if(lastPeptide.length >= aaLowerLimit && lastPeptide.length <= aaUpperLimit){
                peptideList.push(lastPeptide);
            }
            
        }
        resolve(peptideList);
    });
    return promise;
}

/*
function addPeptideMetaData(peptide){
    let promise = new Promise(async (resolve, reject) => {
        //peptide is key:value object
        //{uniprotAccession,Peptide,Species,GeneSymbol,EnzymeUsed}, Species and GeneSymbol optional
        let queryResult = await queryDB({
                                  'UniprotAccession':peptide.UniprotAccession,
                                  'Peptide' : peptide.Peptide,
                                  'Species' : peptide.Species,
                                  'GeneSymbol' : peptide.GeneSymbol,
                                  'EnzymeUsed' : peptide.EnzymeUsed
                                  }, 'peptide_information', true);
        
        if(queryResult['error'] !== undefined){
            resolve({'error' : queryResult['error']});
        }else{
            if(queryResult['queryResult'].length == 0){
                //insert the peptide metadata
                pool.query('INSERT INTO peptide_information (UniprotAccession,Peptide,Species,GeneSymbol,EnzymeUsed,ProteinName) VALUES (?,?,?,?,?,?)',
                          [peptide.UniprotAccession,peptide.Peptide,peptide.Species,peptide.GeneSymbol,peptide.EnzymeUsed,peptide.ProteinName],
                          (err, result) => {
                              if(err){
                                  resolve({'error' : err});
                              }else{
                                  resolve({"insertID":result.insertId});
                              }
                          });
            }else{
                resolve({'insertId' : queryResult['queryResult']});
            }
        }
    });
    return promise;
}*/

function hashPeptide(peptide){
    let limit = 500;  //500 hash value
    let sum = 0;
    for(let i = 0; i < peptide.length; i++){
        sum += peptide.toUpperCase().charCodeAt(i);
    }
    return sum % limit;
}

function addPeptideMetaDataToJSON(peptide, allPepInfo){
    let peptideHash = hashPeptide(peptide.Peptide);
    //add to allPepInfo, check if it is by reference
    let curPeptideInfo = {
        Species:peptide.Species,
        GeneSymbol:peptide.GeneSymbol,
        EnzymeUsed:peptide.EnzymeUsed,
        ProteinName:peptide.ProteinName
    }

    if(!allPepInfo.hasOwnProperty(peptideHash)){
        allPepInfo[peptideHash] = {};
    }

    if(!allPepInfo[peptideHash].hasOwnProperty(peptide.Peptide)){
        allPepInfo[peptideHash][peptide.Peptide] = {};
    }

    allPepInfo[peptideHash][peptide.Peptide][peptide.UniprotAccession] = curPeptideInfo;

}

function isFileExists(filePath, linesArr){
    let promise = new Promise((resolve, reject) => {
        let fs = require('fs');
        let es = require('event-stream');
        let totalLine = 0;
        let s = fs.createReadStream(filePath)
                .on('error', function(err){
                    console.log('File not found');
                    resolve(false);
                })
                .pipe(es.split()) //split by \n
                .pipe(
                    es
                    .mapSync(function(line){
                        totalLine++;

                        if(totalLine % 100 == 0){
                            console.log('read ' + totalLine + ' lines');
                        }

                        if(line != ''){
                            linesArr.push(line);
                        }
                        
                    })
                    .on('error', function(err){
                        console.log('Error while reading file.',err);
                        resolve(false);
                    })
                    .on('end', function(){
                        //when done reading file, perform these actions
                        console.log('isFileExists',totalLine);
                        resolve(true);
                    })
                );  

    })
    return promise;
}

function saveJSONToFile(allPeptideInfo, dbName){
    let promise = new Promise(async (resolve, reject) => {
        try{
            let fs = require('fs');
            //for now, it will rewrite the database, combining with the old information, even if it is duplicate

            //let lines = [];
            let flag = {flags:'w'};
            /*
            if(await isFileExists(path.join('./public/database/' + dbName),lines)){
                flag.flags = 'a';
            }else{
                lines = [];
            }*/

            let ws = fs.createWriteStream(path.join('./public/database/' + dbName),flag);
            for(let key in allPeptideInfo){
                let thisObj = {};
                thisObj[key] = allPeptideInfo[key];
                //let curLine = JSON.stringify(thisObj);
                //if(!lines.includes(curLine)){
                    ws.write(JSON.stringify(thisObj));
                    ws.write('\n');
                //}
            }
            ws.end();
            resolve("Database saved!");
        }
        catch(err){
            console.log(err);
            resolve(err);
        }
    });
    return promise;
}

function readJSONToFile(dbName){
    let promise = new Promise((resolve, reject) => {
        try{
            let fs = require('fs');
            let es = require('event-stream');
            let filePath = path.join('./public/database/' + dbName);
            let result = {};
            let totalLine = 0;

            let s = fs.createReadStream(filePath)
                    .on('error', function(err){
                        console.log('File not found');
                        resolve({'error':err});
                    })
                    .pipe(es.split()) //split by \n
                    .pipe(
                        es
                          .mapSync(function(line){
                              totalLine++;

                              if(totalLine % 100 == 0){
                                  console.log('read ' + totalLine + ' lines');
                              }

                              if(line != ''){
                                let thisObj = JSON.parse(line);
                                for(let key in thisObj){
                                    result[key] = thisObj[key];
                                }
                              }
                          })
                          .on('error', function(err){
                              console.log('Error while reading file.',err);
                              resolve({'error':err});
                          })
                          .on('end', function(){
                              //when done reading file, perform these actions
                              console.log('readline',totalLine);
                              resolve(result);
                          })
                    );
        }
        catch(err){
            console.log(err);
            resolve({"error":err});
        }
    });
    return promise;
}
//<-----------End Reading/Storing Peptide information from Uniprot Database----------------->


//This function retrieves and combines uniprot information for a peptide, returns an object
function retrieveUniprotInfo(peptide, allPeptideInfo){
    //return object
    let result = {
        Species: '',
        GeneSymbol: '',
        UniprotAccession: '',
        ProteinName: ''
    }

    let peptideHash = hashPeptide(peptide);
    if(allPeptideInfo.hasOwnProperty(peptideHash)){
        if(allPeptideInfo[peptideHash].hasOwnProperty(peptide)){
            for(let key in allPeptideInfo[peptideHash][peptide]){
                result.Species = result.Species + '|' + allPeptideInfo[peptideHash][peptide][key].Species;
                result.GeneSymbol = result.GeneSymbol + '|' + allPeptideInfo[peptideHash][peptide][key].GeneSymbol;
                result.UniprotAccession = result.UniprotAccession + '|' + key;
                result.ProteinName = result.ProteinName + '|' + allPeptideInfo[peptideHash][peptide][key].ProteinName;
            }
            result.Species = result.Species.substr(1,result.Species.length-1);
            result.GeneSymbol = result.GeneSymbol.substr(1,result.GeneSymbol.length-1);
            result.UniprotAccession = result.UniprotAccession.substr(1,result.UniprotAccession.length-1);
            result.ProteinName = result.ProteinName.substr(1,result.ProteinName.length-1);
        }
    }
    return result;
}

//This function extracts the proteinname/geneSymbol etc from a uniprot protein name in the .fasta
function retrieveProteinMetaData(proteinLine, enzymeUsed){
    //this is for uniprot only
    let proteinMeta = {
        UniprotAccession : '',
        Peptide : '',
        Species : '',
        GeneSymbol : '',
        EnzymeUsed : enzymeUsed,
        ProteinName : ''
    }

    //split the line by |
    let firstSplit = proteinLine.split('|');
    proteinMeta.UniprotAccession = firstSplit[1];
    
    //split the line by =
    let secondSplit = firstSplit[firstSplit.length-1].split('=');
    let extractedData = {
        ProteinName : secondSplit[0].substr(0,secondSplit[0].length-3),
        OS : '',
        OX : '',
        GN : '',
        PE : '',
        SV : ''
    }
    
    for(let i = 1; i < secondSplit.length; i++){
        let curKey = secondSplit[i-1].substr(secondSplit[i-1].length-2,2);

        let curVal = (i != secondSplit.length-1)?secondSplit[i].substr(0,secondSplit[i].length-3):secondSplit[i];
        extractedData[curKey] = curVal;

    }

    proteinMeta.Species = extractedData.OS || '';
    proteinMeta.GeneSymbol = extractedData.GN || '';
    proteinMeta.ProteinName = extractedData.ProteinName || '';

    return proteinMeta;

}

function isValidateFile(headerArr, fileHeaderLine, headerKey){
    let fileHeaders = fileHeaderLine.split(',');

    let inHeader = [];

    for(let i = 0; i < fileHeaders.length; i++){
        if(headerArr.includes(fileHeaders[i]) && !inHeader.includes(fileHeaders[i])){
            inHeader.push(fileHeaders[i]);
        }
    }

    if(inHeader.length < headerArr.length){
        return false;
    }

    //build headerKey
    for(let i = 0; i < headerArr.length; i++){
        headerKey[headerArr[i]] = fileHeaders.indexOf(headerArr[i]);
    }
    
    return true;
}

//<-----------Update database Peptide information with Uniprot database information----------------->
async function updateWithUniprotInfo(peptideInfoArr){
    //read and update peptideInfo with unipro information
    //upload information to sql database
    console.log("updateWithUniprotInfo");
    //read masterDB
    let allPeptideInfo = await readJSONToFile('masterDB');
    if(!(allPeptideInfo['error'] === undefined)){
        console.log("updateWithUniprotInfo:",allPeptideInfo['error']);
        allPeptideInfo = {};
    }else{
        for(let i = 0; i < peptideInfoArr.length; i++){
            console.log("updating ",peptideInfoArr[i].Peptide);
            let curDBinfo = retrieveUniprotInfo(peptideInfoArr[i].Peptide, allPeptideInfo);
            peptideInfoArr[i].UniprotAccession = curDBinfo.UniprotAccession;
            peptideInfoArr[i].GeneSymbol = curDBinfo.GeneSymbol;
            peptideInfoArr[i].Species = curDBinfo.Species;
            peptideInfoArr[i].ProteinName = curDBinfo.ProteinName;
            await addPeptideInfo(peptideInfoArr[i]);
        }
        console.log("updateWithUniprotInfo: Done");
    }

}
//<-----------End Update database Peptide information with Uniprot database information----------------->


//Different upload routes
router.post('/uploadProteinDB', (req,res,next) => {

    upload(req, res, async function (err){
        if(err){
            res.send({status: err});
            console.log(err);
        }else{
            console.log("Protein db uploaded!");
            console.log("reading file");
            let lines = fs.readFileSync(req.file.path, 'utf-8').split('\n').filter(Boolean);  //Uniprot database only
            
            let curSeq = '';
            let curProteinMetaData = {};
            let proteinCt = 0;
            let allPeptideInfo = await readJSONToFile('masterDB');
           
            if(!(allPeptideInfo['error'] === undefined)){
                //res.send({"error":allPeptideInfo.error});
                allPeptideInfo = {};
            }
            for(let i = 0; i < lines.length; i++){
                if(lines[i].charAt(0) == '>'){
                    if(proteinCt != 0){
                        let pepList = await digestProtein('Trypsin', curSeq, 5, 50);
                        //console.log(pepList);
                        for(let j = 0; j < pepList.length; j++){
                            curProteinMetaData.Peptide = pepList[j];
                            //let insertPeptide = await addPeptideMetaData(curProteinMetaData);
                            //console.log(insertPeptide);
                            addPeptideMetaDataToJSON(curProteinMetaData,allPeptideInfo);
                        }
                    }
                    curSeq = '';
                    curProteinMetaData = retrieveProteinMetaData(lines[i],'Trypsin');
                    proteinCt = proteinCt + 1;
                }else{
                    curSeq = curSeq + lines[i].toUpperCase();
                }
                if(proteinCt % 1000 == 0){
                    console.log(proteinCt);
                }
            }
            
            //for the last protein
            let finalPepList = await digestProtein('Trypsin', curSeq, 5, 50);
            for (let i = 0; i < finalPepList.length; i++){
                
                curProteinMetaData.Peptide = finalPepList[i];
                //let finalInsert = await addPeptideMetaData(curProteinMetaData);
                //console.log(finalInsert);
                addPeptideMetaDataToJSON(curProteinMetaData,allPeptideInfo);
            }

            //write JSON to file
            let writeJSONresult = await saveJSONToFile(allPeptideInfo, 'masterDB');
            res.send({status:writeJSONresult});
            //console.log(allPeptideInfo);
            console.log('proteinct: ' + proteinCt);    
            //console.log(retrieveUniprotInfo("GEYLPLLQGK",allPeptideInfo));          
        }
    });
});


router.post('/uploadTrans', async (req,res,next) => {

    upload(req, res, async function (err){
        let finalResult = {};
        if(err){
            res.send({status: err});
            console.log(err)
        }else{
            
            //console.log(req.file);
            console.log("file uploaded!");
            console.log("reading file");

            let lines = fs.readFileSync(req.file.path, 'utf-8').split('\r\n').filter(Boolean);  //this is limited to 2GB

            let headerKey = {};
            let headerArr = uploadFileHeaders.transFile;

            if(isValidateFile(headerArr,lines[0],headerKey)){
                //console.log(headerKey);

                //check if the file is valid should be performed here
                let linesArr = []
                for(let i = 0; i < lines.length-1; i++){
                    let curLine = lines[i+1].split(',');
                    linesArr.push({
                        CatalogNumber: curLine[headerKey[headerArr[0]]],
                        Peptide: curLine[headerKey[headerArr[1]]].toUpperCase(),
                        istd: curLine[headerKey[headerArr[2]]],
                        Precursor_Ion: parseFloat(curLine[headerKey[headerArr[3]]]),
                        MS1_Res: curLine[headerKey[headerArr[4]]],
                        Product_Ion: parseFloat(curLine[headerKey[headerArr[5]]]),
                        MS2_Res: curLine[headerKey[headerArr[6]]],
                        Dwell: Number(curLine[headerKey[headerArr[7]]]),
                        OptimizedCE: parseFloat(curLine[headerKey[headerArr[9]]]),
                        Cell_Accelerator_Voltage: Number(curLine[headerKey[headerArr[10]]]),
                        Ion_Name: curLine[headerKey[headerArr[11]]],
                        FromFile: req.file.filename,
                        ModificationString: curLine[headerKey[headerArr[12]]]
                    });

                    let modInfo = await getModificationId(linesArr[i].Peptide,linesArr[i].ModificationString);
                    linesArr[i].Modification = modInfo.modification;
                    linesArr[i].PeptideType = modInfo.PeptideType;
                    linesArr[i].peptideId = await addPeptideInfo(linesArr[i]);

                }
                
                for(let i=0; i < linesArr.length; i++){
                    let result = await addTrans(linesArr[i]);
                    if(result.error !== undefined){
                        console.log("error uploading trans:",result.error);
                        if(!finalResult.hasOwnProperty('error')){
                            finalResult.error = [];
                        }
                        finalResult.error.push("line " + i + " " + result.error);
                    }
                }
                finalResult.status = "Trans added, info will be updated shortly";
                if(finalResult.error !== undefined){
                    finalResult.status ="Error uploading transitions! Check server for more information!";
                }
                updateWithUniprotInfo(linesArr);
                res.send(finalResult);
                console.log(finalResult);
                console.log('done')
            }else{
                res.send({status:'Not a valid Transition file, please check!'});
                fs.unlink(req.file.path,()=>{});
            }
        }
    })
});


router.post('/uploadNewPeptide', async (req,res,next) => {

    upload(req, res, async function (err){
        let finalResult = {};
        if(err){
            res.send({status: err});
            console.log(err)
        }else{
            try{         
                //console.log(req.file);
                console.log("file uploaded!");
                console.log("reading file");

                let lines = fs.readFileSync(req.file.path, 'utf-8').split('\r\n').filter(Boolean);

                let headerKey = {};
                let headerArr = uploadFileHeaders.peptideFile;
                
                if(isValidateFile(headerArr,lines[0],headerKey)){
                    //check if the file is valid should be performed here
                    let linesArr = []
                    for(let i = 0; i < lines.length-1; i++){
                        let curLine = lines[i+1].split(',');
                        linesArr.push({
                            AccessionNumber: curLine[headerKey[headerArr[0]]],
                            CatalogNumber: curLine[headerKey[headerArr[1]]],
                            ProteinSymbol: curLine[headerKey[headerArr[2]]],
                            Peptide: curLine[headerKey[headerArr[3]]].toUpperCase(),
                            PeptideType: curLine[headerKey[headerArr[5]]],
                            PeptideQuality: curLine[headerKey[headerArr[6]]],
                            
                        });
                        
                        let modInfo = await getModificationId(linesArr[i].Peptide,curLine[headerKey[headerArr[7]]]);
                        //console.log(modInfo);
                        linesArr[i].Modification = modInfo.modification;
                        //linesArr[i].PeptideType = modInfo.PeptideType;
                        linesArr[i].peptideId = await addPeptideInfo(linesArr[i]);
                    }
                    finalResult.status = "Peptides added, info will be updated shortly";
                    updateWithUniprotInfo(linesArr);
                    res.send(finalResult);
                    console.log('done')
                }else{
                    res.send({status:'Not a valid peptide file, please check!'});
                    fs.unlink(req.file.path,()=>{});
                }
            }
            catch(err){
                res.send({status:err});
            }
        }
    })
});

router.post('/sampleTemplate', (req,res,next) => {
    
    let headerArr = uploadFileHeaders.transFile;
    let sampleEntry = uploadFileHeaders.transEx;
    let filename = 'SampleTransFile.csv';
    if(req.body.fileType == 'peptide'){
        headerArr = uploadFileHeaders.peptideFile;
        sampleEntry = uploadFileHeaders.peptideEx;
        filename = 'SamplePeptideFile.csv';
    }
    try{
        let lineToWrite = '';
        headerArr.forEach((header)=>{
            lineToWrite = lineToWrite + ',' + header;
        });
        lineToWrite = lineToWrite.substr(1,lineToWrite.length-1);

        let sampleToWrite = '';
        sampleEntry.forEach((item)=>{
            sampleToWrite = sampleToWrite + ',' + item;
        })
        sampleToWrite = sampleToWrite.substr(1,sampleToWrite.length-1);
        
        lineToWrite = lineToWrite + '\n' + sampleToWrite;

        fs.writeFileSync(path.join('./public/download/' + filename), lineToWrite, 'utf8');

        res.send({filelink:path.join('/download/' + filename)});
    }catch(err){
        res.send({"error":err});
    }
    
});

module.exports = router;