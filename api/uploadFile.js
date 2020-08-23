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
        if(ext != '.csv' && ext != '.pdf'){
            return cb(new Error('.csv Only!'));
        }
        cb(null, true);
    }
}).single('uploadTrans')


//promise functions

function queryDB(value, column, table){
    //console.log(value);
    let promise = new Promise((resolve, reject) => {
        //no error checking for incorrect column
        //select query based on column
        pool.query('SELECT * FROM ' + table + ' WHERE ' + column + '=\'' + value + '\'', (err, result) => {
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

        pool.query('INSERT INTO transitions (CatalogNumber,Peptide,istd,Precursor_Ion,MS1_Res,Product_Ion,MS2_Res,Dwell,OptimizedCE,Ion_Name,peptideId)' + 
                    ' VALUES (?,?,?,?,?,?,?,?,?,?,?)', 
                    [trans.CatalogNumber,trans.Peptide,trans.istd,trans.Precursor_Ion,trans.MS1_Res,trans.Product_Ion,trans.MS2_Res,trans.Dwell,trans.OptimizedCE,trans.Ion_Name,trans.peptideId],
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

function insertPeptideInfo(peptideInfo){
    let promise = new Promise(async (resolve, reject) => {
        let queryResult = await queryDB(peptideInfo.CatalogNumber, 'CatalogNumber', 'heavypeptide_info');
        if(queryResult['error'] !== undefined){
            resolve({'error':'in insertPeptideInfo'+queryResult['error']});
        }
        else if (queryResult['queryResult'].length == 0){
            //insert new peptide info
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
                        ],(err,result)=>{
                            if(err){
                                resolve({'error':'in insertPeptideInfo'+err});
                            }else{
                                //need to insert M:M relationship
                                resolve(result.insertId);
                            }
                        });
        }else{
            resolve(result[0].id);
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
                    let queryResult = await queryDB(Modification, 'Modification', 'modifications');
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
                    let queryResult = await queryDB(Modification, 'Modification', 'modifications');
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
            for(let i = 0; i < lines.length; i++){
                let curLine = lines[i].split(',');
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
                    peptideId: 1 //Temp placeholder
                });
                //console.log(await getModificationId(curLine[1].toUpperCase(),curLine[12]));
                let modInfo = await getModificationId(curLine[1].toUpperCase(),curLine[12]);
                linesArr[i].Modification = modInfo.modification;
                linesArr[i].PeptideType = modInfo.PeptideType;
                linesArr[i].peptideId = await insertPeptideInfo(linesArr[i]);
            }
            
            for(let i=1; i < linesArr.length; i++){
                let result = await insertTrans(linesArr[i]);
                console.log(result);
            }

            //console.log(linesArr);

            console.log('done')
        }
    })
});

module.exports = router;