"use strict";
const Link = require("./Link");
const tags = require("./tags");

const condenseWhitespace = require("condense-whitespace");
const list2Array = require("list-to-array");
const parseMetaRefresh = require("http-equiv-refresh");
const parseSrcset = require("parse-srcset");
const RobotDirectives = require("robot-directives");

const maxFilterLevel = tags[tags.length - 1];



/*
	Scrape a parsed HTML document/tree for links.
*/
function scrapeHtml(document, pageUrl, robots)
{
	const links = [];
	const rootNode = findRootNode(document);
	const {base} = findPreliminaries(rootNode, robots);
	
	findLinks(rootNode, function(node, attrName, url)
	{
		const link = Link.create();
		link.html.attrs = node.attrMap;
		link.html.attrName = attrName;
		link.html.base = base;
		link.html.index = links.length;
		link.html.location = node.__location.attrs[attrName];
		link.html.selector = getSelector(node);
		link.html.tag = stringifyNode(node);
		link.html.tagName = node.nodeName;
		link.html.text = getText(node);
		
		Link.resolve(link, url, pageUrl);
		
		links.push(link);
	});
	
	return links;
}



//::: PRIVATE FUNCTIONS



/*
	Traverses the root node to locate links that match filters.
*/
function findLinks(rootNode, callback)
{
	walk(rootNode, function(node)
	{
		const linkAttrs = maxFilterLevel[node.nodeName];
		
		// If a supported element
		if (linkAttrs != null)
		{
			const numAttrs = node.attrs.length;
			
			// Faster to loop through Arrays than Objects
			for (let i=0; i<numAttrs; i++)
			{
				const attrName = node.attrs[i].name;
				let url = null;
				
				// If a supported attribute
				if (linkAttrs[attrName])
				{
					switch (attrName)
					{
						case "content":
						{
							// Special case for `<meta http-equiv="refresh" content="5; url=redirect.html">`
							if (node.attrMap["http-equiv"]!=null && node.attrMap["http-equiv"].toLowerCase()==="refresh")
							{
								url = parseMetaRefresh( node.attrMap[attrName] ).url;
							}

							break;
						}
						case "ping":
						{
							url = list2Array( node.attrMap[attrName], "," );
							break;
						}
						case "srcset":
						{
							url = parseSrcset( node.attrMap[attrName] ).map(image => image.url);
							break;
						}
						default:
						{
							// https://html.spec.whatwg.org/multipage/infrastructure.html#valid-url-potentially-surrounded-by-spaces
							url = node.attrMap[attrName].trim();
						}
					}
					
					if (Array.isArray(url))
					{
						url.forEach(_url => callback(node, attrName, _url));
					}
					else if (url != null)
					{
						callback(node, attrName, url);
					}
				}
			}
		}
	});
}



/*
	Traverses the root node to locate preliminary elements/data.
	
	<base href/>
		
		Looks for the first instance. If no `href` attribute exists,
		the element is ignored and possible successors are considered.
	
	<meta name content/>
		
		Looks for all robot instances and cascades the values.
*/
function findPreliminaries(rootNode, robots)
{
	const result = { base:null };
	
	walk(rootNode, function({attrMap, nodeName})
	{
		switch (nodeName)
		{
			// `<base>` can be anywhere, not just within `<head>`
			case "base":
			{
				if (result.base==null && attrMap.href!=null)
				{
					// https://html.spec.whatwg.org/multipage/infrastructure.html#valid-url-potentially-surrounded-by-spaces
					result.base = attrMap.href.trim();
				}
				
				break;
			}
			// `<meta>` can be anywhere
			case "meta":
			{
				if (robots && attrMap.name!=null && attrMap.content!=null)
				{
					const name = attrMap.name.trim().toLowerCase();
					
					if (name==="robots" || RobotDirectives.isBot(name))
					{
						robots.meta(name, attrMap.content);
					}
				}
				
				break;
			}
		}
		
		if (result.base!=null && !robots)
		{
			// Kill walk
			return false;
		}
	});
	
	return result;
}



/*
	Find the `<html>` element.
*/
function findRootNode(document)
{
	const rootNodes = document.childNodes;
	
	for (let i=0; i<rootNodes.length; i++)
	{
		// Doctypes have no `childNodes` property
		if (rootNodes[i].childNodes != null)
		{
			return rootNodes[i];
		}
	}
}



/*
	Find a node's `:nth-child()` index among its siblings.
*/
function getNthIndex(node)
{
	const parentsChildren = node.parentNode.childNodes;
	const numParentsChildren = parentsChildren.length;
	let count = 0;
	
	for (let i=0; i<numParentsChildren; i++)
	{
		const child = parentsChildren[i];
		
		if (child !== node)
		{
			// Exclude text and comments nodes
			if (child.nodeName[0] !== "#")
			{
				count++;
			}
		}
		else
		{
			break;
		}
	}
	
	// `:nth-child()` indices don't start at 0
	return ++count;
}



/*
	Builds a CSS selector that matches `node`.
*/
function getSelector(node)
{
	const selector = [];
	
	while (node.nodeName !== "#document")
	{
		let name = node.nodeName;
		
		// Only one of these are ever allowed -- so, index is unnecessary
		if (name!=="html" && name!=="body" & name!=="head")
		{
			name += `:nth-child(${getNthIndex(node)})`;
		}
		
		// Building backwards
		selector.push(name);
		
		node = node.parentNode;
	}
	
	return selector.reverse().join(" > ");
}



function getText(node)
{
	let text = null;
	
	if (node.childNodes.length > 0)
	{
		text = "";
		
		walk(node, function(node)
		{
			if (node.nodeName === "#text")
			{
				text += node.value;
			}
		});
		
		// TODO :: don't normalize if within <pre> ? use "normalize-html-whitespace" package if so
		text = condenseWhitespace(text);
	}
	
	return text;
}



/*
	Serialize an HTML node back to a string.
*/
function stringifyNode(node)
{
	const attrs = node.attrs.reduce((result, attr) => `${result} ${attr.name}="${attr.value}"`, "");

	return `<${node.nodeName}${attrs}>`;
}



// TODO :: contribute these to npmjs.com/dom-walk
function walk(node, callback)
{
	if (callback(node) === false) return false;

	let childNode,i;
	
	if (node.childNodes != null)
	{
		i = 0;
		childNode = node.childNodes[i];
	}
	
	while (childNode != null)
	{
		if (walk(childNode, callback) === false) return false;
		
		childNode = node.childNodes[++i];
	}
}
// http://www.javascriptcookbook.com/article/Traversing-DOM-subtrees-with-a-recursive-walk-the-DOM-function/
// Modified
/*function walk(node, callback)
{
	if (callback(node) === false) return false;
	
	node = node.firstChild;
	
	while (node != null)
	{
		if (walk(node, callback) === false) return false;
		
		node = node.nextSibling;
	}
}*/



module.exports = scrapeHtml;
