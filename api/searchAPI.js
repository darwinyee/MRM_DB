const express = require('express');
const router = express.Router();
const pool = require('../dbcon.js').pool;
const path = require('path');
const fileHeaders = require('../importFileHeaders.js').fileHeaders;
const peptideMassFunctions = require('../peptideMassFunctions.js').massFunctions;
const ppmLimit = 1;  //to minimize false light transitions generation

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
                    'Transitions' : await getTransitionInfo(thisPeptide.id, 'trans', false),
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

function getTransitionInfo(peptideId, fileType, includeTransDetails){
    let promise = new Promise((resolve, reject)=>{
        //make sql query to get transition information for a particular peptide.
        let queryString = 'SELECT * FROM heavypeptide_info WHERE id = \'' + peptideId + '\'';
        if(fileType == 'trans'){
            queryString = 'SELECT * FROM transitions WHERE peptideId = \'' + peptideId + '\'';
        }

        pool.query(queryString, async (err, result) => {
            if(err){
                resolve({hasData : false});
            }else{  
                if(result.length == 0){
                    resolve({hasData : false});
                }else{
                    if(fileType == 'trans' && includeTransDetails){
                        //include light transitions if type is trans
                        result = await addLightTrans(result);
                        //console.log(test);
                    }

                    if(!includeTransDetails && fileType == 'trans'){
                        result = "";
                    }

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

function compareTrans(targetedTran, originalTran, ppm){
    //console.log(targetedTran,originalTran);
    try{
        if(peptideMassFunctions.isMatchedMz(targetedTran.Precursor_Ion, originalTran.Precursor_Ion, ppm)){
            if(peptideMassFunctions.isMatchedMz(targetedTran.Product_Ion, originalTran.Product_Ion, ppm)){
                return true;
            }
        }
        return false;
    }catch(err){
        console.log(err);
        return false;
    }
}

function generateTrans(originalTran, modificationList){
    //return an array of trans because sometimes product ions are of very similar masses and cannot be distinguished
    //console.log(originalTran);
    //return a transition object with keys equal columns of transition table
    let newISTD = (originalTran.istd == 'FALSE')?'TRUE':'FALSE';
    let newPrecursor = (originalTran.istd == 'FALSE')?peptideMassFunctions.getPrecursorHeavyMz(originalTran.Peptide,modificationList[originalTran.CatalogNumber],originalTran.Precursor_Ion):
                                            peptideMassFunctions.getPrecursorLightMz(originalTran.Peptide,modificationList[originalTran.CatalogNumber],originalTran.Precursor_Ion);
    let newProduct = (originalTran.istd == 'FALSE')?peptideMassFunctions.getTransHeavyMz(originalTran.Peptide,modificationList[originalTran.CatalogNumber],3,originalTran.Product_Ion,ppmLimit):
                                        peptideMassFunctions.getTransLightMz(originalTran.Peptide,modificationList[originalTran.CatalogNumber],3,originalTran.Product_Ion,ppmLimit); 
    let newProductMz = -1;

    if(Object.keys(newProduct) != 0){
        newProductMz = (originalTran.istd == 'FALSE')?newProduct[Object.keys(newProduct)[0]][Object.keys(newProduct[Object.keys(newProduct)[0]])[0]].heavyMW:
                    newProduct[Object.keys(newProduct)[0]][Object.keys(newProduct[Object.keys(newProduct)[0]])[0]].lightMW;
    }
    

    let newTrans = {
        CatalogNumber: originalTran.CatalogNumber,
        Peptide: originalTran.Peptide,
        istd: newISTD,
        Precursor_Ion: newPrecursor,
        MS1_Res: originalTran.MS1_Res,
        Product_Ion: newProductMz,
        MS2_Res: originalTran.MS2_Res,
        Dwell: originalTran.Dwell,
        Fragmentor: originalTran.Fragmentor,
        OptimizedCE: originalTran.OptimizedCE,
        Cell_Accelerator_Voltage: originalTran.Cell_Accelerator_Voltage,
        Ion_Name: originalTran.Ion_Name,
        peptideId: originalTran.peptideId,
        ModificationString: originalTran.ModificationString,
        FromFile: 'Calculated by Server'
    };
    //console.log(newTrans);
    return newTrans;

}

function addLightTrans(queryResult){
    let promise = new Promise(async (resolve, reject) => {

        let result = [];
        let transObj = {};  //{CatalogNumber : [{light:,heavy:}]}
        let catalogNumberModList = {};
        if(queryResult.length > 0){
            //get all the catalogNumber and modifications
            for(let i = 0; i < queryResult.length; i++){
                if(!catalogNumberModList.hasOwnProperty(queryResult[i].CatalogNumber)){
                    catalogNumberModList[queryResult[i].CatalogNumber] = await peptideMassFunctions.getModificationId(queryResult[i].Peptide,queryResult[i].ModificationString);
                }          
            }

            //build the transObj from queryResult
            for(let i = 0; i < queryResult.length; i++){
                let thisTrans = queryResult[i];

                if(!transObj.hasOwnProperty(thisTrans.CatalogNumber)){
                    transObj[thisTrans.CatalogNumber] = [];
                }

                //if this is a heavy transition, add{light:calculatedTrans,heavy:thisTrans}
                if(thisTrans.istd.toUpperCase() == 'TRUE'){
                    //find the index of existing trans
                    let existIdx = -1;
                    let calculatedLight = generateTrans(thisTrans, catalogNumberModList);
                    //console.log("calculatedLight:")
                    //console.log(calculatedLight);
                    //console.log(transObj);
                    for(let i = 0; i < transObj[thisTrans.CatalogNumber].length; i++){
                        if(compareTrans(transObj[thisTrans.CatalogNumber][i].light,calculatedLight,ppmLimit)){
                            existIdx = i;
                            i = transObj[thisTrans.CatalogNumber].length;
                        }
                    }

                    if(existIdx != -1){
                        transObj[thisTrans.CatalogNumber][existIdx].heavy = thisTrans;
                    }else{
                        transObj[thisTrans.CatalogNumber].push({light:calculatedLight,heavy:thisTrans});                
                    }
                }

                //if this is a light transition, only add {light:thisTrans}
                if(thisTrans.istd.toUpperCase() == 'FALSE'){
                    //find the index of existing trans
                    //console.log(transObj);
                    let existIdx = -1;
                    for(let i = 0; i < transObj[thisTrans.CatalogNumber].length; i++){
                        if(compareTrans(transObj[thisTrans.CatalogNumber][i].light,thisTrans,ppmLimit)){
                            existIdx = i;
                            i = transObj[thisTrans.CatalogNumber].length;
                        }
                    }

                    if(existIdx != -1){
                        transObj[thisTrans.CatalogNumber][existIdx].light = thisTrans;
                    }else{
                        transObj[thisTrans.CatalogNumber].push({light:thisTrans});
                    }
                }
            }

            //rebuild tranlist
            for(let catNum in transObj){
                for(let i = 0; i < transObj[catNum].length; i++){
                    if(transObj[catNum][i].light.Product_Ion > 0){
                        result.push(transObj[catNum][i].light);
                    }else{
                        console.log("error calculate light");
                        console.log(transObj[catNum][i]);
                    }                   
                }
                for(let i = 0; i < transObj[catNum].length; i++){
                    if(transObj[catNum][i].hasOwnProperty('heavy')){
                        result.push(transObj[catNum][i].heavy);
                    }
                }
            }

        }
        console.log("result is here:\n")
        console.log(result);
        resolve(result);
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
            let curTrans = await getTransitionInfo(req.body.peptideIds[i], fileType, true);
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