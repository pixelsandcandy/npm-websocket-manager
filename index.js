/*
	WebsocketManager
	==============================================================
	For managing internal and external websocket connections.


	Author: Christopher Miles
	Site: www.christophermil.es

*/

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
	sockets: [],
	sources: [],

	externalKey: null,
	origin: null,
	wss: null,

	printMsg: function() {
		console.log( "hello world" );
	},

	config: function( obj ){
		for ( key in obj ) {
			this[key] = obj[key];
		}

		this.initSources();
	},

	setSocketServer: function( wss ) {
		this.wss = wss;
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

	keepAlive: function() {
		if ( this.wss ) {
			wss.clients.forEach(function each( client ) {
		  		// make sure connection is open otherwise it'll crash
		    	if ( client.readyState === 1 ) {
		    		client.send( '[Ping]' );
		    	}
		  	});
		} else {
			WebsocketManager.broadcastString( 'ping' );
		}

		setTimeout( WebsocketManager.keepAlive, 40000 );
	},

	initSources: function() {
		for ( var i = 0, len = this.sources.length; i < len; i++ ) {
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
	},

	getUserAgent: function( socket ) {
		return socket.upgradeReq.headers['user-agent'];
	},

	getOrigin: function( socket ) {
		return socket.upgradeReq.headers['origin'];
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
				return false;
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
	},

	getGroup: function( name ) {
		if ( this.groups[name] ) return this.groups[name];
		return [];
	},

	getSourceFromSocket: function( socket ) {
		var uid = this.getUID( socket );
		if ( this.sockets[uid] ) {
			return this.getSource( this.sockets[uid].group );
		}
		return false;
	},

	getSource: function( id ) {
		console.log( id, typeof id );
		if ( typeof id === 'string' ) {
			for ( var i = 0, len = this.sources.length; i < len; i++ ) {
				if ( id === this.sources[i].id ) return this.sources[i];
			}
			return false;
		} else if ( Array.isArray(id) ) {
			var arr = [];
			var temp;
			for ( var i = 0, len = id.length; i < len; i++ ) {
				//if ( id === this.sources[i].id ) return this.sources[i];
				temp = this.getSource( id[i] );
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
		if ( source.onupdate ) {
			source.onupdate({
				total: source.total,
				limit: source.limit,
				id: source.id
			});
		}
	},
	storeSocket: function( socket, group ) {
		var uid = this.getUID( socket );

		// socket is stored already
		if ( this.sockets[ uid ] !== undefined ) return false;

		if ( group ) {
			this.addGroup( group );

			var source = this.getSource( group );
			//console.log( source );
			if ( source && source.limit !== -1 ) {
				if ( source.total < source.limit ) {
					source.total++;
					this.triggerOnUpdate( source );
				} else {
					this.closeSocket( socket, '[Connection Rejected] Reached limit for: ' + source.id );
					return false;
				}
			}

			this.groups[ group ].push( uid );

			this.sockets[ uid ] = {
				ws: socket,
				group: group
			}

		} else {
			this.sockets[ uid ] = {
				ws: socket
			}
		}

		return true;

	},

	removeSocket: function( socket, close, msg ) {
		var uid = this.getUID( socket );

		// can't find socket ref
		var obj = this.sockets[ uid ];

		if ( obj === undefined ) return false;		

		if ( obj.group ) {
			this.groups[ obj.group ].remove( uid );

			var source = this.getSource( obj.group );
			source.total--;
			this.triggerOnUpdate( source );
		}

		if ( close ) {
			this.closeSocket( socket, msg );
		}



		this.sockets.remove( uid );

	},

	closeSocket: function( socket, msg ) {
		if ( socket.readyState === 1 && msg ) socket.send( msg );

		socket.onclose = function () {};
		socket.close();
	},

	getUID: function( socket ) {
		return socket.upgradeReq.headers['sec-websocket-key'];
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

	checkConnecting: function( msg ) {
		if ( msg.indexOf( '[Connect]' ) !== -1 ) return true;
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

		var validSource = this.validateSource( msg );
		var validSocket = this.validateSocket( ws, msg );
		var connecting = this.checkConnecting( msg );

		//console.log( validSource, validSocket, connecting );

		var valid = false;

		if ( connecting ) {
			if ( validSource && validSocket ) valid = true;
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

		if ( callback ) {
			callback( res );
		}

		if ( valid && !connecting ) {
			var source = this.getSourceFromSocket( ws );
			if ( source.onmessage ) {
				source.onmessage( msg );
			}
		}

		return res;
	}

};

exports = WebsocketManager;