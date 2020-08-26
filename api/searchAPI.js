const express = require('express');
const router = express.Router();
const pool = require('../dbcon.js').pool;


function reformatOutput(result){
    //result is not empty
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
                'Modifications' : thisPeptide.Modification + `(${thisPeptide.modPosition})`
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
    return reformatPeptideInfo;
}

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
                   queryString,(err, result)=>{
            if(err){
                console.log(err);
                res.send({'error': "SQL Error"});
            }else{
                if(result.length == 0){
                    res.send({'error': "No item found"})
                }else{
                    
                    res.send(JSON.stringify(reformatOutput(result)));
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