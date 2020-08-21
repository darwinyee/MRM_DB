var mysql = require('mysql');
//add dotenv functionality
require('dotenv').config();

var pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	port: process.env.DB_PORT,
	database: process.env.DB_DATABASE,
	connectionLimit: 20
});

module.exports.pool = pool;