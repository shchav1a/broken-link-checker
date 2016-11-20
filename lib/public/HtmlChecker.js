"use strict";
const Link           = require("../internal/Link");
const matchUrl       = require("../internal/matchUrl");
const parseHtml      = require("../internal/parseHtml");
const parseOptions   = require("../internal/parseOptions");
const scrapeHtml     = require("../internal/scrapeHtml");
const transitiveAuth = require("../internal/transitiveAuth");

const UrlChecker = require("./UrlChecker");

const {EventEmitter} = require("events");
const isObject = require("is-object");
const {map:linkTypes} = require("link-types");
const RobotDirectives = require("robot-directives");



class HtmlChecker extends EventEmitter
{
	constructor(options)
	{
		super();
		reset(this);
		
		this.options = options = parseOptions(options);
		
		this.urlChecker = new UrlChecker(this.options)
		.on("link", result => this.emit("link", result))
		.on("end", () => 
		{
			// If stream finished
			if (this.parsed)
			{
				complete(this);
			}
		});
	}
	
	
	
	clearCache()
	{
		this.urlChecker.clearCache();
		return this;
	}
	
	
	
	get numActiveLinks()
	{
		return this.urlChecker.numActiveLinks;
	}
	
	
	
	get numQueuedLinks()
	{
		return this.urlChecker.numQueuedLinks;
	}
	
	
	
	pause()
	{
		this.urlChecker.pause();
		return this;
	}
	
	
	
	resume()
	{
		this.urlChecker.resume();
		return this;
	}
	
	
	
	// `robots` and `auth` are undocumented and for internal use only
	scan(html, baseUrl, robots, auth)
	{
		if (this.active)
		{
			return false;
		}
		
		// Prevent user error with missing undocumented arugment
		if (!(robots instanceof RobotDirectives))
		{
			robots = new RobotDirectives({ userAgent: this.options.userAgent });
		}
		
		const transitive = transitiveAuth(baseUrl, auth);
		
		this.active = true;
		this.auth = transitive.auth;
		this.baseUrl = transitive.url;  // TODO :: remove hash (and store somewhere?)
		this.robots = robots;
		
		let tree;
		
		parseHtml(html)
		.then(document => 
		{
			tree = document;
			return scrapeHtml(document, this.baseUrl, this.robots);  // TODO :: add auth?
		})
		.then(links => 
		{
			this.emit("html", tree, this.robots);

			links.forEach(link => maybeEnqueueLink(this, link));

			this.parsed = true;

			// If no links found or all links already checked
			if (this.urlChecker.numActiveLinks===0 && this.urlChecker.numQueuedLinks===0)
			{
				complete(this);
			}
		});
		
		return true;
	}
	
	
	
	__getCache()
	{
		return this.urlChecker.__getCache();
	}
}



//::: PRIVATE FUNCTIONS



function complete(instance)
{
	reset(instance);
	
	instance.emit("complete");
}



function isRobotAttr(tagName, attrName)
{
	return (tagName==="img"      && attrName==="src"   ) || 
	       (tagName==="input"    && attrName==="src"   ) || 
	       (tagName==="menuitem" && attrName==="icon"  ) || 
	       (tagName==="video"    && attrName==="poster");
}



function maybeEnqueueLink(instance, link)
{
	const excludedReason = maybeExcludeLink(instance, link);

	if (excludedReason !== false)
	{
		link.html.offsetIndex = instance.excludedLinks++;
		link.excluded = true;
		link.excludedReason = excludedReason;
		
		instance.emit("junk", link);
	}
	else
	{
		link.html.offsetIndex = link.html.index - instance.excludedLinks;
		link.excluded = false;

		const id = instance.urlChecker.enqueue(link, null, instance.auth);

		// TODO :: is this redundant? maybe use `Link.invalidate()` in `maybeExcludeLink()` ?
		if (id === undefined)
		{
			link.broken = true;
			link.brokenReason = "BLC_INVALID";
			
			instance.emit("link", link);
		}
	}
}



function maybeExcludeLink(instance, link)
{
	const opts = instance.options;
	const attrName = link.html.attrName;
	const tagName = link.html.tagName;
	const tagGroup = opts.tags[opts.filterLevel][tagName];
	
	if (tagGroup===undefined || !tagGroup[attrName])
	{
		return "BLC_HTML";
	}
	else if (opts.excludeExternalLinks && link.internal===false)
	{
		return "BLC_EXTERNAL";
	}
	else if (opts.excludeInternalLinks && link.internal)
	{
		return "BLC_INTERNAL";
	}
	else if (opts.excludeLinksToSamePage && link.samePage)
	{
		return "BLC_SAMEPAGE";
	}
	else if (opts.excludedSchemes[link.url.rebased.protocol])
	{
		return "BLC_SCHEME";
	}
	else if (opts.honorRobotExclusions && instance.robots.oneIs([ RobotDirectives.NOFOLLOW, RobotDirectives.NOINDEX ]))
	{
		return "BLC_ROBOTS";
	}
	else if (opts.honorRobotExclusions && instance.robots.is(RobotDirectives.NOIMAGEINDEX) && isRobotAttr(tagName, attrName))
	{
		return "BLC_ROBOTS";
	}
	else if (opts.honorRobotExclusions && link.html.attrs!=null && link.html.attrs.rel!=null && linkTypes(link.html.attrs.rel).nofollow)
	{
		return "BLC_ROBOTS";
	}
	else if (matchUrl(link.url.rebased.href, opts.excludedKeywords))
	{
		return "BLC_KEYWORD";
	}
	else
	{
		const filter = opts.customFilter(link);

		// Undocumented support for objects
		if (isObject(filter))
		{
			return filter.excluded ? filter.excludedReason : false;
		}
		else
		{
			return filter ? false : "BLC_CUSTOM";
		}
	}
}



function reset(instance)
{
	instance.active = false;
	instance.auth = null;
	instance.baseUrl = undefined;
	instance.excludedLinks = 0;
	instance.linkEnqueued = null;
	instance.parsed = false;
	instance.robots = null;
}



module.exports = HtmlChecker;
