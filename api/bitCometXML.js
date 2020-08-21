const express = require('express');
const router = express.Router();
const pool = require('../dbcon.js').pool;

router.post('/getTorrentList', (req,res, next) => {
    try{
        //get query string
        console.log(req.body);  //options [parameter:value]
        let queryString = ""
        let tableToSearch = "bitcomet_downloadxml";

        if(queryString == ""){
            queryString = "1=1";
        }else{
            //queryString = `b.filename LIKE '%${queryString}%'`;
            //this is adjusted based on options from req.body, for future use

        }

        pool.query('SELECT * FROM ' + tableToSearch + ' b WHERE ' + queryString,(err, result)=>{
            if(err){
                res.send({'error': "SQL Error: " + err});
            }else{
                if(result.length == 0){
                    res.send({'searchResult': "No item found"})
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
        let btRowInfo = {
            InfoHashHex : req.body.InfoHashHex,
            Torrent : req.body.Torrent,
            CreateDate : req.body.CreateDate,
            SaveDirectory : req.body.SaveDirectory,
            SaveName : req.body.SaveName,
            Size : req.body.Size,
            SelectedSize : req.body.SelectedSize,
            Left : req.body.Left,
            DataUpload : req.body.DataUpload,
            DataDownload : req.body.DataDownload,
            PreviewState : req.body.PreviewState,
            FileOrderList : req.body.FileOrderList,
            TorrentFile : req.body.TorrentFile,
            SaveLocation : req.body.SaveLocation,
            ShowName : req.body.ShowName,
            Tags : req.body.Tags,
            StandAlone : req.body.StandAlone,
            Description : req.body.Description,
            Publisher : req.body.Publisher,
            PublisherUrl : req.body.PublisherUrl,
            FinishDate : req.body.FinishDate,
            DataRubbish : req.body.DataRubbish,
            HttpUpload : req.body.HttpUpload,
            AutoRun : req.body.AutoRun
        }

        //console.log(btRowInfo)
        //check to see if it is in the database already
        //remove entries with hash 0000000....
        let targetedHash = btRowInfo.InfoHashHex
        pool.query('SELECT * FROM bitcomet_downloadxml b WHERE b.InfoHashHex=\'' + targetedHash + '\' LIMIT 200',(err, result)=>{
            if(err){
                console.log(err)
                res.send({'error': "SQL Error in SELECT for insert route: " + err});
            }else{
                // build query string for either insert or update
                let queryString = {
                    insert: ' (InfoHashHex, Torrent, CreateDate, SaveDirectory, SaveName, Size, SelectedSize, `Left`, ' + 
                            'DataUpload, DataDownload, PreviewState, FileOrderList, TorrentFile, SaveLocation, ShowName, Tags, StandAlone, ' + 
                            'Description, Publisher, PublisherUrl, FinishDate, DataRubbish, HttpUpload, AutoRun)',
                    update: 'InfoHashHex = ?, Torrent = ?, CreateDate = ?, SaveDirectory = ?, SaveName = ?, Size = ?, SelectedSize = ?, `Left` = ?, ' + 
                            'DataUpload = ?, DataDownload = ?, PreviewState = ?, FileOrderList = ?, TorrentFile = ?, SaveLocation = ?, ShowName = ?, Tags = ?, StandAlone = ?, ' + 
                            'Description = ?, Publisher = ?, PublisherUrl = ?, FinishDate = ?, DataRubbish = ?, HttpUpload = ?, AutoRun = ?'
                }

                if(result.length == 0){
                    //continue with insert

                    //get query string
                    /*console.log(req.body);
                    
                    console.log('INSERT INTO bitcomet_downloadxml ' + 
                                queryString.insert +
                                ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                [btRowInfo.InfoHashHex, btRowInfo.Torrent, btRowInfo.CreateDate,
                                btRowInfo.SaveDirectory, btRowInfo.SaveName, btRowInfo.Size, btRowInfo.SelectedSize, btRowInfo.Left, btRowInfo.DataUpload,
                                btRowInfo.DataDownload, btRowInfo.PreviewState, btRowInfo.FileOrderList, btRowInfo.TorrentFile, btRowInfo.SaveLocation,
                                btRowInfo.ShowName, btRowInfo.Tags, btRowInfo.StandAlone, btRowInfo.Description, btRowInfo.Publisher, btRowInfo.PublisherUrl,
                                btRowInfo.FinishDate, btRowInfo.DataRubbish, btRowInfo.HttpUpload, btRowInfo.AutoRun],[])
                    */
                    //insert the item
                    pool.query('INSERT INTO bitcomet_downloadxml ' + 
                                queryString.insert +
                                ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                [btRowInfo.InfoHashHex, btRowInfo.Torrent, btRowInfo.CreateDate,
                                btRowInfo.SaveDirectory, btRowInfo.SaveName, btRowInfo.Size, btRowInfo.SelectedSize, btRowInfo.Left, btRowInfo.DataUpload,
                                btRowInfo.DataDownload, btRowInfo.PreviewState, btRowInfo.FileOrderList, btRowInfo.TorrentFile, btRowInfo.SaveLocation,
                                btRowInfo.ShowName, btRowInfo.Tags, btRowInfo.StandAlone, btRowInfo.Description, btRowInfo.Publisher, btRowInfo.PublisherUrl,
                                btRowInfo.FinishDate, btRowInfo.DataRubbish, btRowInfo.HttpUpload, btRowInfo.AutoRun], (err, result)=>{
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
                    pool.query('UPDATE bitcomet_downloadxml SET ' + queryString.update + ' WHERE InfoHashHex=\'' + btRowInfo.InfoHashHex + '\'', 
                        [btRowInfo.InfoHashHex, btRowInfo.Torrent, btRowInfo.CreateDate,
                        btRowInfo.SaveDirectory, btRowInfo.SaveName, btRowInfo.Size, btRowInfo.SelectedSize, btRowInfo.Left, btRowInfo.DataUpload,
                        btRowInfo.DataDownload, btRowInfo.PreviewState, btRowInfo.FileOrderList, btRowInfo.TorrentFile, btRowInfo.SaveLocation,
                        btRowInfo.ShowName, btRowInfo.Tags, btRowInfo.StandAlone, btRowInfo.Description, btRowInfo.Publisher, btRowInfo.PublisherUrl,
                        btRowInfo.FinishDate, btRowInfo.DataRubbish, btRowInfo.HttpUpload, btRowInfo.AutoRun], (err, result)=>{
                        if(err){
                            console.log(err);
                            res.send({'error': "SQL Update Error",
                                    'insertID':"-1"
                            });
                        }else{
                            res.send(JSON.stringify({'insertID':result.insertId, 'affectedRows':result.affectedRows}));
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