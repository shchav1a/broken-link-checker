"use strict";
const parseOptions   = require("../internal/parseOptions");
const streamHtml     = require("../internal/streamHtml");
const transitiveAuth = require("../internal/transitiveAuth");

const HtmlChecker = require("./HtmlChecker");

const {EventEmitter} = require("events");
const RequestQueue = require("limited-request-queue");
const RobotDirectives = require("robot-directives");



class HtmlUrlChecker extends EventEmitter
{
	constructor(options)
	{
		super();
		reset(this);
		
		this.options = options = parseOptions(options);
		
		this.htmlUrlQueue = new RequestQueue(
		{
			maxSockets: 1,
			rateLimit: this.options.rateLimit
		})
		.on("item", (url, data, done) =>
		{
			reset(this);
			
			this.currentAuth = data.auth;
			this.currentCustomData = data.customData;
			this.currentDone = done;
			this.currentPageUrl = url;  // TODO :: remove hash ?
			
			streamHtml(this.currentPageUrl, this.currentAuth, this.__getCache(), this.options).then(result =>
			{
				this.currentResponse = result.response;
				
				this.currentRobots = new RobotDirectives({ userAgent: this.options.userAgent });
				
				robotHeaders(this);
				
				// Passes robots instance so that headers are included in robot exclusion checks
				this.htmlChecker.scan(result.stream, result.response.url, this.currentRobots, this.currentAuth);
			})
			.catch(error => completedPage(this, error));
		})
		.on("end", () =>
		{
			// Clear references for garbage collection
			reset(this);
			
			this.emit("end");
		});
		
		this.htmlChecker = new HtmlChecker(this.options)
		.on("html", (tree, robots) =>
		{
			this.emit("html", tree, robots, this.currentResponse, this.currentPageUrl, this.currentCustomData);
		})
		.on("junk", result => this.emit("junk", result, this.currentCustomData))
		.on("link", result => this.emit("link", result, this.currentCustomData))
		.on("complete", () => completedPage(this, null));
	}
	
	
	
	clearCache()
	{
		this.htmlChecker.clearCache();
		return this;
	}
	
	
	
	dequeue(id)
	{
		return this.htmlUrlQueue.dequeue(id);
	}
	
	
	
	// `auth` is undocumented and for internal use only
	enqueue(pageUrl, customData, auth)
	{
		const transitive = transitiveAuth(pageUrl, auth);
		
		return this.htmlUrlQueue.enqueue(transitive.url, { auth:transitive.auth, customData });
	}
	
	
	
	get numActiveLinks()
	{
		return this.htmlChecker.numActiveLinks;
	}
	
	
	
	get numPages()
	{
		return this.htmlUrlQueue.length;
	}
	
	
	
	get numQueuedLinks()
	{
		return this.htmlChecker.numQueuedLinks;
	}
	
	
	
	pause()
	{
		this.htmlChecker.pause();
		this.htmlUrlQueue.pause();
		return this;
	}
	
	
	
	resume()
	{
		this.htmlChecker.resume();
		this.htmlUrlQueue.resume();
		return this;
	}
	
	
	
	__getCache()
	{
		return this.htmlChecker.__getCache();
	}
}



//::: PRIVATE FUNCTIONS



function completedPage(instance, error)
{
	instance.emit("page", error, instance.currentPageUrl, instance.currentCustomData);
	
	// Auto-starts next queue item, if any
	// If not, fires "end"
	instance.currentDone();
}



function reset(instance)
{
	instance.currentAuth = null;
	instance.currentCustomData = null;
	instance.currentDone = null;
	instance.currentPageUrl = null;
	instance.currentResponse = null;
	instance.currentRobots = null;
}



function robotHeaders(instance)
{
	// TODO :: https://github.com/joepie91/node-bhttp/issues/20
	// TODO :: https://github.com/nodejs/node/issues/3591
	if (instance.currentResponse.headers["x-robots-tag"] != null)
	{
		instance.currentRobots.header( instance.currentResponse.headers["x-robots-tag"] );
	}
}



module.exports = HtmlUrlChecker;
