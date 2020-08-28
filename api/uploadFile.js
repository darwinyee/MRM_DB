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
        if(ext != '.csv'){
            return cb(new Error('.csv Only!'));
        }
        cb(null, true);
    }
}).single('uploadTrans')


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
        pool.query('INSERT INTO heavypeptide_info (AccessionNumber,CatalogNumber,ProteinSymbol,Peptide,PeptideType,PeptideQuality,InStock,StorageLocation)' + 
                        ' VALUES (?,?,?,?,?,?,?,?)',
                        [
                           peptideInfo.AccessionNumber || '',
                           peptideInfo.CatalogNumber,
                           peptideInfo.ProteinSymbol || '',
                           peptideInfo.Peptide,
                           peptideInfo.PeptideType || 'heavy',
                           peptideInfo.PeptideQuality || '',
                           peptideInfo.InStock || 'unknown',
                           peptideInfo.StorageLocation || 'unknown'
                        ],async (err,result)=>{
                            if(err){
                                resolve({'error':'in insertNewPeptide'+err});
                            }else{
                                //need to insert M:M relationship
                                for(let i = 0; i < peptideInfo.Modification.length; i++){
                                    let updateMMresult = await updatePeptideModRelationship(result.insertId, peptideInfo.Modification[i].id, peptideInfo.Modification[i].Position);
                                    console.log(updateMMresult);
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
                   'AccessionNumber=?,CatalogNumber=?,ProteinSymbol=?,Peptide=?,PeptideType=?,PeptideQuality=?,InStock=?,StorageLocation=?' +
                   ' WHERE id=' + oldPeptideInfo.id,
                   [
                    newPeptideInfo.AccessionNumber || oldPeptideInfo.AccessionNumber,
                    newPeptideInfo.CatalogNumber,
                    newPeptideInfo.ProteinSymbol || oldPeptideInfo.ProteinSymbol,
                    newPeptideInfo.Peptide,
                    newPeptideInfo.PeptideType || oldPeptideInfo.PeptideType,
                    newPeptideInfo.PeptideQuality || oldPeptideInfo.PeptideQuality,
                    newPeptideInfo.InStock || oldPeptideInfo.InStock,
                    newPeptideInfo.StorageLocation || oldPeptideInfo.StorageLocation
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
                                        console.log(updateMMresult);
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
                    console.log(rows);
                    resolve({'done' : 'delete existing entries'});
                }
            });
        }
    });
    return promise;
}

function updatePeptideModRelationship(peptideId, modId, modPosition){
    let promise = new Promise(async (resolve, reject) => {
        console.log({peptideId:peptideId,modificationId:modId,modPosition:modPosition});
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


//routes
router.post('/uploadTrans', (req,res,next) => {
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

                let modInfo = await getModificationId(curLine[1].toUpperCase(),curLine[12]);
                //console.log(modInfo);
                linesArr[i].Modification = modInfo.modification;
                linesArr[i].PeptideType = modInfo.PeptideType;
                linesArr[i].peptideId = await addPeptideInfo(linesArr[i]);
            }
            
            for(let i=0; i < linesArr.length; i++){
                let result = await addTrans(linesArr[i]);
                console.log(result);
            }

            //console.log(linesArr);

            console.log('done')
        }
    })
});


router.post('/uploadDB', (req,res,next) => {
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
                    AccessionNumber: curLine[0],
                    CatalogNumber: curLine[1],
                    ProteinSymbol: curLine[2],
                    Peptide: curLine[3].toUpperCase(),
                    PeptideType: curLine[5],
                    PeptideQuality: curLine[6],
                    
                });
                console.log(curLine[7]);
                let modInfo = await getModificationId(curLine[3].toUpperCase(),curLine[7]);
                //console.log(modInfo);
                linesArr[i].Modification = modInfo.modification;
                //linesArr[i].PeptideType = modInfo.PeptideType;
                linesArr[i].peptideId = await addPeptideInfo(linesArr[i]);
            }

            //console.log(linesArr);

            console.log('done')
        }
    })
});

module.exports = router;