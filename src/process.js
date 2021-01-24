// !!! NOTICE !!!
// This source is a copy/adaptation of Anvil.JS"s process host.
// Anvil.JS is an MIT/GPL product and so all rights are granted.
// Use of this source in a commercial or work-for-hire capacity does *not*
// confer exclusive rights.
// !!! NOTICE !!!

const _ = require('fauxdash')
const fsm = require('mfsm')
const debug = require('debug')('processhost:process')

// increments the count and after it would pass out of
// the restart window, decrements exits
function countCrash (fsm, restartLimit, restartWindow) {
  if (restartWindow > 0) {
    fsm.exits++
    setTimeout(function () {
      if (fsm.exits > 0) {
        fsm.exits--
      }
    }, restartWindow)
  }
  debug("Process '%s' crashed with '%d' - restart limit was set at '%d' within '%d'",
    fsm.id, fsm.exits, restartLimit, restartWindow)
  if (restartLimit === undefined || fsm.exits <= restartLimit) {
    debug("Restarting crashed process, '%s'", fsm.id)
    fsm.handle('start', {})
  } else {
    fsm.handle('failed', {})
  }
}

function reportState (fsm) {
  debug("Process '%s' entering '%s' state", fsm.id, fsm.currentState)
}

function _startProcess (spawn, config, id) {
  debug("Starting process '%s'", config.command, config.args)
  return spawn(
    config.command,
    config.args,
    {
      cwd: config.cwd || process.cwd(),
      stdio: config.stdio || 'inherit',
      env: config.env || process.env
    }
  )
}

function stopProcess (handle, signals, id) {
  if (_.isString(signals) || _.isEmpty(signals)) {
    signals = [signals || 'SIGTERM']
  }
  debug("Killing process '%s'", id)
  _.each(signals, function (signal) {
    if (handle) {
      try {
        handle.kill(signal)
      } catch (err) {
        debug('Error attempting to send', signal, 'to process', handle.pid, err)
      }
    }
  })
}

module.exports = function (spawn) {
  return function (id, config) {
    return fsm({
      api: {
        crash: function (data) {
          this.next('crashed')
          countCrash(this, this.config.restartLimit, this.config.restartWindow)
        },

        attachToIO: function (stream) {
          if (this.processHandle[stream]) {
            this.processHandle[stream].on('data', function (data) {
              this.dispatch(stream, { id: this.id, data: data })
            })
          }
        },
        
        start: function () {
          this.exits = 0
          var {promise, resolve, reject} = _.future()
          this.once('started', () => resolve(this))
          this.once('failed', reject)
          this.handle('start', {})
          return promise
        },

        startProcess: function () {
          const config = this.config
          this.next('starting')
          this.processHandle = _startProcess(spawn, config, this.id)
          this.attachToIO('stderr')
          this.attachToIO('stdout')
  
          this.processHandle.on('exit', (code, signal) => {
            debug("Process '%s' exited with code %d", this.id, code)
            this.handle('processExit', { code: code, signal: signal })
          })
          this.next('started')
        },

        stop: function() {
          process.nextTick(() => {
            this.handle('stop', {})
          })
        },

        stopProcess: function () {
          if (this.processHandle) {
            stopProcess(this.processHandle, this.config.killSignal, this.id)
          }
        },

        write: function (data) {
          if (this.processHandle && this.processHandle.stdin) {
            this.processHandle.stdin.write(data)
          }
        }
      },

      init: {
        id,
        config,
        exits: 0,
        default: 'uninitialized',
        restart: !_.has(config, 'restart') ? true : false
      },
      
      states: {
        uninitialized: {
          onEntry: function() {
            console.log('wtaf')
          },
          start: function () {
            console.log('what up?')
            this.startProcess()
          }
        },
        crashed: {
          onEntry: function () {
            debug("Process '%s' crashed in state %s", this.id, this.previousState)
            if (this.processHandle) {
              this.processHandle.removeAllListeners()
            }
          },
          start: function () {
            this.startProcess()
          },
          failed: function () {
            this.dispatch('failed', { id: this.id })
          }
        },
        restarting: {
          onEntry: function () {
            reportState(this)
          },
          processExit: function (data) {
            this.startProcess()
          }
        },
        starting: {
          onEntry: function () {
            reportState(this)
          },
          start: { deferUntil : 'started' },
          stop: { deferUntil : 'started' },
          processExit: function (data) {
            this.crash(data)
          }
        },
        started: {
          onEntry: function () {
            reportState(this)
          },
          start: function () {
            if (this.config.restart && this.previousState !== 'starting') {
              debug("Process '%s' is being restarted", this.id)
              this.next('restarting')
              this.stopProcess()
            } else {
              this.dispatch('started', { id: this.id })
            }
          },
          stop: function () {
            this.next('stopping')
            this.stopProcess()
          },
          processExit: function (data) {
            this.crash(data)
          }
        },
        stopping: {
          onEntry: function () {
            reportState(this)
          },
          processExit: function (data) {
            debug("Process '%s' exited", this.id)
            this.dispatch('exit', { id: this.id, data: data })
            this.next('stopped')
          }
        },
        stopped: {
          onEntry: function () {
            reportState(this)
          },
          start: function () {
            this.exits = 0
            this.startProcess()
          }
        }
      }
    })
  }
}
