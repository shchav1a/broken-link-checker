"use strict";
const helpers        = require("./helpers");
const HtmlUrlChecker = require("../lib/public/HtmlUrlChecker");
const messages       = require("../lib/internal/messages");

const {after, before, describe, it} = require("mocha");
const {expect} = require("chai");



describe("PUBLIC -- HtmlUrlChecker", function()
{
	before(() => helpers.startServer("http://blc/"));
	after(helpers.stopServers);
	
	
	
	describe("enqueue()", function()
	{
		it("accepts a valid url", function()
		{
			const id = new HtmlUrlChecker( helpers.options() ).enqueue("http://blc/");

			expect(id).to.be.a("number");
		});
		
		
		
		it("rejects an invalid url", function()
		{
			expect(() => new HtmlUrlChecker( helpers.options() ).enqueue("/path/")).to.throw(TypeError);
		});
	});
	
	
	
	describe("events", function()
	{
		it("html", function(done)
		{
			new HtmlUrlChecker( helpers.options() )
			.on("html", function(tree, robots, response, pageUrl, customData)
			{
				expect(arguments).to.have.length(5);
				expect(tree).to.be.an("object");
				expect(robots).to.be.an("object");
				expect(response).to.be.an("object");
				expect(pageUrl).to.be.an.instanceOf(Object);  // TODO :: `a("url")` when dropping Node 6 support
				expect(customData).to.be.a("number");
				done();
			})
			.enqueue("http://blc/normal/index.html", 123);
		});



		it("link", function(done)
		{
			let count = 0;
			
			new HtmlUrlChecker( helpers.options() )
			.on("link", function(result, customData)
			{
				// If HTML has more than one link, only accept the first
				// to avoid calling `done()` more than once
				if (++count > 1) return;
				
				expect(arguments).to.have.length(2);
				expect(result).to.be.an("object");
				expect(customData).to.be.a("number");
				done();
			})
			.enqueue("http://blc/normal/index.html", 123);
		});
		
		
		
		it("page", function(done)
		{
			new HtmlUrlChecker( helpers.options() )
			.on("page", function(error, pageUrl, customData)
			{
				expect(arguments).to.have.length(3);
				expect(error).to.be.null;
				expect(pageUrl).to.be.an.instanceOf(Object);
				expect(customData).to.be.a("number");
				done();
			})
			.enqueue("http://blc/normal/index.html", 123);
		});
		
		
		
		it("end", function(done)
		{
			new HtmlUrlChecker( helpers.options() )
			.on("end", function()
			{
				expect(arguments).to.be.empty;
				done();
			})
			.enqueue("http://blc/normal/index.html");
		});
	});



	describe("clearCache()", function()
	{
		it("works", function(done)
		{
			let finalFired = false;
			let linkCalled = false;
			const options = helpers.options({ cacheResponses:true });

			const instance = new HtmlUrlChecker(options)
			.on("link", function(result)
			{
				expect(result.http.cached).to.be.false;
				linkCalled = true;
			})
			.on("end", function()
			{
				if (finalFired)
				{
					expect(linkCalled).to.be.true;
					done();
				}
				else
				{
					expect( instance.clearCache() ).to.equal(instance);

					instance.enqueue("http://blc/normal/index.html");
					finalFired = true;
				}
			});
			
			instance.enqueue("http://blc/normal/index.html");
		});
	});
	
	
	
	describe("numActiveLinks", function()
	{
		it("works", function(done)
		{
			let htmlCalled = false;
			
			const instance = new HtmlUrlChecker( helpers.options() )
			.on("html", function()
			{
				// Give time for link checks to start
				setImmediate( function()
				{
					expect( instance.numActiveLinks ).to.equal(2);
					htmlCalled = true;
				});
			})
			.on("end", function()
			{
				expect(htmlCalled).to.be.true;
				expect( instance.numActiveLinks ).to.equal(0);
				done();
			});
			
			instance.enqueue("http://blc/normal/index.html");
			
			expect( instance.numActiveLinks ).to.equal(0);
		});
	});
	
	
	
	describe("pause() / resume()", function()
	{
		it("works", function(done)
		{
			let resumed = false;
			
			const instance = new HtmlUrlChecker( helpers.options() )
			.on("end", function()
			{
				expect(resumed).to.be.true;
				done();
			});
			
			expect( instance.pause() ).to.equal(instance);
			
			instance.enqueue("http://blc/");
			
			// Wait longer than scan should take
			setTimeout( function()
			{
				resumed = true;

				expect( instance.resume() ).to.equal(instance);
				
			}, 100);
		});
	});
	
	
	
	// TODO :: test what happens when the current queue item is dequeued
	describe("dequeue() / numPages / numQueuedLinks", function()
	{
		it("accepts a valid id", function(done)
		{
			const instance = new HtmlUrlChecker( helpers.options() )
			.on("end", function()
			{
				expect( instance.numPages ).to.equal(0);
				expect( instance.numQueuedLinks ).to.equal(0);
				done();
			});
			
			// Prevent first queued item from immediately starting (and thus being auto-dequeued)
			instance.pause();
			
			const id = instance.enqueue("http://blc/normal/index.html");
			
			expect( instance.numPages ).to.equal(1);
			expect( instance.numQueuedLinks ).to.equal(0);
			expect( instance.dequeue(id) ).to.be.true;
			expect( instance.numPages ).to.equal(0);
			expect( instance.numQueuedLinks ).to.equal(0);
			
			instance.enqueue("http://blc/normal/index.html");
			instance.resume();
			
			// Wait for HTML to be downloaded and parsed
			setImmediate( function()
			{
				expect( instance.numPages ).to.equal(1);
				expect( instance.numQueuedLinks ).to.equal(2);
			});
		});
		
		
		
		it("rejects an invalid id", function()
		{
			const instance = new HtmlUrlChecker( helpers.options() );
			
			// Prevent first queued item from immediately starting (and thus being auto-dequeued)
			instance.pause();
			
			const id = instance.enqueue("http://blc/");
			
			expect( instance.dequeue(id+1) ).to.be.false;
			expect( instance.numPages ).to.equal(1);
		});
	});
	
	
	
	describe("edge cases", function()
	{
		it("supports custom data", function(done)
		{
			let linkCalled = false;
			let pageCalled = false;
			
			new HtmlUrlChecker( helpers.options() )
			.on("link", function(result, customData)
			{
				expect(customData).to.be.an("object");
				expect(customData.test).to.equal("value");
				linkCalled = true;
			})
			.on("page", function(error, pageUrl, customData)
			{
				expect(customData).to.be.an("object");
				expect(customData.test).to.equal("value");
				pageCalled = true;
			})
			.on("end", function()
			{
				expect(linkCalled).to.be.true;
				expect(pageCalled).to.be.true;
				done();
			})
			.enqueue("http://blc/normal/index.html", {test:"value"});
		});
		
		
		
		it("supports multiple queue items", function(done)
		{
			const results = [];
			
			const instance = new HtmlUrlChecker( helpers.options() )
			.on("link", function(result, customData)
			{
				if (results[ customData.index ] === undefined)
				{
					results[ customData.index ] = [];
				}
				
				results[ customData.index ][ result.html.index ] = result;
			})
			.on("end", function()
			{
				expect(results).to.have.length(2);
				
				expect(results[0]).to.have.length(2);
				expect(results[0][0].broken).to.be.false;  // with-links.html
				expect(results[0][1].broken).to.be.true;   // fake.html
				
				expect(results[1]).to.have.length(2);
				expect(results[1][0].broken).to.be.false;  // with-links.html
				expect(results[1][1].broken).to.be.true;   // fake.html
				
				done();
			});
			
			instance.enqueue("http://blc/normal/index.html", {index:0});
			instance.enqueue("http://blc/normal/index.html", {index:1});
		});
		
		
		
		it("supports html with no links", function(done)
		{
			let linkCount = 0;
			let pageCalled = false;
			
			new HtmlUrlChecker( helpers.options() )
			.on("link", function()
			{
				linkCount++;
			})
			.on("page", function()
			{
				pageCalled = true;
			})
			.on("end", function()
			{
				expect(pageCalled).to.be.true;
				expect(linkCount).to.equal(0);
				done();
			})
			.enqueue("http://blc/normal/no-links.html");
		});
		
		
		
		it("supports pages after html with no links", function(done)
		{
			let linkCount = 0;
			let pageCount = 0;
			
			const instance = new HtmlUrlChecker( helpers.options() )
			.on("link", function()
			{
				linkCount++;
			})
			.on("page", function()
			{
				pageCount++;
			})
			.on("end", function()
			{
				expect(linkCount).to.equal(2);
				expect(pageCount).to.equal(2);
				done();
			});

			instance.enqueue("http://blc/normal/no-links.html");
			instance.enqueue("http://blc/normal/index.html");
		});
		
		
		
		it("reports an error when html cannot be retrieved", function(done)
		{
			let pageCalled = false;
			
			new HtmlUrlChecker( helpers.options() )
			.on("page", function(error, pageUrl, customData)
			{
				expect(error).to.be.an("error");
				expect(error.message).to.equal( messages.errors.HTML_RETRIEVAL );
				expect(pageUrl).to.be.an.instanceOf(Object);
				pageCalled = true;
			})
			.on("end", function()
			{
				expect(pageCalled).to.be.true;
				done();
			})
			.enqueue("http://blc/normal/fake.html");
		});
		
		
		
		it("supports pages after html could not be retrieved", function(done)
		{
			let pageCount = 0;
			
			const instance = new HtmlUrlChecker( helpers.options() )
			.on("page", function(error, pageUrl, customData)
			{
				if (++pageCount === 1)
				{
					expect(error).to.be.an("error");
				}
				else
				{
					expect(error).to.not.be.an("error");
				}
			})
			.on("end", function()
			{
				expect(pageCount).to.equal(2);
				done();
			});
			
			instance.enqueue("http://blc/normal/fake.html");
			instance.enqueue("http://blc/normal/no-links.html");
		});
		
		
		
		// TODO :: check page with absolute urls containing no auth so that URL is re-checked with cached auth (if any) after 401
		it("supports pages behind basic auth", function(done)
		{
			let linkCount = 0;
			let pageCalled = false;
			
			const instance = new HtmlUrlChecker( helpers.options() )
			.on("link", function(result)
			{
				switch (result.html.offsetIndex)
				{
					case 0: expect(result.broken).to.be.false; break;
					case 1: expect(result.broken).to.be.false; break;
					case 2: expect(result.broken).to.be.false; break;
					case 3: expect(result.broken).to.be.true;  break;
					case 4: expect(result.broken).to.be.true;  break;
					case 5: expect(result.broken).to.be.true;  break;
				}
				
				linkCount++;
			})
			.on("page", function(error)
			{
				expect(error).to.not.be.an("error");
				pageCalled = true;
			})
			.on("end", function()
			{
				expect(linkCount).to.equal(6);
				expect(pageCalled).to.be.true;
				done();
			});
			
			instance.enqueue("http://user:pass@blc/auth/index.html");
		});
	});
	
	
	
	describe("options", function()
	{
		it("honorRobotExclusions = false (header)", function(done)
		{
			const results = [];
			
			new HtmlUrlChecker( helpers.options() )
			.on("junk", function(result)
			{
				done( new Error("this should not have been called") );
			})
			.on("link", function(result)
			{
				results[result.html.offsetIndex] = result;
			})
			.on("end", function()
			{
				expect(results).to.have.length(1);
				expect(results[0]).to.containSubset(
				{
					broken: false,
					excluded: false,
					excludedReason: null
				});
				done();
			})
			.enqueue("http://blc/disallowed/header.html");
		});
		
		
		
		it("honorRobotExclusions = true (header)", function(done)
		{
			const junkResults = [];
			
			new HtmlUrlChecker( helpers.options({ honorRobotExclusions:true }) )
			.on("junk", function(result)
			{
				junkResults[result.html.offsetIndex] = result;
			})
			.on("link", function(result)
			{
				done( new Error("this should not have been called") );
			})
			.on("end", function()
			{
				expect(junkResults).to.have.length(1);
				expect(junkResults[0]).to.containSubset(
				{
					broken: null,
					excluded: true,
					excludedReason: "BLC_ROBOTS"
				});
				done();
			})
			.enqueue("http://blc/disallowed/header.html");
		});
		
		
		
		// TODO :: honorRobotExcluses=true (header) + userAgent=Googlebot/2.1
	});
});
