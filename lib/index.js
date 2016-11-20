"use strict";
const {reasons} = require("./internal/messages");



const blc = 
{
	HtmlChecker:    require("./public/HtmlChecker"),
	HtmlUrlChecker: require("./public/HtmlUrlChecker"),
	SiteChecker:    require("./public/SiteChecker"),
	UrlChecker:     require("./public/UrlChecker")
};



for (let i in reasons)
{
	blc[i] = reasons[i];
}



module.exports = Object.freeze(blc);
