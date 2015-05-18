var machina = require( 'machina' );
var Monologue = require( 'monologue.js' );

Monologue.mixInto( machina.fsm );

var machine = new machina.Fsm( {
	initialState: 'ohhai',
	states: {
		ohhai: {
			_onEnter: function() {
				setTimeout( function() {
					this.transition( 'byeNah' );
				}, 100 );
			}
		},
		byeNah: {
			_onEnter: function() {
				console.log( 'buhbye' );
			}
		}
	}
} );

machine.on( 'byeNah', console.log );
