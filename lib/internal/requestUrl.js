"use strict";
const bhttp = require("bhttp");
const {getProxyForUrl} = require("proxy-from-env");
const isURL = require("isurl");
//const {stat} = require("fs");
const tunnel = require("tunnel");
const {URL} = require("universal-url");

const agents = {};



function authString(url, auth)
{
	if (url.username!=="" || url.password!=="")
	{
		return `${url.username}:${url.password}`;
	}
	else if (auth != null)
	{
		const password = auth.password != null ? auth.password : "";
		const username = auth.username != null ? auth.username : "";
		
		if (password!=="" || username!=="")
		{
			return `${username}:${password}`;
		}
	}
}



function capitalizeFirstLetter(string)
{
	return string.charAt(0).toUpperCase() + string.slice(1);
}



// TODO :: https://github.com/koichik/node-tunnel/issues/20
function proxyAgent(url, options)
{
	const proxyUrl = getProxyForUrl(url);
	
	if (proxyUrl === "") return null;
	
	if (agents[proxyUrl] === undefined) agents[proxyUrl] = {};
	
	if (agents[proxyUrl][url.protocol] !== undefined) return agents[proxyUrl][url.protocol];
	
	let proxyUrl_parsed;

	try
	{
		proxyUrl_parsed = new URL(proxyUrl);
	}
	catch (error)
	{
		return agents[proxyUrl][url.protocol] = null;  // speed up proxy discovery for next time
	}
	
	// Remove trailing ":"
	const proxyUrl_protocol = proxyUrl_parsed.protocol.slice(0, -1);
	const url_protocol = url.protocol.slice(0, -1);
	
	const agent = tunnel[`${url_protocol}Over${capitalizeFirstLetter(proxyUrl_protocol)}`](
	{
		proxy:
		{
			headers: { "user-agent":options.userAgent },
			host:      proxyUrl_parsed.hostname,
			port:      proxyUrl_parsed.port,
			proxyAuth: authString(proxyUrl_parsed.auth)
		}
	});
	
	return agents[proxyUrl][url.protocol] = agent;
}



function requestUrl(url, auth, method, options, retry=false)
{
	method = method.toLowerCase();
	
	// TODO :: do we need the isURL check?
	return Promise.resolve( isURL.lenient(url) ).then( function(result)
	{
		if (!result) throw new TypeError("Invalid URL");
		
		return bhttp.request(url.href,  // TODO :: https://github.com/joepie91/node-bhttp/issues/3
		{
			auth: authString(url, auth),
			discardResponse: true,
			headers: { "user-agent":options.userAgent },
			method: method,
			rejectUnauthorized: false,  // accept self-signed SSL certificates
			stream: method !== "head"
		});
	})
	.then( function(response)
	{
		if (response.statusCode===405 && method==="head" && options.retry405Head===true && !retry)
		{
			// Retry possibly broken server with "get"
			return requestUrl(url, auth, "get", options, true);
		}
		
		else if (method==="get" && !retry)
		{
			return { response:simplifyResponse(response), stream:response };
		}
		else
		{
			return { response:simplifyResponse(response) };
		}
	});
}



function simplifyResponse(response)
{
	const simplified = simplifyResponse2(response);
	simplified.redirects = [];
	
	for (let i=0; i<response.redirectHistory.length; i++)
	{
		simplified.redirects.push( simplifyResponse2(response.redirectHistory[i]) );
	}
	
	return simplified;
}



function simplifyResponse2(response)
{
	return {
		headers:    response.headers,
		status:     response.statusCode,
		statusText: response.statusMessage,
		url:        new URL(response.request.url)
	};
}



module.exports = requestUrl;
