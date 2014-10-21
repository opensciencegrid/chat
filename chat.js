var http = require('http');
var fs = require('fs');
var url = require('url');
var os = require('os');

var config = require('./secrets').config;

function handler(req, res) {
    var remote_addr = req.connection.remoteAddress;
    if(req.headers['x-real-ip']) {
        remote_addr = req.headers['x-real-ip'];
    }
    var u = url.parse(req.url, true);

    console.dir(req.headers);
    console.log("remote addr:"+remote_addr);
    console.log("url:"+u.pathname);

    if(u.pathname == "/") {
        fs.readFile(__dirname + '/chat.html', function (err, data) {
            if(err) {
              res.writeHead(500);
              return res.end('Error loading html');
            }
            res.writeHead(200);
            res.end(data);
        });
    } else if(u.pathname == "/ac") {
        var lan = false;
        config.goclan_prefix.forEach(function(prefix) {
            if(~remote_addr.indexOf(prefix)) {
                lan = true;
            }
        });
        if(!lan) {
            console.log("non localhost request made for /ac ("+remote_addr+").. ignoring");
            res.writeHead(403);
            res.end();
        } else {
            //console.log(remote_addr);
            //console.dir(u);
            var key = u.query.key;
            var cid = u.query.cid;
            var name = u.query.name;
            acl[key] = {cid: cid, name: name, time: new Date()}; 
            //console.dir(acl);
            console.log("registered:"+key+" name:"+name);
            res.writeHead(200);
            res.end('registered');
        }
    } else {
        res.writeHead(404);
        res.end();
    }
}
//var app = https.createServer(config.ssl_options).listen(config.port);
var app = http.createServer();
app.on('request', handler);
app.on('close', function() {
    console.error("http server closed for some reason! terminating");
    os.exit(1);
});
console.log('server listening on '+config.port);
app.listen(config.port);

//var io = require('socket.io').listen(app, {origins: 'grid.iu.edu:* opensciencegrid.org:*'});
var io = require('socket.io').listen(app);
//io.origins('grid2.iu.edu:* opensciencegrid.org:*');

var clients = {}; //currently connected clients 
var clients_len = 0;
var acl = {}; //key:id, value:{cid,name}
var acl_timeout = 60*60*3; //3 hours long enough?

setInterval(function() {
    //remove old acl... timeout!
    var now = new Date();
    for(var key in acl) {
        var a = acl[key];
        if(now.getTime() - a.time.getTime() > 1000*acl_timeout) {
            console.log("cleaning up old acl: "+key);
            delete acl[key];
        }
    }
}, 1000*60);//check every 60 seconds

io.sockets.on('connection', function (socket) {
    clients[socket.id] = socket;
    clients_len++;
    console.log("client connected:"+socket.id+" client num:"+clients_len);

    socket.on('disconnect', function() {
        console.log("client disconnected:"+socket.id);
        var disconnecting_client = clients[socket.id];
        delete clients[socket.id];
        clients_len--;
        
        //notify to all remaining users
        for(var pid in clients) {
            var peer = clients[pid];
            if(peer.ticketid == disconnecting_client.ticketid) {
                peer.emit('peer_disconnect', socket.id);
            }
        } 
    });

    socket.on('authenticate', function(info) {
        console.log("client sent us auth info");
        console.dir(info);
        
        client = clients[socket.id];
        //store ticket id associated with this connection
        client.ticketid = info.ticketid;
        client.ip = socket.handshake.address;

        //lookup nodekey and store user info (if available..)
        var a = acl[info.nodekey];
        if(a != undefined) {
            console.log("attached access registration for socket:"+socket.id);
            console.dir(a);
            client.acl = a;
        } else {
            console.log("failed to find acl for nodekey:"+info.nodekey+" - assuming guest");
            client.acl = {cid: undefined, name: "Guest", ip: client.ip};
        }

        //find current clients with the same ticket ids
        var peer_acls = {};
        for(var pid in clients) {
            var peer = clients[pid];
            if(peer.ticketid == info.ticketid) {
                peer_acls[pid] = peer.acl;
                if(socket.id != pid) {
                    //construct an object containing a new comer
                    var p = new Object();
                    p[socket.id] = client.acl;
                    peer.emit('peer_connected', p); //notify to all existing peers
                }
            }
        }
        socket.emit('peers', peer_acls); //send list of all peers to new comer
    });
    socket.on('submit', function() {
        console.log('ticket updated: ');
        client = clients[socket.id];
        console.log(client.ticketid);
        for(var pid in clients) {
            var peer = clients[pid];
            if(peer.ticketid == client.ticketid && client.id != pid) {
                peer.emit('submit');
            }
        }
    });
});

