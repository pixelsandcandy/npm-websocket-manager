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

WebsocketManager = {
	groups: [],
	ips: [],
	sockets: [],
	socketsIP: [],
	sources: [],

	rooms: [],
	roomConfig: [],

	externalKey: null,
	origin: null,
	wss: null,

	debug: true,

	config: function( obj ){
		for ( key in obj ) {
			this[key] = obj[key];
		}

		this.initSources();
	},

	setSocketServer: function( wss ) {
		WebsocketManager.wss = wss;
	},

	broadcastJSON: function( event, data ) {
		for ( var i = 0, len = this.sockets.length; i < len; i++ ) {
			this.sendJSON( this.sockets[i].ws, event, data );
		}
	},

	broadcastString: function( str ){
		for ( var i = 0, len = this.sockets.length; i < len; i++ ) {
			this.sendString( this.sockets[i].ws, str );
		}
	},

	keepAliveTime: 40000,
	onKeepAlive: null,
	keepAlive: function( time ) {
		if ( time ) WebsocketManager.keepAliveTime = time;

		if ( WebsocketManager.wss ) {
			WebsocketManager.wss.clients.forEach(function each( client ) {
		  		// make sure connection is open otherwise it'll crash
		    	if ( client.readyState === 1 ) {
		    		client.send( '[KeepAlive]' );
		    	}
		  	});
		} else {
			WebsocketManager.broadcastString( '[KeepAlive]' );
		}

		if ( WebsocketManager.onKeepAlive ) WebsocketManager.onKeepAlive();

		setTimeout( WebsocketManager.keepAlive, WebsocketManager.keepAliveTime );
	},

	initSources: function() {
		for ( var i = 0, len = this.sources.length; i < len; i++ ) {
			//console.log( this.sources[i] );
			if ( typeof this.sources[i] === 'string' ) {
				this.sources[i] = {
					id: this.sources[i],
					limit: -1,
					total: 0
				}
			} else {
				this.sources[i].total = 0;
			}
		}

		/*console.log( '>>>>>>' );
		console.log( '>>>>>>' );
		console.log( this.sources );*/
	},

	getUserAgent: function( socket ) {
		if ( socket.upgradeReq && socket.upgradeReq.headers ) return socket.upgradeReq.headers['user-agent'];
		else return '';
	},

	getOrigin: function( socket ) {
		if ( socket.upgradeReq && socket.upgradeReq.headers ) return socket.upgradeReq.headers['origin'];
		else return '';
	},

	verifiedSocketUID: function( uid ) {
		if ( this.sockets[ uid ] !== undefined ) return true;
		else return false;
	},

	verifiedSocket: function( socket ) {
		var uid = this.getUID( socket );
		return this.verifiedSocketUID( uid );
	},

	validateSocket: function( socket, msg ) {

		if ( this.verifiedSocket( socket ) ) return true;

		var ua = this.getUserAgent( socket );
		var origin = this.getOrigin( socket );

		// external socket
		if ( ua === undefined ) {
			if ( this.externalKey ) {
				if ( msg.indexOf( this.externalKey ) === -1 ) return false;
				else return true;
			} else {
				return true;
			}
		}

		// internal sockets
		if ( this.origin ) {
			if ( this.origin.env === 'production' ) {
				if ( origin !== this.origin.production ) return false;
				else return true;
			} else {
				if ( origin !== this.origin.local ) return false;
				else return true;
			}
		}

	},

	addGroup: function( name ){
		if ( this.groups[name] === undefined ) this.groups[name] = [];
		if ( this.ips[name] === undefined ) this.ips[name] = [];
	},

	addRoom: function( config ) {
		console.log( '++++', '[AddRoom]', config );
		if ( this.rooms[config.id] === undefined ) {
			this.rooms[config.id] = [];
			this.roomConfig.push( config );
		}
	},

	getRoom: function( name ) {
		return this.rooms[name] || [];
	},

	removeRoom: function( name ) {
		this.rooms.remove( name );
	},

	getGroup: function( name ) {
		return this.groups[name] || [];
	},

	getGroupIPs: function( name ) {
		return this.ips[name] || [];
	},

	getSourceFromSocket: function( socket ) {
		var uid = this.getUID( socket );
		if ( this.sockets[uid] ) {
			return this.getSource( this.sockets[uid].group );
		}
		return false;
	},

	getSource: function( id, andGroup ) {
		if ( this.debug ) console.log( '[websocket-manager]', id, typeof id );

		if ( typeof id === 'string' ) {
			for ( var i = 0, len = this.sources.length; i < len; i++ ) {
				if ( id === this.sources[i].id ) {
					var obj = (JSON.parse(JSON.stringify(this.sources[i])));
					if ( andGroup ) obj.group = this.getGroup( obj.id );
					if ( this.sources[i].onupdate ) obj.onupdate = this.sources[i].onupdate;
					if ( this.sources[i].onmessage ) obj.onmessage = this.sources[i].onmessage;
					if ( this.sources[i].onupdategroup ) obj.onupdategroup = this.sources[i].onupdategroup;
					return obj;
				}
			}
			return false;
		} else if ( Array.isArray(id) ) {
			var arr = [];
			var temp;
			for ( var i = 0, len = id.length; i < len; i++ ) {
				//if ( id === this.sources[i].id ) return this.sources[i];
				temp = this.getSource( id[i], andGroup );
				if ( temp ) arr.push( temp );
			}
			return arr;
		}
		return false;

		/*for ( var i = 0, len = this.sources.length; i < len; i++ ) {
			if ( id === this.sources[i].id ) return this.sources[i];
		}
		return false;*/
	},
	triggerOnUpdate: function( source ) {
		//console.log( 'triggerOnUpdate', Math.random() );
		if ( source.onupdate ) {
			var group = this.getGroup( source.id );

			source.onupdate({
				total: group.length,
				limit: source.limit,
				id: source.id
			});
		}

		this.triggerOnUpdateGroup( source );
	},
	triggerOnUpdateGroup: function( source ) {
		//console.log( 'triggerOnUpdateGroup', source );
		if ( source.onupdategroup ) {

			var group = this.getGroup( source.id );
			
			source.onupdategroup({
				total: group.length,
				limit: source.limit,
				id: source.id,
				group: group
			});
		}
	},
	storeSocket: function( socket, group, roomJSON ) {
		var uid = this.getUID( socket );
		var ip = this.getHeaders( socket )[ 'x-forwarded-for' ];
		// socket is stored already
		/*if ( this.sockets[ uid ] !== undefined ) {
			if ( this.debug ) console.log( '[websocket-manager]', 'socket:', uid, 'already exists' );
		}*/


		//this.removeSocket( uid );


		if ( roomJSON ) {
			var room = roomJSON.room;

			// room not established or ended
			if ( this.rooms[ room ] === undefined ) return false;			

			var config = this.roomConfig[ room ];

			var valid = false;

			if ( !config || config.limit === -1 ) {
				valid = true;
			} else {
				if ( this.rooms[ room ].length < config.limit ) {
					valid = true;
				} else {
					this.closeSocket( socket, '[Connection Rejected] Reached limit(' + config.limit + ') for: ' + config.id );
				}
			}

			if ( valid ) {
				this.rooms[ room ].remove( uid );
				this.rooms[ room ].push( uid );
			}

			//console.log( 'uid:', uid );

			this.sockets[ uid ] = {
				ws: socket,
				room: room,
				group: false
			};

			this.socketsIP[ ip ] = {
				ws: socket,
				room: room,
				group: false
			};


		} else if ( group ) {
			var triggerUpdate = false;

			this.addGroup( group );

			var source = this.getSource( group );
			//console.log( source );
			var valid = false;

			if ( source ) {
				if ( source.limit == -1 ) {
					//source.total++;

					// make sure there's no redundancy 
					valid = true;
					triggerUpdate = true;
				} else {
					if ( this.groups[ group ].length < source.limit ) {
						//source.total++;

						// make sure there's no redundancy 
						valid = true;
						triggerUpdate = true;
					} else {
						this.closeSocket( socket, '[Connection Rejected] Reached limit(' + source.limit + ') for: ' + source.id );
						return false;
					}
				}
			} else {
				// make sure there's no redundancy 
				valid = true;
			}

			if ( valid ) {
				this.groups[ group ].remove( uid );
				this.groups[ group ].push( uid );

				this.ips[ group ].remove( ip );
				this.ips[ group ].push( ip );
			}

			this.sockets[ uid ] = {
				ws: socket,
				group: group
			};

			this.socketsIP[ ip ] = {
				ws: socket,
				group: group
			};

			if ( triggerUpdate ) this.triggerOnUpdate( source );

		} else {
			this.sockets[ uid ] = {
				ws: socket
			}

			this.socketsIP[ ip ] = {
				ws: socket
			}
		}

		return true;

	},

	removeSocket: function( socket, close, msg ) {
		var uid = this.getUID( socket );
		var ip = this.getHeaders( socket )[ 'x-forwarded-for' ];

		// can't find socket ref
		var obj = this.sockets[ uid ];

		if ( obj === undefined ) return false;
		var source = false;

		if ( obj.group ) {
			this.groups[ obj.group ].remove( uid );
			if ( ip ) this.ips[ obj.group ].remove( ip );

			source = this.getSource( obj.group );
			//source.total--;
			
			
		}

		if ( close ) {
			this.closeSocket( socket, msg );
		}

		this.sockets.remove( uid );

		if ( source ) this.triggerOnUpdate( source );

	},

	closeSocket: function( socket, msg ) {
		if ( socket.readyState === 1 && msg ) socket.send( msg );

		socket.onclose = function () {};
		socket.close();
	},

	getUID: function( socket ) {

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

	getHeaders: function( socket ) {

		var headers = {};

		if ( socket.upgradeReq && socket.upgradeReq.headers ) headers = socket.upgradeReq.headers;

		if ( this.debug ) {
			console.log( '' );
			console.log( '[websocket-manager]', 'headers:', headers );
			console.log( '' );
		}

		return headers;
	},

	addSource: function( s ) {
		if ( typeof s === 'string' ) {
			s = {
				id: s,
				limit: -1,
				total: 0
			}
		} else {
			s.total = 0;
		}

		this.sources.push( s );
	},

	removeSource: function( s ) {
		var foundIndex;
		for ( var i = 0, len = this.sources.length; i < len; i++ ) {
			if ( s === this.sources[i].id ) {
				foundIndex = i;
				break;
			}
		}

		if ( foundIndex ) this.sources.splice( foundIndex, 1);
	},

	validateSource: function( msg ){
		var id;
		for ( var i = 0, len = this.sources.length; i < len; i++ ) {
			id = this.sources[i].id || this.sources[i];
			if ( msg.indexOf( id ) !== -1 ) return id;
		}
		return false;
	},

	validateRoom: function( msg ) {
		console.log( 'validateRoom', msg );
		var id;
		for ( var i = 0, len = this.roomConfig.length; i < len; i++ ) {
			id = this.roomConfig[i].id || this.roomConfig[i];
			console.log( i, this.roomConfig[i] );
			if ( msg.indexOf( id ) !== -1 ) return id;
		}
		return false;
	},

	checkConnecting: function( msg ) {
		if ( msg.indexOf( '[Connect]' ) !== -1 || msg.indexOf( '[Room::Connect]' ) !== -1 ) return true;
		else return false;
	},

	groupSendJSON: function( group, event, data ) {
		var g = this.getGroup( group );
		var uid;
		for ( var i = 0, len = group.length; i < len; i++ ) {
			uid = g[ i ];
			if ( this.sockets[uid] && this.sockets[uid].ws ) this.sendJSON( this.sockets[uid].ws, event, data );
		}
	},

	groupSendString: function( group, str ) {
		var g = this.getGroup( group );
		var uid;
		for ( var i = 0, len = group.length; i < len; i++ ) {
			uid = g[ i ];
			if ( this.sockets[uid] && this.sockets[uid].ws ) this.sendString( this.sockets[uid].ws, str );
		}
	},

	roomSendString: function( room, str ) {
		var r = this.getRoom( room );
		var uid;
		for ( var i = 0, len = room.length; i < len; i++ ) {
			uid = g[ i ];
			if ( this.sockets[uid] && this.sockets[uid].ws ) this.sendString( this.sockets[uid].ws, str );
		}
	},

	sendJSON: function( ws, event, data ) {
		if ( ws.readyState === 1 ) {
			var o = {
    			event: event
	    	}

	    	if ( data ) o.data = data;
	    	o = JSON.stringify( o );

	    	ws.send( o );
		} else if ( ws.readyState === 0 ) {
			var self = this;
			setTimeout( function() {
				self.sendJSON( ws, event, data );
			}, 100 );
		}
		
	},

	sendString: function( ws, str ) {
		if ( ws.readyState === 1 ) {
			ws.send( str );
		} else if ( ws.readyState === 0 ) {
			var self = this;
			setTimeout( function() {
				self.sendString( ws, str );
			}, 100 );
		}
	},

	checkMessage: function( msg, ws, callback ) {
		//msg = msg.event || msg;

		var isRoom = false;
		var roomJSON = false;
		if ( msg.indexOf( '[Room::' ) !== -1 ) isRoom = true;

		if ( isRoom ) {
			if ( isJSON(msg) ) roomJSON = JSON.parse( msg );
		}

		var validSource = this.validateSource( msg ) || this.validateRoom( msg );
		var validSocket = this.validateSocket( ws, msg );
		var connecting = this.checkConnecting( msg );

		if ( this.debug ) console.log( '[websocket-manager]', validSource, validSocket, connecting );
		console.log( this.validateRoom( msg ) );
		console.log( this.validateSource( msg ) );

		var valid = false;

		var socketStored = false;

		if ( connecting ) {
			if ( validSource && validSocket ) valid = true;

			socketStored = this.storeSocket( ws, validSource, roomJSON );

			if ( socketStored ) {
				WebsocketManager.sendString( ws, '[Connection Established]' );
			} else {
				if ( this.debug ) console.log( '[websocket-manager]', 'connecting... socket not stored' );
			}
		} else {
			if ( validSocket ) valid = true;
		}
		

		var res = {
			sourceName: validSource,
			validSocket: validSocket,
			valid: valid,
			connecting: connecting,
			socket: ws,
			message: msg
		}

		if ( res.connecting ) res.stored = socketStored;

		if ( callback ) {
			callback( res );
		}

		


		if ( valid && isRoom ) {
			
			if ( roomJSON.command === '[Room::Connect]' ){
				var uid = this.getUID( ws );
				//console.log( 'uid:', uid );
				if ( roomJSON.name ) this.sockets[ uid ].name = roomJSON.name;
				else if ( roomJSON[ "name-pattern" ] ) {
					this.sockets[ uid ].name = roomJSON[ "name-pattern" ] + (this.getGroup( roomJSON.room ).length-1);
				}
			} else if ( roomJSON.command === '[Room::Add]' ) {
				this.addRoom({
					id: roomJSON.room,
					limit: -1 || roomJSON.limit
				});
			}
		}


		if ( valid && !connecting ) {
			if ( isRoom ) {
				if ( roomJSON.command === '[Room::Send]'){
					if ( roomJSON.to !== undefined ){
						var names = roomJSON.to.split(',');
						var room = this.getRoom( roomJSON.room );

						for ( var i = 0, len = names.length; i < len; i++ ) {
							for ( var j = 0; j < room.length; j++ ) {
								if ( this.sockets[ room[j] ].name === names[i] ) {
									this.sendString( ws, msg );
									break;
								}
							}
						}

					} else {
						this.roomSendString( roomJSON.room, msg );
					}
				}
				
			} else {
				var source = this.getSourceFromSocket( ws );
				if ( source.onmessage ) {
					source.onmessage( msg, ws, this.getUID( ws ), this.getHeaders( ws )  );
				}
			}
		}

		if ( !valid ) WebsocketManager.closeSocket( ws, '[Connection Rejected] Invalid credentials.' );

		return res;
	}

};

module.exports = WebsocketManager;