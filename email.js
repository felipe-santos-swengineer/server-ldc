var nodemailer = require('nodemailer');
require("dotenv").config();

var conta = nodemailer.createTransport({
	service: 'Gmail',
	host: "",
	port: "587",
	auth: {
		user: process.env.EMAIL_SENDER_USER,
		pass: process.env.EMAIL_SENDER_PASS 
	}
});

module.exports = async(to, subject, html) => {

	await conta.sendMail({

		from: 'CHRONOS MAILER' + '<' + process.env.EMAIL_SENDER_USER + '>',
		to: '<' + to + '>', 
		subject: subject, 
		html: html,

	}, function(err){
		if(err){
			throw err;
		}
		//console.log('E-mail enviado!');
	});

}

