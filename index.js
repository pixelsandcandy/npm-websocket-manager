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

	debug: false,

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
				for ( var i = 0; i < this.origin.local.length; i++ ) {
					if ( origin === this.origin.local[i] ) return true;
				}
				return false;
			}
		}

		return true;

	},

	addGroup: function( name ){
		if ( this.groups[name] === undefined ) this.groups[name] = [];
		if ( this.ips[name] === undefined ) this.ips[name] = [];
	},

	addRoom: function( config ) {
		//console.log( '++++', '[AddRoom]', config );
		if ( this.rooms[config.id] === undefined ) {
			this.rooms[config.id] = {};

			if ( typeof config.limit === 'object' ){
				for ( var key in config.limit ) {
					console.log( key );
					this.rooms[config.id][key] = {};
				}
			};

			this.roomConfig.push( config );
		}
	},

	getRoom: function( name ) {
		return this.rooms[name] || [];
	},

	getRoomConfig: function( id ){
		for ( var i = 0, len = this.roomConfig.length; i < len; i++ ){
			if ( this.roomConfig[i].id === id ) return this.roomConfig[i];
		}

		return false;
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
			var id = roomJSON.ruid;
			//console.log( roomJSON );
			var room = this.getRoom( id );

			var config = this.getRoomConfig( id );

			var valid = false;
			var group = false;

			//console.log( 'CONFIG', config );
			//console.log( typeof config );
			if ( typeof config !== 'object' && (!config || config.limit === -1  ) ) {
				//console.log( "WTF" );
				valid = true;
			} else {
				//console.log( "YAY" );
				//console.log( config );
				if ( typeof config.limit === 'number' ) {
					//console.log( 'A' );
					if ( Object.keys( this.rooms[id] ).length < config.limit ) {
						valid = true;
					} else {
						this.closeSocket( socket, '[Connection Rejected] Reached limit(' + config.limit + ') for: ' + config.id );
					}
				} else if ( typeof config.limit === 'object' ) {
					//console.log( 'B' );
					if ( roomJSON.config && typeof roomJSON.config.group === 'string'  ) {
						//console.log( room[ roomJSON.config.group ], config.limit[ roomJSON.config.group ]  );
						//console.log( Object.keys( room[ roomJSON.config.group ] ).length, config.limit[ roomJSON.config.group ] );
						if ( config.limit[ roomJSON.config.group ] && Object.keys( room[ roomJSON.config.group ] ).length < config.limit[ roomJSON.config.group ] ){
							valid = true;
							group = roomJSON.config.group;
						}
					}
				}
				
			}

			//console.log( 'VALID', valid );
			//console.log( this.rooms[ id ] );

			if ( valid && this.rooms[ id ] && roomJSON.command === '[Room::Join]' ) {
				var connect = false;

				if ( group ) {
					if ( !this.rooms[ id ][ group ][ roomJSON.name ] ) {

						connect = true;
						WebsocketManager.sendString( socket, '[Room::Joined] ' + roomJSON.name );

					} else {
						if ( this.rooms[ id ][ group ][ roomJSON.name ].ws.readyState > 1 ) {
							WebsocketManager.sendString( socket, '[Room::Rejoined] ' + roomJSON.name );
							connect = true;
						}
					}
				} else {
					if ( this.rooms[ id ][ roomJSON.name ] === undefined ) {

						connect = true;
						WebsocketManager.sendString( socket, '[Room::Joined] ' + roomJSON.name );

					} else {
						if ( this.rooms[ id ][ roomJSON.name ].ws.readyState > 1 ) {
							WebsocketManager.sendString( socket, '[Room::Rejoined] ' + roomJSON.name );
							connect = true;
						}
					}
				}
				



				if ( connect ) {
					if ( group ) {
						room[ group ][ roomJSON.name ] = {
							ws: socket,
							uid: uid,
							name: roomJSON.name
						}
					}
					if ( room[ roomJSON.name ] === undefined ) {
						room[ roomJSON.name ] = {
							ws: socket,
							uid: uid,
							name: roomJSON.name
						}
					}
					
					var jsonData = {
						event: '[Room::UserConnected]',
						name: roomJSON.name
					};

					if ( group ) jsonData.group = group;

					WebsocketManager.roomSendJSON( roomJSON.ruid, jsonData, uid );

					var roomConfig = WebsocketManager.getRoomConfig( roomJSON.ruid );
					if ( roomConfig ) WebsocketManager.sendJSON( roomConfig.opener, jsonData );

				} else {
					this.closeSocket( socket, '[Connection Rejected] User exists (' + roomJSON.name + ') in room ' + id );
				}
				
			}

			//console.log( this.rooms[ id ] );

			//console.log( 'uid:', uid );

			/*this.sockets[ uid ] = {
				ws: socket,
				room: id,
				group: false
			};

			this.socketsIP[ ip ] = {
				ws: socket,
				room: id,
				group: false
			};*/

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
		//console.log( 'validateRoom', msg );
		var id;
		for ( var i = 0, len = this.roomConfig.length; i < len; i++ ) {
			id = this.roomConfig[i].id || this.roomConfig[i];
			//console.log( i, this.roomConfig[i] );
			if ( msg.indexOf( id ) !== -1 ) return id;
		}
		return false;
	},

	checkConnecting: function( msg ) {
		if ( msg.indexOf( '[Connect]' ) !== -1 || msg.indexOf( '[Room::Join]' ) !== -1 ) return true;
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

	roomSendString: function( room, str, uid ) {
		var r = this.getRoom( room );
		for ( var key in r ){
			if ( r[key].ws && r[key].ws.readyState === 1 && r[key].uid !== uid ) this.sendString( r[key].ws, str );
		}
	},

	roomSendJSON: function( room, json, uid ) {
		var r = this.getRoom( room );
		delete json.command;
		delete json.ruid;
		for ( var key in r ){
			if ( r[key].ws && r[key].ws.readyState === 1 && r[key].uid !== uid ) this.sendJSON( r[key].ws, json );
		}
	},

	sendJSON: function( ws, event, msg ) {
		if ( ws.readyState !== 1 ){
	        setTimeout( function() {
	          ws.emit( event, msg );
	        }, 100 );
	      } else {
	        if ( typeof event === 'string' ) {
	          if ( msg === undefined ) {
	            ws.send( event );
	          } else {
	            var o = {
	              event: event
	            }

	            o.message = msg;
	            o = JSON.stringify(o);

	            ws.send(o);
	          }
	        } else if ( typeof event === 'object' ) {
	          ws.send( JSON.stringify( event ) );
	        }
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

			if ( roomJSON.command === '[Room::Join]' ) {
				if ( roomJSON.name !== undefined ) {
					var name = roomJSON.name;
					//console.log( roomJSON );
					if ( name.indexOf( '%n' ) !== -1 ) {

						if ( roomJSON.config && roomJSON.config.group ) {
							//console.log( 'GROUP' );
							//console.log( this.getRoom( roomJSON.ruid )[roomJSON.config.group] );
							name = name.replace( '%n', ( Object.keys( this.getRoom( roomJSON.ruid )[roomJSON.config.group] ).length + 1) );
						} else {
							name = name.replace( '%n', ( Object.keys( this.getRoom( roomJSON.ruid ) ).length + 1) );
						}
						
					}
					roomJSON.name = name;
				} else {
					var name = 'anonymous-' + ( Object.keys( this.getRoom( roomJSON.ruid ) ).length + 1);
					roomJSON.name = name;
				}
			}
		}

		var validSource = this.validateSource( msg ) || this.validateRoom( msg );
		var validSocket = this.validateSocket( ws, msg );
		var connecting = this.checkConnecting( msg );

		if ( this.debug ) console.log( '[websocket-manager]', validSource, validSocket, connecting );
		//console.log( this.validateRoom( msg ) );
		//console.log( this.validateSource( msg ) );

		var valid = false;

		var socketStored = false;

		if ( connecting ) {
			if ( validSource && validSocket ) valid = true;

			if ( valid ) socketStored = this.storeSocket( ws, validSource, roomJSON );
			//console.log( 'socketStored', socketStored );
			if ( socketStored ) {
				WebsocketManager.sendString( ws, '[Connection Accepted]' );
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

		if ( res.connecting ) {
			res.stored = socketStored;
			if ( !isRoom ) {
				ws.on( 'close', function(){
					WebsocketManager.removeSocket( ws );
				});
			}
		}

		if ( callback ) {
			callback( res );
		}

		var uid = this.getUID( ws );

		if ( valid && isRoom ) {
			
			if ( roomJSON.command === '[Room::Join]' ){
				

				//this.sockets[ uid ].name = roomJSON.name;
				//WebsocketManager.sendString( ws, '[Room Joined] ' + name );
				//console.log("WTF" );
				var room = this.getRoom( roomJSON.ruid );

				for ( key in room ) {
					if ( uid === room[key].uid ) {
						roomJSON.from = room[key].name;
						break;
					}
				}

				ws.on( 'close', function(){

					console.log( roomJSON );

					WebsocketManager.roomSendJSON( roomJSON.ruid, {
						event: '[Room::UserDisconnected]',
						name: roomJSON.from
					}, uid );

					var roomConfig = WebsocketManager.getRoomConfig( roomJSON.ruid );
					if ( roomConfig ) WebsocketManager.sendJSON( roomConfig.opener, {
						event: '[Room::UserDisconnected]',
						name: roomJSON.from
					});

					if ( roomJSON.config && roomJSON.config.group ) {
						delete room[ roomJSON.config.group ][ roomJSON.name ];
					}


				})

			} else if ( roomJSON.command === '[Room::Open]' ) {
				if ( this.rooms[ room ] === undefined ){
					if ( !roomJSON.options ) roomJSON.options = {};
					var roomParams = {
						id: roomJSON.ruid,
						config: roomJSON.config || false,
						opener: ws
					};

					if ( roomJSON.config ) {
						for ( var key in roomJSON.config ) {
							roomParams[key] = roomJSON.config[key];
						}
					}

					this.addRoom(roomParams);

					WebsocketManager.sendString( ws, '[Room::Opened] ' + roomJSON.ruid );
				}
			}
		}


		if ( valid && !connecting ) {
			if ( isRoom ) {
				if ( roomJSON.command === '[Room::Emit]'){

					var room = this.getRoom( roomJSON.ruid );

					for ( key in room ) {
						if ( uid === room[key].uid ) {
							roomJSON.from = room[key].name;
							break;
						}
					}

					//console.log( '[Room::Emit]' );
					if ( roomJSON.to !== undefined ){
						var names = roomJSON.to.split(',');
						
						//console.log( names );
						//console.log( rooms );
						delete roomJSON.ruid;
						delete roomJSON.command;

						if ( roomJSON.group ) room = room[roomJSON.group];

						for ( var i = 0, len = names.length; i < len; i++ ) {
							for ( key in room ) {
								if ( roomJSON.group ) {
									if ( room[key].name === names[i] ) {
										this.sendJSON( room[key].ws, roomJSON );
										break;
									}
								} else {
									if ( room[key].name === names[i] ) {
										this.sendJSON( room[key].ws, roomJSON );
										break;
									}
								}
							}
						}

					} else {
						this.roomSendJSON( roomJSON.ruid, roomJSON, uid );
					}
				}
				
			} else {
				var source = this.getSourceFromSocket( ws );
				if ( source.onmessage ) {
					source.onmessage( msg, ws, this.getUID( ws ), this.getHeaders( ws )  );
				}
			}
		}

		if ( !valid ) {
			if ( isRoom && !validSource ) WebsocketManager.closeSocket( ws, '[Connection Rejected] Room unavailable.' );
			else WebsocketManager.closeSocket( ws, '[Connection Rejected] Invalid credentials.' );
		}

		return res;
	}

};

module.exports = WebsocketManager;