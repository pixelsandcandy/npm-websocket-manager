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
		//console.log( this.sockets );
		/*for ( var i = 0, len = this.sockets.length; i < len; i++ ) {
			this.sendString( this.sockets[i].ws, str );
		}*/

		for ( var key in this.sockets ) {
			//console.log( key );
			this.sendString( this.sockets[ key ].ws, str );
		}
	},

	keepAliveTime: 40000,
	onKeepAlive: null,
  keepAliveMessage: '[Ping]',
	keepAlive: function( time ) {
		if ( time ) WebsocketManager.keepAliveTime = time;

	  if ( WebsocketManager.wss ) {
			WebsocketManager.wss.clients.forEach(function each( client ) {
		  		// make sure connection is open otherwise it'll crash
		    	if ( client.readyState === 1 ) {
		    		client.send( '[Ping]' );
		    	}
		  	});
		} else {
			WebsocketManager.broadcastString( WebsocketManager.keepAliveMessage );
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
		//console.log( this.getUID( socket ) );
		//console.log( this.sockets );
		return this.verifiedSocketUID( uid );
	},

	validateSocket: function( socket, msg ) {

		if ( this.verifiedSocket( socket ) ) return true;

		if ( this.externalKey && msg.indexOf( this.externalKey ) !== -1 ) {
			//console.log( this.getUID( socket ) );
			return true;
		}

		var ua = this.getUserAgent( socket );
		var origin = this.getOrigin( socket );

		// external socket
		if ( ua === undefined ) {
			//console.log( 'external SOCKET' );
			if ( this.externalKey ) {
				if ( msg.indexOf( this.externalKey ) === -1 ) return false;
				else return true;
			} else {
				return true;
			}
		}

		// internal sockets
		if ( this.origin ) {
			//console.log( 'internal SOCKET' );
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
			this.rooms[config.id].sockets = {};

			if ( typeof config.limit === 'object' ){
				this.rooms[config.id].groups = {};
				for ( var key in config.limit ) {
					//console.log( key );
					this.rooms[config.id].groups[key] = {};
				}
			}

			this.roomConfig.push( config );
		} else {
			var c = this.getRoomConfig( config.id );
			c.opener = config.opener;
		}
	},

	getRoom: function( name, simplify ) {
		if ( simplify !== true ) return this.rooms[name] || [];
		else {
			if ( this.rooms[name] ) {
				var data = [];
				for ( var key in this.rooms[name].groups ) {
					var o = {
						name: key,
						connections: []
					};

					var group = this.rooms[name].groups[key];

					for ( var user in group ) {
						o.connections.push( user );
					}

					data.push(o);
				}
				return data;

			} else {
				return [];
			}
			
		}
		
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
  findSocketsWithConfig: function( key, roomID ){
    var arr = [];
    
    
    
    if ( roomID ){
      var room = this.rooms[ roomID ].sockets;
      //console.log( 'room =>', room );
      
      var keys = Object.keys( room );
      for ( var i = 0, len = keys.length; i < len; i++ ){
        if ( room[ keys[i] ].config[ key ] === true ) arr.push( room[ keys[i] ].ws );
      }
    }
    
    return arr;
  },
	storeSocket: function( socket, group, roomJSON ) {
		var uid = this.getUID( socket );
		var ip = this.getHeaders( socket )[ 'x-forwarded-for' ];
    var originalGroup = group;
		var gGroup = false;
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
						this.closeSocket( socket, '[Connection Rejected] Reached limit(' + config.limit + ') >> ' + config.id );
            return false;
					}
				} else if ( typeof config.limit === 'object' ) {
					//console.log( 'B' );
					if ( roomJSON.config && typeof roomJSON.config.group === 'string'  ) {
						//console.log( "hello", roomJSON.config );
						//console.log( config );
						//console.log( room[ roomJSON.config.group ], config.limit[ roomJSON.config.group ]  );
						//console.log( Object.keys( room[ roomJSON.config.group ] ).length, config.limit[ roomJSON.config.group ] );
						var limit = config.limit[ roomJSON.config.group ];
						if ( limit === -1 || limit === false ) {
							valid = true;
							group = roomJSON.config.group;
						} else {
							if ( config.limit[ roomJSON.config.group ] && Object.keys( room.groups[ roomJSON.config.group ] ).length < limit ){
								valid = true;
								group = roomJSON.config.group;
							} else {
								this.closeSocket( socket, '[Connection Rejected] Reached limit(' + limit + ') >> ' + config.id + '(' + roomJSON.config.group + ')' );
                return false;
							}
						}
					}
				}
				
			}

			//console.log( 'VALID', valid );

			//console.log( 'roomJSON >>', roomJSON );
			//console.log( id, this.rooms[ id ] );

			if ( valid && this.rooms[ id ] && roomJSON.command === '[Room::Join]' ) {
				var connect = false;
				//console.log( 'connect...' );
        //console.log( 'group =>', group );
        //console.log( this.rooms[ id ].groups[ group ] );
				if ( group ) {
					//console.log( 1 );
					if ( this.rooms[ id ].groups[ group ][ roomJSON.name ] ) {
						//console.log( 'exists',  this.rooms[ id ][ group ][ roomJSON.name ].ws.readyState );
            //console.log( this.rooms[ id ].groups[ group ][ roomJSON.name ].ws.readyState );
						if ( this.rooms[ id ].groups[ group ][ roomJSON.name ].ws.readyState > 1 ) {
							// connection is closed
							WebsocketManager.sendString( socket, '[Room::Rejoined] ' + roomJSON.name );
							connect = true;
						} else {
							// someone already connected
              this.closeSocket( socket, '[Connection Rejected] User exists (' + roomJSON.name + ') in room ' + id );
              return false;
						}
					} else {
						connect = true;
						WebsocketManager.sendString( socket, '[Room::Joined] ' + roomJSON.name );
					}
				} else {
					if ( this.rooms[ id ].sockets[ roomJSON.name ] === undefined ) {

						connect = true;
						WebsocketManager.sendString( socket, '[Room::Joined] ' + roomJSON.name );

					} else {
						if ( this.rooms[ id ].sockets[ roomJSON.name ].ws.readyState > 1 ) {
							WebsocketManager.sendString( socket, '[Room::Rejoined] ' + roomJSON.name );
							connect = true;
						} else {
              this.closeSocket( socket, '[Connection Rejected] User exists (' + roomJSON.name + ') in room ' + id );
              return false;
            }
					}
				}
				

				//console.log( 'connect', connect );
				//console.log( 'group', group );

				if ( connect ) {
          //console.log( 'group =>', group );
          //console.log( 'roomJSON =>', roomJSON );
          
					if ( group ) {
						room.groups[ group ][ roomJSON.name ] = {
							ws: socket,
							uid: uid,
							name: roomJSON.name,
              config: roomJSON.config
						}
					} 

					if ( room[ roomJSON.name ] === undefined ) {
						room.sockets[ roomJSON.name ] = {
							ws: socket,
							uid: uid,
							name: roomJSON.name,
              config: roomJSON.config
						}
					}
					
					var jsonData = {
						event: '[Room::UserConnected]',
						name: roomJSON.name
					};

					if ( group ) jsonData.group = group;

					//console.log( roomJSON.ruid );

					WebsocketManager.roomSendJSON( roomJSON.ruid, jsonData, uid );

					var roomConfig = WebsocketManager.getRoomConfig( roomJSON.ruid );
					//console.log( '[Room::UserConnected]' );

          

					if ( roomConfig ) {
            
            //console.log( WebsocketManager.findSocketsWithConfig( 'updates', roomJSON.ruid ).length );
            var s = WebsocketManager.findSocketsWithConfig( '[Room::Update]', roomJSON.ruid );
            var inRoom = WebsocketManager.getRoom( roomJSON.ruid, true );
            
            for ( var i = 0, len = s.length; i < len; i++ ) {
              //WebsocketManager.sendJSON( s[i], jsonData );
  						WebsocketManager.sendJSON( s[i], {
  							event: '[Room::Update]',
  							groups: inRoom
  						});
            }
            /*WebsocketManager.sendJSON( roomConfig.opener, jsonData );
						WebsocketManager.sendJSON( roomConfig.opener, {
							event: '[Room::Update]',
							groups: WebsocketManager.getRoom( roomJSON.ruid, true )
						});*/
						//console.log( 'roomConfig.opener' );
					}
          
          socket.on( 'close', function(){

  					//console.log( roomJSON );

  					WebsocketManager.roomSendJSON( roomJSON.ruid, {
  						event: '[Room::UserDisconnected]',
  						name: roomJSON.name
  					}, uid );

  					var roomConfig = WebsocketManager.getRoomConfig( roomJSON.ruid );
            
  					if ( roomConfig ) {
              var s = WebsocketManager.findSocketsWithConfig( '[Room::Update]', roomJSON.ruid );
              var inRoom = WebsocketManager.getRoom( roomJSON.ruid, true );
              
              for ( var i = 0, len = s.length; i < len; i++ ) {
                WebsocketManager.sendJSON( s[i], {
                  event: '[Room::Update]',
                  name: roomJSON.name,
                  groups: inRoom
                }, uid);
              }
            }

  					//console.log( roomJSON.config );

  					/*if ( roomJSON.config && roomJSON.config.group ) {
  						if ( room.groups[ roomJSON.config.group ] && room.groups[ roomJSON.config.group ][ roomJSON.name ] ) delete room.groups[ roomJSON.config.group ][ roomJSON.name ];
  					} else {
  						if ( room[ roomJSON.ruid ].sockets[ roomJSON.name ] ) delete room[ roomJSON.ruid ].sockets[ roomJSON.name ];
  					}*/
            
            WebsocketManager.removeSocket( socket );


  				})

				} else {
					this.closeSocket( socket, '[Connection Rejected] User exists (' + roomJSON.name + ') in room ' + id );
          return false;
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

			gGroup = group;

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
						this.closeSocket( socket, '[Connection Rejected] Reached limit(' + source.limit + ') >> ' + source.id );
						return false;
					}
				}
			} else {
				// make sure there's no redundancy 
				valid = true;
			}


			if ( valid ) {
        
        //console.log( group, originalGroup );
				this.groups[ group ].remove( uid );
				this.groups[ group ].push( uid );

				this.ips[ group ].remove( ip );
				this.ips[ group ].push( ip );
			}

			if ( triggerUpdate ) this.triggerOnUpdate( source );

			gGroup = group;

		}

		if ( gGroup ) {
      //console.log( 'ADDING ========' );
      //console.log( group, originalGroup );
      //console.log( this.rooms );
      
			this.sockets[ uid ] = {
				ws: socket,
				group: group
			};

			this.socketsIP[ ip ] = {
				ws: socket,
				group: group
			};
      
      
      
      if ( roomJSON.ruid ) {
        this.sockets[ uid ].config = roomJSON.config;
        this.sockets[ uid ].room = roomJSON.ruid;
        this.sockets[ uid ].name = roomJSON.name;
        
        this.socketsIP[ ip ].config = roomJSON.config;
        this.socketsIP[ ip ].room = roomJSON.ruid;
        this.socketsIP[ ip ].name = roomJSON.name;
        
      }
      
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
  removeSocketFromObject: function( uid, obj ){
    //console.log( 'remove', uid );
    var keys = Object.keys( obj );
    var socketID;
    for ( var i = 0, len = keys.length; i < len; i++ ){
      socketID = this.getUID(  obj[ keys[i] ].ws );
      if ( socketID === uid ) {
        //console.log( 'FOUND' );
        delete obj[ keys[i] ];
        return;
      }
    }
  },
	removeSocket: function( socket, close, msg ) {
		var uid = this.getUID( socket );
		var ip = this.getHeaders( socket )[ 'x-forwarded-for' ];

		// can't find socket ref
		var obj = this.sockets[ uid ];

		if ( obj === undefined ) return false;
		var source = false;

		if ( obj.group ) {
      /*console.log( 'uid =>', uid );
      console.log( 'obj.group =>', obj.group );
      console.log( 'this.groups =>', this.groups );
      console.log( 'this.sockets =>', this.sockets );
      console.log( 'this.rooms =>', this.rooms );*/
      if ( obj.room && this.rooms[obj.room].groups[obj.group] && this.rooms[obj.room].sockets ) {
        this.removeSocketFromObject( uid, this.rooms[obj.room].groups[obj.group]);
        this.removeSocketFromObject( uid, this.rooms[obj.room].sockets);
      } else if ( obj.group && this.groups[obj.group] ){
        this.groups[ obj.group ].remove( uid );
      }
      
      /*if ( obj.room && this.rooms[obj.room] && this.rooms[obj.room].groups[ obj.group ] ) {
        //console.log( typeof this.rooms[obj.room].groups[obj.group] );
        //console.log( this.rooms[obj.room].groups[obj.group] );
        delete this.rooms[obj.room].groups[obj.group][obj.name];
        delete this.rooms[obj.room].sockets[obj.name];
        //console.log( this.rooms );
      } else if ( obj.group && this.groups[obj.group] ) {
        this.groups[ obj.group ].remove( uid );
      }*/
			
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
		if ( g.sockets ) g = g.sockets;

		var uid;
		for ( var i = 0, len = g.length; i < len; i++ ) {
			uid = g[ i ];
			if ( this.sockets[uid] && this.sockets[uid].ws ) this.sendJSON( this.sockets[uid].ws, event, data );
		}
	},

	groupSendString: function( group, str ) {
		var g = this.getGroup( group );
		if ( g.sockets ) g = g.sockets;
		
		var uid;
		for ( var i = 0, len = g.length; i < len; i++ ) {
			uid = g[ i ];
			if ( this.sockets[uid] && this.sockets[uid].ws ) this.sendString( this.sockets[uid].ws, str );
		}
	},

	roomSendString: function( room, str, uid ) {
		var r = this.getRoom( room ).sockets;
		//console.log( 'roomSendString >>', room, str, uid );
		//console.log( this.rooms );
		//console.log( r );
		for ( var key in r ){
			if ( r[key].ws && r[key].ws.readyState === 1 && r[key].uid !== uid ) {
				this.sendString( r[key].ws, str );
			}
		}
	},

	roomSendJSON: function( room, json, uid ) {
		var r = this.getRoom( room ).sockets;
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
		if ( ws === undefined || !ws ) return; 
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
		var valid = false;
		var validRoomMessage = false;

		if ( msg.indexOf( '[Room::' ) !== -1 ) isRoom = true;

		if ( isRoom ) {
			if ( isJSON(msg) ) roomJSON = JSON.parse( msg );

			if ( roomJSON.command === '[Room::Join]' ) {
				if ( roomJSON.name !== undefined ) {
					var name = roomJSON.name;
					//console.log( roomJSON );
					if ( name.indexOf( '%n' ) !== -1 ) {

						var room = this.getRoom( roomJSON.ruid );
						//console.log( room.groups, room.groups[ roomJSON.config.group] );
						if ( roomJSON.config && roomJSON.config.group && room.groups != undefined && room.groups[ roomJSON.config.group ] != undefined ) {
							//console.log( 'GROUP' );
							//console.log( this.getRoom( roomJSON.ruid )[roomJSON.config.group] );
							name = name.replace( '%n', ( Object.keys( room.groups[roomJSON.config.group] ).length + 1) );
							validRoomMessage = true;
						} else if ( room.sockets != undefined ) {
							name = name.replace( '%n', ( Object.keys( room.sockets ).length + 1) );
							validRoomMessage = true;
						}
						
					} else {
						validRoomMessage = true;
					}

					roomJSON.name = name;
				} else {
					var name = 'anonymous-' + ( Object.keys( this.getRoom( roomJSON.ruid ) ).length + 1);
					roomJSON.name = name;
					validRoomMessage = true;
				}
			} else {
				validRoomMessage = true;
			}
		}

		var validSource = this.validateSource( msg ) || this.validateRoom( msg );
		var validSocket = this.validateSocket( ws, msg );
		var connecting = this.checkConnecting( msg );

		if ( this.debug ) console.log( '[websocket-manager]', validSource, validSocket, connecting );
		//console.log( this.validateRoom( msg ) );
		//console.log( this.validateSource( msg ) );


		

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

		if ( isRoom && !validRoomMessage ) valid = false;
		

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
					WebsocketManager.sendJSON( ws, {
						event: '[Room::Update]',
						groups: WebsocketManager.getRoom( roomJSON.ruid, true )
					});
				}
			}
		}


		if ( valid && !connecting ) {
			if ( isRoom ) {
				if ( roomJSON.command === '[Room::GetConnections]'){
					WebsocketManager.sendJSON( ws, {
						event: '[Room::Connections]',
						groups: WebsocketManager.getRoom( roomJSON.ruid, true )
					});
				} else if ( roomJSON.command === '[Room::Emit]'){
					var room = this.getRoom( roomJSON.ruid );
					
					for ( key in room.sockets ) {
						if ( uid === room.sockets[key].uid ) {
							roomJSON.from = room.sockets[key].name;
							break;
						}
					}

					//console.log( '[Room::Emit]' );
					if ( roomJSON.to !== undefined ){
						if ( typeof roomJSON.to === 'string' ){
							var names = roomJSON.to.split(',');
							
							//console.log( names );
							//console.log( rooms );
							delete roomJSON.ruid;
							delete roomJSON.command;

							if ( roomJSON.group ) {
								if ( room.groups == undefined || room.groups[ roomJSON.group ] == undefined ) {
									valid = false;
								} else {
									room = room.groups[roomJSON.group];
								}
							}
							if ( valid ) {
								for ( var i = 0, len = names.length; i < len; i++ ) {
									for ( var key in room ) {
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
							}
							
						} else if ( typeof roomJSON.to === 'object' ){
							//console.log( 'EMIT', roomJSON );
							var group = roomJSON.to.group;

							if ( group ) {
								var groups = roomJSON.to.group.split(',');
								var ruid = roomJSON.ruid;
								//console.log( names );
								//console.log( rooms );
								delete roomJSON.ruid;
								delete roomJSON.command;

								for ( var i = 0, len = groups.length; i < len; i++ ){
									room = this.getRoom( ruid );
									if ( room.groups == undefined || room.groups[ groups[i] == undefined ]){
										valid = false;
									} else {
										room = room.groups[ groups[i] ];
										for ( var key in room ) {
											this.sendJSON( room[key].ws, roomJSON );
										}
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