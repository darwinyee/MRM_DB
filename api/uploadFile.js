const express = require('express')
const router = express.Router();
const pool = require('../dbcon.js').pool;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

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


//promise functions

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
}

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

            //check if written before
            let lines = [];
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
                let curLine = JSON.stringify(thisObj);
                //if(!lines.includes(curLine)){
                    ws.write(JSON.stringify(thisObj));
                    ws.write('\n');
                //}
            }
            ws.end();
            resolve(dbName);
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

            //let lines = fs.readFileSync(path.join('./public/database/' + dbName), 'utf8').split('\n').filter(Boolean);
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
            /*
            for(let i = 0; i < lines.length; i++){
                if(i % 100 == 0){
                    console.log("Reading " + i + ' lines');
                }
                let thisObj = JSON.parse(lines[i]);
                for(let key in thisObj){
                    result[key] = thisObj[key];
                }
            }
            //console.log(result);
            //resolve(JSON.parse(line));
            resolve(result);*/
        }
        catch(err){
            console.log(err);
            resolve({"error":err});
        }
    });
    return promise;
}

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

//routes
router.post('/uploadProteinDB', (req,res,next) => {

    upload(req, res, async function (err){
        if(err){
            res.send({error: err});
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
            res.send({addDBresult:writeJSONresult});
            //console.log(allPeptideInfo);
            console.log('proteinct: ' + proteinCt);    
            //console.log(retrieveUniprotInfo("GEYLPLLQGK",allPeptideInfo));          
        }
    });
});

router.post('/uploadTrans', async (req,res,next) => {
    //read masterDB
    let allPeptideInfo = await readJSONToFile('masterDB');
    if(!(allPeptideInfo['error'] === undefined)){
        console.log(allPeptideInfo['error']);
        allPeptideInfo = {};
    }
    upload(req, res, async function (err){
        if(err){
            res.send({error: err});
            console.log(err)
        }else{
            res.send({upload: "success"});
            //console.log(req.file);
            console.log("file uploaded!");
            console.log("reading file");

            let lines = fs.readFileSync(req.file.path, 'utf-8').split('\r\n').filter(Boolean);

            //check if the file is valid should be performed here
            let linesArr = []
            for(let i = 0; i < lines.length-1; i++){
                let curLine = lines[i+1].split(',');
                linesArr.push({
                    CatalogNumber: curLine[0],
                    Peptide: curLine[1].toUpperCase(),
                    istd: curLine[2],
                    Precursor_Ion: parseFloat(curLine[3]),
                    MS1_Res: curLine[4],
                    Product_Ion: parseFloat(curLine[5]),
                    MS2_Res: curLine[6],
                    Dwell: Number(curLine[7]),
                    OptimizedCE: parseFloat(curLine[9]),
                    Cell_Accelerator_Voltage: Number(curLine[10]),
                    Ion_Name: curLine[11],
                    FromFile: req.file.filename,
                    ModificationString: curLine[12]
                });
                let masterDBinfo = retrieveUniprotInfo(linesArr[i].Peptide,allPeptideInfo);
                linesArr[i].UniprotAccession = masterDBinfo.UniprotAccession;
                linesArr[i].GeneSymbol = masterDBinfo.GeneSymbol;
                linesArr[i].Species = masterDBinfo.Species;
                linesArr[i].ProteinName = masterDBinfo.ProteinName;
                let modInfo = await getModificationId(curLine[1].toUpperCase(),curLine[12]);
                linesArr[i].Modification = modInfo.modification;
                linesArr[i].PeptideType = modInfo.PeptideType;
                linesArr[i].peptideId = await addPeptideInfo(linesArr[i]);

            }
            
            for(let i=0; i < linesArr.length; i++){
                let result = await addTrans(linesArr[i]);
                //console.log(result);
            }

            //console.log(linesArr);

            console.log('done')
        }
    })
});


router.post('/uploadNewPeptide', async (req,res,next) => {
    //read masterDB
    let allPeptideInfo = await readJSONToFile('masterDB');
    if(!(allPeptideInfo['error'] === undefined)){
        console.log(allPeptideInfo['error']);
        allPeptideInfo = {};
    }
    upload(req, res, async function (err){
        if(err){
            res.send({error: err});
            console.log(err)
        }else{
            try{
            
                //console.log(req.file);
                console.log("file uploaded!");
                console.log("reading file");

                let lines = fs.readFileSync(req.file.path, 'utf-8').split('\r\n').filter(Boolean);

                //check if the file is valid should be performed here
                let linesArr = []
                for(let i = 0; i < lines.length-1; i++){
                    let curLine = lines[i+1].split(',');
                    linesArr.push({
                        AccessionNumber: curLine[0],
                        CatalogNumber: curLine[1],
                        ProteinSymbol: curLine[2],
                        Peptide: curLine[3].toUpperCase(),
                        PeptideType: curLine[5],
                        PeptideQuality: curLine[6],
                        
                    });
                    //console.log(curLine[7]);
                    let masterDBinfo = retrieveUniprotInfo(linesArr[i].Peptide,allPeptideInfo);
                    linesArr[i].UniprotAccession = masterDBinfo.UniprotAccession;
                    linesArr[i].GeneSymbol = masterDBinfo.GeneSymbol;
                    linesArr[i].Species = masterDBinfo.Species;
                    linesArr[i].ProteinName = masterDBinfo.ProteinName;
                    let modInfo = await getModificationId(curLine[3].toUpperCase(),curLine[7]);
                    //console.log(modInfo);
                    linesArr[i].Modification = modInfo.modification;
                    //linesArr[i].PeptideType = modInfo.PeptideType;
                    linesArr[i].peptideId = await addPeptideInfo(linesArr[i]);
                }
                res.send({upload: "success"});
            }
            catch(err){
                res.send({"error":err});
            }
            //console.log(linesArr);

            console.log('done')
        }
    })
});

module.exports = router;