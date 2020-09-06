const express = require('express');
const router = express.Router();
const pool = require('../dbcon.js').pool;
const path = require('path');
const fileHeaders = require('../importFileHeaders.js').fileHeaders;


function reformatOutput(result){
    //result is not empty
    let promise = new Promise(async (resolve, reject) => {
        let peptideCt = 0;
        let previousCatNum = "";
        let reformatPeptideInfo = {peptideCount:peptideCt,searchResult:[]};
        let curPeptideInfo = {};
        for(let i = 0; i < result.length; i++){
            let thisPeptide = result[i];
            if(thisPeptide.CatalogNumber != previousCatNum){
                if(peptideCt != 0){
                    reformatPeptideInfo['searchResult'].push(curPeptideInfo);
                }
                curPeptideInfo={
                    'Accession#' : thisPeptide.AccessionNumber,
                    'Catalog#' : thisPeptide.CatalogNumber,
                    'Protein' : thisPeptide.ProteinSymbol,
                    'Peptide' : thisPeptide.Peptide,
                    'Type' : thisPeptide.PeptideType,
                    'Quality' : thisPeptide.PeptideQuality,
                    'In Stock' : thisPeptide.InStock,
                    'Location' : thisPeptide.StorageLocation,
                    'id' : thisPeptide.id,
                    'Modifications' : thisPeptide.Modification + `(${thisPeptide.modPosition})`,
                    'Transitions' : await getTransitionInfo(thisPeptide.id, 'trans'),
                    'Uniprot#' : thisPeptide.UniprotAccession,
                    'Gene Symbol' : thisPeptide.GeneSymbol,
                    'Species' : thisPeptide.Species,
                    'ProteinName' : thisPeptide.ProteinName
                }
                peptideCt = peptideCt + 1;
                previousCatNum = thisPeptide.CatalogNumber;
            }else{
                //update Modifications string
                curPeptideInfo['Modifications'] = curPeptideInfo['Modifications'] + 
                                                    `, ${thisPeptide.Modification}(${thisPeptide.modPosition})`;
            }
        }
        //push the last one
        reformatPeptideInfo['searchResult'].push(curPeptideInfo);
        reformatPeptideInfo['peptideCount'] = peptideCt;
        resolve(reformatPeptideInfo);
    });
    return promise;
    
}

function getTransitionInfo(peptideId, fileType){
    let promise = new Promise((resolve, reject)=>{
        //make sql query to get transition information for a particular peptide.
        let queryString = 'SELECT * FROM heavypeptide_info WHERE id = \'' + peptideId + '\'';
        if(fileType == 'trans'){
            queryString = 'SELECT * FROM transitions WHERE peptideId = \'' + peptideId + '\'';
        }

        pool.query(queryString,(err, result) => {
            if(err){
                resolve({hasData : false});
            }else{  
                if(result.length == 0){
                    resolve({hasData : false});
                }else{
                    resolve({
                        hasData : true,
                        queryResult : result
                    });
                }
            }
        });

    });
    return promise;
}

function saveToFile(trans, fileType){
    let promise = new Promise((resolve, reject) => {
        try{
            let fs = require('fs');

            let filename = 'peptideList' + Date.now() + '.csv';
            
            let headerArr = fileHeaders.fullPeptideFile;
            if(fileType == 'trans'){
                filename = 'translist' + Date.now() + '.csv';
                headerArr = fileHeaders.transFile;
            }
            let pathname = '/download/'+filename;
            let lineToWrite = '';
            headerArr.forEach((item)=>{
                lineToWrite = lineToWrite + ',' + item;
            })
            lineToWrite = lineToWrite.substr(1,lineToWrite.length-1);
            lineToWrite = lineToWrite + '\n';

            //"CatalogNumber,Peptide,istd,Precursor Ion,MS1 Res,Product Ion,MS2 Res,Dwell,Fragmentor,Optimized CE,Cell Accelerator Voltage, Ion Name, Modifications\n";
            for(let i = 0; i < trans.length; i++){
                let curLine = trans[i].AccessionNumber + ',' + trans[i].CatalogNumber + ',' + trans[i].ProteinSymbol + ',' +
                              trans[i].Peptide + ',' + trans[i].PeptideType + ',' + trans[i].PeptideQuality + ',' +
                              trans[i].InStock + ',' + trans[i].StorageLocation + ',' + trans[i].UniprotAccession + ',' +
                              trans[i].GeneSymbol + ',' + trans[i].Species + ',' + trans[i].ProteinName;
                if(fileType == 'trans'){
                    curLine = trans[i].CatalogNumber + ',' + trans[i].Peptide + ',' + trans[i].istd + ',' +
                            trans[i].Precursor_Ion + ',' + trans[i].MS1_Res + ',' + trans[i].Product_Ion + ',' +
                            trans[i].MS2_Res + ',' + trans[i].Dwell + ',' + trans[i].Fragmentor + ',' +
                            trans[i].OptimizedCE + ',' + trans[i].Cell_Accelerator_Voltage + ',' + trans[i].Ion_Name + ',' + trans[i].ModificationString;
                }

                lineToWrite = lineToWrite + curLine + "\n";
            }

            console.log(lineToWrite);
            fs.writeFileSync(path.join('./public/download/' + filename), lineToWrite, 'utf8');
            resolve(pathname);
        }
        catch(err){
            console.log(err);
            resolve(err);
        }
    });
    return promise;
}


router.post('/download', async (req,res,next)=>{
    //req.peptideIds = array of peptide ids
    try{
        let trans = [];
        let fileType = req.body.fileType;
        for (let i = 0; i < req.body.peptideIds.length; i++){
            console.log(req.body.peptideIds[i]);
            let curTrans = await getTransitionInfo(req.body.peptideIds[i], fileType);
            if(curTrans.hasData){
                for (let j = 0; j < curTrans.queryResult.length; j++){
                    trans.push(curTrans.queryResult[j]);
                }
            }
        }
        //console.log(trans);
        let finalFile = await saveToFile(trans, fileType);
        let errRegex = /\.csv/;
        if(errRegex.test(finalFile)){
           res.send({filelink: finalFile});
        }else{
            res.send({"error":finalFile});
        }

    }
    catch(err){
        res.send({"error":err});
    }
});

router.post('/search', (req,res, next) => {
    try{
        //get query string
        console.log(req.body);
        let queryString = req.body.searchTerm;   //set to exact match, search for aid only for now

        if(queryString == ""){
            queryString = "1=1";
        }else{
            let connector = ' LIKE ';
            let searchItem = `'%${req.body.searchTerm}%'`;
            if(req.body.exactMatch){
                connector = ' = ';
                searchItem = `'${req.body.searchTerm}'`;
            }

            queryString = req.body.searchColumn + connector + searchItem;
                 
        }

        pool.query('SELECT h.*, pmm.* FROM heavypeptide_info h LEFT JOIN ' + 
                   '(SELECT pm.peptideId, pm.modPosition, m.Modification FROM peptides_modifications pm INNER JOIN ' +
                   'modifications m ON modificationId = m.id) pmm ON h.id = pmm.peptideId WHERE ' +
                   queryString, async(err, result)=>{
            if(err){
                console.log(err);
                res.send({'error': "SQL Error"});
            }else{
                if(result.length == 0){
                    res.send({'error': "No item found"})
                }else{
                    let finalResult = await reformatOutput(result);
                    
                    res.send(JSON.stringify(finalResult));
                }    
            }
        })
    }catch (err){
        res.status(500).send({'error': err})
    }
});

router.post('/insert', (req,res, next) => {
    try{
        res.send({workInProgress: 'workInProgress'});

        
    }catch (err){
        res.status(500).send({'error': err})
    }
});

module.exports = router;