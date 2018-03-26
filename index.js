/*
	WebsocketManager
	==============================================================
	For managing internal and external websocket connections.


	Author: Christopher Miles
	Site: www.christophermil.es

*/

function isJSON( str ) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

var SocketUtils = {
  GetUserAgent: function(socket){
    if ( socket.upgradeReq && socket.upgradeReq.headers ) return socket.upgradeReq.headers['user-agent'];
    else return '';
  },
  GetHost: function(socket){
    if ( socket.upgradeReq && socket.upgradeReq.headers ) return socket.upgradeReq.headers['host'];
    else return '';
  },
  GetUID: function(socket){
    var uid = '-';

		//if ( socket.upgradeReq && socket.upgradeReq.headers && socket.upgradeReq.headers['sec-websocket-key'] ) uid = socket.upgradeReq.headers['sec-websocket-key'];
		//if ( socket.upgradeReq && socket.upgradeReq.IncomingMessage && socket.upgradeReq.IncomingMessage._writableState && socket.upgradeReq.IncomingMessage._writableState['sec-websocket-key'] ) uid = socket.upgradeReq.IncomingMessage._writableState['sec-websocket-key'];
		var s;
		if ( socket.upgradeReq ) {
			s = socket.upgradeReq;

			if ( s && s.headers && s.headers['x-request-id'] ) uid = s.headers['x-request-id'];
			if ( s && s.headers && s.headers['sec-websocket-key'] ) uid = s.headers['sec-websocket-key'];
			else if ( s && s.IncomingMessage && s.IncomingMessage._writableState && s.IncomingMessage._writableState['x-request-id'] ) uid = socket.upgradeReq.IncomingMessage._writableState['x-request-id'];
		}

		if ( this.debug ) {
			console.log( '' );
			console.log( '[websocket-manager]', 'uid:', uid );
			console.log( '' );
		}

		//console.log( socket.upgradeReq );

		return uid;
  },
  GetHeaders: function(socket){
    var headers = {};

		if ( socket.upgradeReq && socket.upgradeReq.headers ) headers = socket.upgradeReq.headers;

		return headers;
  }
}

var Request = function(wsm,socket,message){
  this.wsm = wsm;
  this.socket = socket;
  this.message = message;
  this.accepted = false;
}

Request.prototype = {
  Accept: function(){
    if ( this.accepted ) return;
    if ( this.wsm._debug ) console.log( 'accepted:', this.GetUID() );
    this.accepted = true;
    this.wsm.AcceptRequest(this);
  },
  Reject: function(){
    this.wsm.RejectRequest(this);
  },
  GetSocket: function(){
    return this.socket;
  },
  GetUserAgent: function(){
    return SocketUtils.GetUserAgent(this.socket);
  },
  GetHost: function(){
    return SocketUtils.GetHost(this.socket);
  },
  GetHeaders: function(){
    return SocketUtils.GetHeaders(this.socket);
  },
  GetIP: function(){
    return this.GetHeaders()[ 'x-forwarded-for' ];
  },
  GetUID: function(){
    return SocketUtils.GetUID(this.socket);
  }
};

var Group = function(name, wsm){
  this.name = name;
  this.groups = [];
  this.sockets = {};
  this.onupdate = false;
  this.wsm = wsm;
  this.emitUpdate = false;
  this.isRoom = false;
  this.listeners = {};
}

Group.prototype = {
  MakeRoom: function(){
    this.isRoom = true;
  },
  GetParent: function(){
    return this.parent;
  },
  HasParent: function(){
    if ( this.isRoom ) return false;
    if ( this.parent !== undefined ) return this.parent;
  },
  SetParent: function( ptr ){
    this.parent = ptr;
  },
  AddGroup: function(name, emitUpdate){
    for ( var i in this.groups ){
      if ( this.groups[i].name === name ) return false;
    }

    var g = new Group(name, this.wsm);
    if ( typeof emitUpdate == 'bool' ) g.emitUpdate = emitUpdate;
    g.SetParent( this );

    this.groups.push( g );
    return g;
  },
  GetRoomSockets: function( uids ){
    var room = this.GetRoom();

    var connections = [];

    for ( var i = 0, len = room.groups.length; i<len; i++ ){
      var keys = Object.keys(room.groups[i].sockets);
      for ( var k = 0, klen = keys.length; k < klen; k++ ){
        if ( uids ) connections.push(keys[k]);
        else connections.push(room.groups[i].sockets[keys[k]]);
      }
    }

    return connections;
  },
  GetGroup: function(name){
    for ( var i = 0; i < this.groups.length; i++ ){
      if ( name == this.groups[i].name ) return this.groups[i];
    }
    return false;
  },
  GetRoom: function(){
    var room = this;
    while ( room.HasParent() ){
      room = room.GetParent();
    }
    return room;
  },
  AddSocket: function(socket){
    var uid = SocketUtils.GetUID(socket);
    if( this.sockets[uid] == undefined ){
      this.sockets[uid] = socket;
      this.UpdateListeners(uid,'added');
      this.GetRoom().UpdateListeners(uid,'added');
    }
  },
  RemoveSocket: function(socket){
    var uid = SocketUtils.GetUID(socket);
    if( this.sockets[uid] !== undefined ){
      delete this.sockets[uid];
      this.UpdateListeners(uid,'removed');
      this.GetRoom().UpdateListeners(uid,'removed');
    }
  },
  GetConnections: function(){
    return Object.keys(this.sockets);
  },
  GetSockets: function(uids){
    var keys = Object.keys(this.sockets);
    var arr = [];
    for ( var i = 0, len = keys.length; i < len; i++ ){
      if (uids) arr.push(keys[i]);
      else arr.push(this.sockets[keys[i]]);
    }

    return arr;
  },
  UpdateListeners: function(uid, eventType){
    var connections = this.GetConnections();
    var keys = Object.keys(this.listeners);
    //console.log( keys );

    for ( var i = 0, len = keys.length; i < len; i++ ){
      this.wsm.Emit( this.listeners[keys[i]].socket, {
        event: 'connections:' + this.listeners[keys[i]].command,
        eventType: eventType,
        connections: connections,
        uid: uid
      });
    }
  },
  AddListener: function(socketObj){
    var uid = SocketUtils.GetUID(socketObj.socket);

    if( this.listeners[uid] == undefined ){
      this.listeners[uid] = socketObj;

      var connections = this.GetConnections();

      this.wsm.Emit( socketObj.socket, {
        event: 'connections:' + socketObj.command,
        connections: connections
      });
    }
  },
  RemoveListener: function(socket){
    var uid = SocketUtils.GetUID(socket);

    if( this.listeners[uid] !== undefined ){
      delete this.listeners[uid];
    }
  }
}

WebsocketManager = {
  ////////////////////////////////////////////////////////////////////// vars
	config: {
    externalKey: -1,
    env: 'dev',
    whitelist_dev: [],
    whitelist_staging: [],
    whitelist_production: [],
    keepAliveInt: 15000,
    autoReconnect: true,
    pingMessage: 'ping',
    acceptMessage: '[accepted]',
    rejectMessage: '[rejected]'
  },
  wss: null,
  validSockets: {},
  pingInt: null,
  listeners: {},
  ////////////////////////////////////////////////////////////////////// methods

  /*

  [Group.GetConnections()]

  */
  _debug: false,
  Debug: function(){
    this._debug = true;
  },
  FindGroup: function(cmd){
    var gArr = cmd.split('-');
    var group;
    var g;

    if ( this.rooms !== undefined ) l = this.rooms;
    else if ( this.groups !== undefined ) l = this.groups;

    try{
      for ( var i = 0, len = gArr.length; i < len; i++){
        g = l.GetGroup(gArr[i]);
        if ( g === false ) return false;
      }

      return g;
    }catch(e){
      return false;
    }
  },
  On: function(event, cb){
    this.listeners[event] = cb;
  },
  Trigger: function(event, data){
    if ( this.listeners[event] != undefined ) this.listeners[event](data);
  },
  ParseRequest: function(request){
    //console.log( request );
    if ( request.message === 'pong' ) return;

    if ( this._debug ) console.log( request.GetUID() + " <=", request.message );
    
    var socket = request.GetSocket();
    var uid = request.GetUID();

    if ( isJSON(request.message) ){
      var msg = JSON.parse(request.message);
      if ( this._debug ) console.log( msg );
      if ( msg.request === undefined ) return;
      if ( msg.request.indexOf('join:') != -1 ){
        var cmd = msg.request.split('join:')[1];
        var group = this.FindGroup(cmd);
        if ( group !== false ){
          this.validSockets[uid].group = group;
          group.AddSocket(request.GetSocket());

          this.Emit( socket, {
            request: msg.request,
            success: true,
            uid: uid
          });
        }
      } else if ( msg.request == 'get:uid' ){
        this.Emit( socket, {
          request: msg.request,
          success: true,
          uid: uid
        });
      } else if ( msg.request == 'wsm:manager' ){
        this.Trigger('wsm:manager', {
          socket: request.GetSocket(),
          uid: uid,
          message: msg.message
        })
      } else if ( msg.request == 'listen:connections:room' ){

        if ( this.validSockets[uid].group ) {
          var room = this.validSockets[uid].group.GetRoom();

          room.AddListener({
            socket: socket,
            command: 'room'
          })

          this.validSockets[uid].listeningTo.push( room );

          this.Emit( socket, {
            request: msg.request,
            success: true
          });
        }
      } else if ( msg.request.indexOf('listen:connections:') != -1 ){
        var cmd = msg.request.split('listen:connections:')[1];
        var group = this.FindGroup(cmd);
        if ( group !== false ){

          //group.AddListener(socket);
          group.AddListener({
            socket: socket,
            command: cmd
          });
          this.validSockets[uid].listeningTo.push( group );

          this.Emit( socket, {
            request: msg.request,
            success: true
          });
        }
      } else if ( msg.request === 'emit:room' ){
        if ( this.validSockets[uid].group ) {
          this.Emit( this.validSockets[uid].group.GetRoomSockets(), this.ConcatEmitMessage(msg,uid) );
        }
      } else if ( msg.request === 'emit' ){
        if ( this.validSockets[uid].group ) {
          this.Emit( this.validSockets[uid].group.GetSockets(), this.ConcatEmitMessage(msg,uid) );
        }
      } else if ( msg.request.indexOf('emit:' ) != -1 ) {
        var cmd = msg.request.split('emit:')[1];

        var group = this.FindGroup(cmd);
        if ( group !== false ){
          this.Emit( group.GetSockets(), this.ConcatEmitMessage(msg,uid) );
        }
      } else if ( msg.request.indexOf('to:') != -1 ){
        var cmd = msg.request.split('to:')[1];
        if ( this.validSockets[cmd] ) this.Emit( this.validSockets[cmd].socket, this.ConcatEmitMessage(msg,uid) );
      }
    }
  },
  ConcatEmitMessage:function(msg,uid){
    var m = {};

    m = msg;
    delete m.request;
    m.from = uid;

    return m;
  },
  Emit: function(ws, event, msg ){
    if ( Array.isArray(ws) ){
      for ( var i = 0, len = ws.length; i < len; i++){
        this.Emit( ws[i], event, msg );
      }
    } else {
      if ( this._debug ) console.log( SocketUtils.GetUID(ws), '====>', event, msg );

      if ( ws.readyState !== 1 ){
        setTimeout( function() {
          ws.emit( event, msg );
        }, 100 );
      } else {
        if ( typeof event === 'string' ) {
          if ( msg === undefined ) {
            ws.send( event );
            //if ( this._debug && event !== 'ping' ) console.log( SocketUtils.GetUID(ws) + ' =>', event );
          } else {
            var o = {
              event: event
            }

            o.message = msg;
            o = JSON.stringify(o);

            ws.send(o);
            //if ( this._debug ) console.log( SocketUtils.GetUID(ws) + ' =>', o );
          }
        } else if ( typeof event === 'object' ) {
          ws.send( JSON.stringify( event ) );
          //if ( this._debug ) console.log( SocketUtils.GetUID(ws) + ' =>', event );
        }
      }
    }

  },
  AcceptRequest: function(request){
    var uid = request.GetUID();

    this.validSockets[request.GetUID()] = {
      listeningTo:[],
      socket: request.GetSocket()
    };

    this.Emit( request.GetSocket(), {
      request:"connect",
      success: true,
      message: this.config.acceptMessage,
      uid: uid
    });

    if ( this._debug ) console.log( 'added socket:', uid );

    this.Trigger(this.config.acceptMessage, {
      message: this.config.acceptMessage,
      uid: uid
    });

    this.ParseRequest(request);
  },
  RejectRequest: function(request){
    this.Emit( request.GetSocket(), {
      request:"connect",
      success: false,
      message: this.config.rejectMessage
    });

    this.Trigger(this.config.rejectMessage, {
      message: this.config.rejectMessage,
      uid: uid
    });

    request.GetSocket().onclose = function(){};
		request.GetSocket().close();
  },
  RemoveSocket: function(socket){
    var uid = SocketUtils.GetUID(socket);
    if ( this.validSockets[uid] !== undefined ) {

       var closedData = {
        uid: uid
      };

      if ( this.validSockets[uid].group ){
        closedData.group = this.validSockets[uid].group.name;
        this.validSockets[uid].group.RemoveSocket(socket);
      }

      this.Trigger('connection:closed', closedData );

      for ( var i = 0, len = this.validSockets[uid].listeningTo.length; i < len; i++ ){
        this.validSockets[uid].listeningTo[i].RemoveListener(socket);
      }

      delete this.validSockets[uid];
      if ( this._debug ) console.log( 'removed socket:', uid );
    } else {
      if ( this._debug ) console.log( 'couldnt remove socket:', uid, '(not found)' );
    }
  },
  AddRoom: function(name, emitUpdate){
    if ( this.rooms == undefined ){
      var rooms = new Group('rooms', this);
      this.rooms = rooms;
    }

    var room = this.rooms.AddGroup(name, emitUpdate);
    room.MakeRoom();
    return room;
  },
  AddGroup: function(name, emitUpdate){
    if ( this.groups == undefined ){
      var groups = new Group('groups', this);
      groups.MakeRoom();
      this.groups = groups;
    }
    return this.groups.AddGroup(name, emitUpdate);
  },
  SetSocketServer: function( wss ){
    this.wss = wss;
    var self = this;

    wss.on( 'connection', function(ws){


      ws.onclose = function(evt){
        self.RemoveSocket(ws);
      }

      ws.on( 'message', function(msg){
        if ( this._debug ) console.log( 'message <=', msg );
        var request = new Request(self,ws,msg);
        self._ValidateRequest(request);
      });

    });
  },
  SetKeepAliveInterval: function( i ) {
    this.keepAliveInt = i;
  },
  Setup: function(config){
    var keys = Object.keys(this.config);

    for ( var i in keys ){
      this.config[keys[i]] = config[keys[i]];
    }

    if ( this.pintInt ) clearTimeout(pintInt);
    this.Ping();

    if ( this._debug ) console.log( this.config );
  },
  Ping: function(){
    //if ( this._debug ) console.log( 'ping-pong', new Date() );

    var s = Object.keys(this.validSockets);
    for ( var i = 0, len = s.length; i<len; i++){
      this.Emit( this.validSockets[s[i]].socket, this.config.pingMessage );
    }
    this.pintInt = setTimeout(function(){
      WebsocketManager.Ping();
    }, this.config.keepAliveInt );
  },
  _ValidateRequest: function(request){

    /*console.log( '_ValidateRequest =>' );
    console.log( 'socket', request.GetUID(), request.GetHost(), request.GetIP(), request.GetUserAgent(), request.GetHeaders() );
    console.log( ' ' );
    console.log( request );
    console.log( request.socket._socket.address(), request.socket._socket.remoteAddress );*/

    //console.log( 'socket', request.GetUID(), request.GetHost() );

    var uid = request.GetUID();
    if ( this.validSockets[uid] !== undefined ) {
      return this.ParseRequest(request);
    }

    var host = request.GetHost();
    //console.log( 'ValidateRequest:', host );

    if ( this.config['whitelist_'+this.config.env] != undefined ){
      for ( var i in this.config['whitelist_'+this.config.env] ){
        if ( host == this.config['whitelist_'+this.config.env][i] ) return request.Accept();
      }
    }

    if ( this.config.externalKey !== -1 ) {
      if ( request.message.indexOf(this.config.externalKey) !== -1 ) return request.Accept();
    }

    if ( !request.accepted ) this.ValidateRequest( request );

  },
  SetValidationMethod: function(method){
    if ( typeof method == 'function' ) this.ValidateRequest = method;
  },
  ValidateRequest: function(request){
    return true;
  }

};

module.exports = WebsocketManager;