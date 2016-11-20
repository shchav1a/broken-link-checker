"use strict";
const {createReadStream, readFileSync} = require("fs");
const {resolve:resolvePath} = require("path");



function fixturePath(path)
{
	if (path == null) path = "";
	
	return resolvePath(`${__dirname}/../fixtures/${path}`);
}



function fixtureStream(path)
{
	return createReadStream(fixturePath(path));
}



function fixtureString(path)
{
	return readFileSync(fixturePath(path), "utf8");
}



module.exports = 
{
	path: fixturePath,
	stream: fixtureStream,
	string: fixtureString
};
