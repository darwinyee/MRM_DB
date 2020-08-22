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

router.post('/uploadTrans', (req,res,next) => {
    upload(req, res, function (err){
        if(err){
            res.send({error: err});
            console.log(err)
        }else{
            res.send({upload: "success"});
            console.log(req.file);
            console.log("file uploaded!");
            console.log("reading file");

            let lines = fs.readFileSync(req.file.path, 'utf-8').split('\n').filter(Boolean);

            console.log(lines);

            console.log('done')
        }
    })
});

module.exports = router;