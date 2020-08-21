const express = require('express');
const mysql = require('./dbcon.js');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const app = express();
const handlebars = require('express-handlebars').create({ defaultLayout: 'main'});

//add dotenv functionality
require('dotenv').config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.engine('handlebars', handlebars.engine);
app.use('/static', express.static('public')); //Allow use of static files
app.set('view engine', 'handlebars'); //Use Handlebars templates

app.use('/api', cors(), require('./api/searchAPI.js'));
app.use('/bitCometAPI', cors(), require('./api/bitCometXML.js'));

app.get('/', function(req,res){
    res.render("home");
})

//Go here when 404
app.use(function(req, res) {
	res.status(404);
	res.render('404');
});

//Go here when 500 error
app.use(function(err, req, res, next) {
	console.error(err.stack);
	res.status(500);
	res.render('500');
});

app.listen(process.env.PORT_NUM, '0.0.0.0', function(){
    console.log("Start running at port " + process.env.PORT_NUM);
});