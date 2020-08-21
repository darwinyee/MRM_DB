const express = require('express');
const router = express.Router();
const pool = require('../dbcon.js').pool;

router.post('/search', (req,res, next) => {
    try{
        //get query string
        console.log(req.body);
        let queryString = req.body.searchTerm;   //set to exact match, search for aid only for now
        let tableToSearch = req.body.table;

        if(queryString == ""){
            queryString = "1=1";
        }else{
            //queryString = `b.filename LIKE '%${queryString}%'`;
            queryString = (tableToSearch == "btfiles_info")?`b.aid = '${queryString}'`:`b.exactLnk = '${queryString}'`;          
        }

        pool.query('SELECT * FROM ' + tableToSearch + ' b WHERE ' + queryString + ' LIMIT 200',(err, result)=>{
            if(err){
                res.send({'error': "SQL Error"});
            }else{
                if(result.length == 0){
                    res.send({'error': "No item found"})
                }else{
                    res.send({'searchResult': result})
                }    
            }
        })
    }catch (err){
        res.status(500).send({'error': err})
    }
});

router.post('/insert', (req,res, next) => {
    try{
        let targetTable = req.body.table;
        let queryCol = (targetTable == "btfiles_info")?`b.aid = '${req.body.aid}'`:`b.exactLnk = '${req.body.exactLnk}'`;

        //check to see if it is in the database already
        pool.query('SELECT * FROM ' + targetTable + ' b WHERE ' + queryCol + ' LIMIT 200',(err, result)=>{
            if(err){
                res.send({'error': "SQL Error in SELECT for insert route"});
            }else{
                let reqEntries = {}; //assign request values to unify variable
                    if(targetTable == "btfiles_info"){
                        reqEntries.v1 = req.body.filename;
                        reqEntries.v2 = req.body.fileLink;
                        reqEntries.v3 = req.body.aid;
                    }else if(targetTable == "episode_link"){
                        reqEntries.v1 = req.body.exactLnk;
                        reqEntries.v2 = req.body.linkItemName;
                        reqEntries.v3 = req.body.rejectBefore;
                    }
                if(result.length == 0){
                    //continue with insert
                    //table columns
                    dbTable = {
                        btfiles_info : ' (filename, fileLink, aid)',
                        episode_link : ' (exactLnk, linkItemName, rejectBefore)'
                    }

                    //get query string
                    console.log(req.body);
                    
                    console.log('INSERT INTO ' + 
                                targetTable + 
                                dbTable[targetTable] +
                                ' VALUES (?,?,?)',[reqEntries.v1,reqEntries.v2,reqEntries.v3],[])

                    //insert the item
                    pool.query('INSERT INTO ' + 
                                targetTable + 
                                dbTable[targetTable] +
                                ' VALUES (?,?,?)', 
                                [reqEntries.v1,reqEntries.v2,reqEntries.v3], (err, result)=>{
                        if(err){
                            console.log(err);
                            res.send({'error': "SQL Insert Error",
                                    'insertID':"-1"
                            });
                        }else{
                            res.send(JSON.stringify({'insertID':result.insertId}));
                        }
                    });
                }else{
                    //the entry exists already, update the info instead
                    //res.send({'error': "the entry exists in SELECT for insert route"});
                    let updateQuery = {
                        btfiles_info : 'filename = ?, fileLink = ?, aid = ?',
                        episode_link : 'exactLnk = ?, linkItemName = ?, rejectBefore = ?',
                        tableToUpdate : targetTable,
                        itemID : result[0].id
                    }
                    pool.query('UPDATE ' + updateQuery.tableToUpdate + ' SET ' + updateQuery[updateQuery.tableToUpdate] + ' WHERE id=' + updateQuery.itemID, 
                               [reqEntries.v1,reqEntries.v2,reqEntries.v3], (err, result)=>{
                        if(err){
                            console.log(err);
                            res.send({'error': "SQL Update Error",
                                    'insertID':"-1"
                            });
                        }else{
                            res.send(JSON.stringify({'insertID':result.insertId}));
                        }
                    });
                }
            }
        });

        
    }catch (err){
        res.status(500).send({'error': err})
    }
});

module.exports = router;