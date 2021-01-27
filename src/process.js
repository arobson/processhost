// !!! NOTICE !!!
// This source is a copy/adaptation of Anvil.JS"s process host.
// Anvil.JS is an MIT/GPL product and so all rights are granted.
// Use of this source in a commercial or work-for-hire capacity does *not*
// confer exclusive rights.
// !!! NOTICE !!!

const _ = require('fauxdash')
const fsm = require('mfsm')
const debug = require('debug')('processhost:process')

function attachToIO (stream) {
  if (this.processHandle[stream]) {
    var events = [ 'data' ]
    _.each(events, (ev) => {
      this.processHandle[stream].on(ev, (data) => {
        this.emit(stream, { id: this.id, data: data.toString() })
      })
    })
  }
}

function crash (data) {
  this.next('crashed')
  this.onCrash()
}

function createProcess (config, id) {
  return this.spawn(
    config.command,
    config.args,
    {
      cwd: config.cwd || process.cwd(),
      stdio: config.stdio || 'inherit',
      env: config.env || process.env
    }
  )
}

function killProcess () {
  var signals = this.config.killSignal
  if (_.isString(signals) || _.isEmpty(signals)) {
    signals = [signals || 'SIGTERM']
  }
  debug("Killing process '%s'", this.id)
  _.each(signals, (signal) => {
    if (this.processHandle) {
      try {
        this.processHandle.kill(signal)
      } catch (err) {
        debug('Error attempting to send', signal, 'to process', handle.pid, err)
      }
    }
  })
}

// increments the count and after it would pass out of
// the restart window, decrements exits
function onCrash () {
  var restartLimit = this.config.restartLimit
  var restartWindow = this.config.restartWindow
  if (restartWindow > 0) {
    this.exits++
    setTimeout(function () {
      if (this.exits > 0) {
        this.exits = 1
      }
    }, restartWindow)
  }
  debug("Process '%s' crashed in state '%s' with '%d' - restart limit was set at '%d' within '%d'",
    this.id, this.previousState, this.exits, restartLimit, restartWindow)
  if (restartLimit === undefined || this.exits <= restartLimit) {
    debug("Restarting crashed process, '%s'", this.id)
    this.handle('start')
  } else {
    this.handle('failed', {})
  }
}

function onExit (code, signal) {
  debug("Process '%s' exited with code %d", this.id, code)
  if (this.processHandle) {
    this.processHandle.removeAllListeners()
  }
  var msg = { id: this.id, data: { code, signal } }
  this.emit('exited', msg)
  this.handle('processExit', msg.data)
}

function reportState (fsm) {
  debug("Process '%s' entering '%s' state", fsm.id, fsm.currentState)
}

function start () {
  this.exits = 0
  var {promise, resolve, reject} = _.future()
  this.once('started', () => {
    resolve(this)
  })
  this.once('failed', (e) => {
    reject(e)
  })
  this.handle('start', {})
  return promise
}

function startProcess () {
  const config = this.config
  debug("Starting process '%s'", config.command, config.args)
  this.processHandle = this.createProcess(config, this.id)
  this.attachToIO('stderr')
  this.attachToIO('stdout')
  if(/starting/.test(this.currentState)) {
    debug("Process '%s' spawned successfully", this.id)
    this.handle('processSpawned', {})
  }
  this.processHandle.on('exit', this.onExit)
}

function stop () {
  var {promise, resolve, reject} = _.future()
  this.once('stopped', () => resolve())
  process.nextTick(() => {
    this.next('stopping')
    this.killProcess()
  })
  return promise
}

function writeTo (data) {
  if (this.processHandle && this.processHandle.stdin) {
    this.processHandle.stdin.write(data)
  }
}

module.exports = function (spawn) {
  return function (id, config) {
    return fsm({
      api: {
        attachToIO,
        crash,
        createProcess,
        killProcess,
        onCrash,
        onExit,
        start,
        startProcess,
        stop,
        write: writeTo
      },

      init: {
        id,
        config,
        spawn,
        exits: 0,
        default: 'uninitialized',
        restart: !_.has(config, 'restart') ? true : false
      },
      
      states: {
        uninitialized: {
          onEntry: function() {
            reportState(this)
          },
          start: function () {
            this.next('starting')
            this.startProcess()
          }
        },
        crashed: {
          onEntry: function () {
            reportState(this)
          },
          start: function () {
            this.next('restarting')
            this.startProcess()
          },
          failed: function () {
            this.emit('failed', { id: this.id })
          }
        },
        restarting: {
          onEntry: function () {
            reportState(this)
          },
          start: { deferUntil : 'started' },
          stop: { deferUntil : 'started' },
          processExit: function (data) {
            process.nextTick(() => this.startProcess())
          },
          processSpawned: function() {
            this.next('started')
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
          },
          processSpawned: function() {
            this.next('started')
          }
        },
        started: {
          onEntry: function () {
            reportState(this)
          },
          start: function () {
            if (this.config.restart) {
              debug("Process '%s' is being restarted", this.id)
              this.stop()
                  .then(() => {
                    this.next('restarting')
                    this.startProcess()
                  })
            } else {
              this.emit('started', { id: this.id })
            }
          },
          stop: function () {
            this.next('stopping')
            this.stop()
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
            this.next('stopped')
          }
        },
        stopped: {
          onEntry: function () {
            reportState(this)
          },
          start: function () {
            this.exits = 0
            this.next('starting')
            this.startProcess()
          }
        }
      }
    })
  }
}
