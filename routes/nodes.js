var express = require("express");
var mustache = require('mustache');
var marked = require('marked');
var fs = require("fs");

var appUtils = require("../lib/utils");
var npmNodes = require("../lib/nodes");
var templates = require("../lib/templates");
var events = require("../lib/events");

var app = express();


var iconCache = {};

app.get("/nodes",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    npmNodes.getPopularByDownloads().then(function(nodes) {
        context.nodes = nodes;
        res.send(mustache.render(templates.nodes,context,templates.partials));
    }).otherwise(function(err) {
        if (err) {
            console.log("error loading nodes:",err);
        }
        res.send(404,mustache.render(templates['404'],context,templates.partials));
    });
});
app.get("/node/:id",function(req,res) {
    npmNodes.get(req.params.id).then(function(node) {
        node.sessionuser = req.session.user;
        node.pageTitle = req.params.id;
        //console.log(node);
        node.updated_at_since = appUtils.formatDate(node.updated_at);
        iconCache[req.params.id] = {};
        node.types = [];
        for (var n in node.versions.latest["node-red"].nodes) {
            var def = node.versions.latest["node-red"].nodes[n];
            //console.log(n);
            for (var t in def.types) {
                //console.log("-",n);
                def.types[t].name = t;
                if (def.types[t].icon) {
                    if (fs.existsSync(__dirname+"/../public/icons/"+def.types[t].icon)) {
                        def.types[t].iconUrl = "/icons/"+def.types[t].icon;
                    } else {
                        def.types[t].iconUrl = "/node/"+req.params.id+"/icons/"+def.types[t].icon;
                    }
                }
                def.types[t].hasInputs = (def.types[t].inputs > 0);
                def.types[t].hasOutputs = (def.types[t].outputs > 0);
                if (def.types[t].category == "config") {
                    delete def.types[t].color;
                }

                node.types.push(def.types[t]);
                //console.log(def.types[t]);
                iconCache[req.params.id][def.types[t].icon] = appUtils.mapNodePath(def.types[t].iconPath);
            }
        }
        //console.log(node);
        node.readme = node.readme||"";

        marked(node.readme,{},function(err,content) {
            node.readme = content.replace(/^<h1 .*?<\/h1>/gi,"");
            if (node.repository && node.repository.url && /github\.com/.test(node.repository.url)) {
                var m;
                var repo = node.repository.url;
                var baseUrl;
                if ((m=/git@github.com:(.*)\.git$/.exec(repo))) {
                    baseUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    m = null;
                } else if ((m=/^https:\/\/github.com\/(.*)\.git/.exec(repo))) {
                    baseUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    m = null;
                } else if ((m=/^https:\/\/github.com\/(.*)/.exec(repo))) {
                    baseUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    m = null;
                }


                var re = /(<img .*?src="(.*?)")/gi;

                while((m=re.exec(node.readme)) !== null) {
                    if (!/^https?:/.test(m[2])) {
                        var newImage = m[1].replace('"'+m[2]+'"','"'+baseUrl+m[2]+'"');
                        node.readme = node.readme.substring(0,m.index) +
                                        newImage +
                                      node.readme.substring(m.index+m[1].length);
                    }
                }

                if ((m=/(github.com\/.*?\/.*?)($|\.git$|\/.*$)/.exec(repo))) {
                    node.githubUrl = "https://"+m[1];
                }
            }

            res.send(mustache.render(templates.node,node,templates.partials));
        });

    }).otherwise(function(err) {
        if (err) {
            console.log("error loading node:",err);
        }
        res.send(404,mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
    });
});

app.get("/node/:id/icons/:icon", function(req,res) {
    if (iconCache[req.params.id] && iconCache[req.params.id][req.params.icon]) {
        res.sendfile(iconCache[req.params.id][req.params.icon]);
    } else {
        res.sendfile(__dirname+"/../public/icons/arrow-in.png");
    }
});

app.get("/node/:id/refresh", function(req,res) {
    if (req.session.user) {
        npmNodes.update(req.params.id,{refresh_requested:true});
        events.add({
            action:"refresh_requested",
            module: req.params.id,
            message:req.session.user.login
        });
    }
    res.writeHead(303, {
        Location: "/node/"+req.params.id
    });
    res.end();
});
module.exports = app;
