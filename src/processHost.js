// !!! NOTICE !!!
// This source is a copy/adaptation of Anvil.JS"s process host.
// Anvil.JS is an MIT/GPL product and so all rights are granted.
// Use of this source in a commercial or work-for-hire capacity does *not*
// confer exclusive rights.
// !!! NOTICE !!!

const _ = require('fauxdash')
const Dispatcher = require('topic-dispatch')
const spawn = require('cross-spawn')
const Process = require('./process.js')(spawn)

module.exports = function () {
  const ProcessHost = function () {
    let shutdown
    this.processes = {}
    const host = this

    function onShutdown (exitCode) {
      if (!shutdown) {
        shutdown = true
        host.stop()
        host.removeListeners()
        process.exit(exitCode || 0)
      }
    }

    process.on('SIGINT', onShutdown)
    process.on('SIGTERM', onShutdown)
    process.on('exit', onShutdown)

    this.removeListeners = function () {
      process.removeAllListeners('SIGINT', onShutdown)
      process.removeAllListeners('SIGTERM', onShutdown)
      process.removeAllListeners('exit', onShutdown)
    }

    _.bindAll(this)
  }

  ProcessHost.prototype.createAndStart = function (id, config) {
    return this.create(id, config)
      .then((process) => {
        return process.start()
      })
  }

  ProcessHost.prototype.create = function (id, config) {
    return new Promise((resolve, reject) => {
      let process = id ? this.processes[id] : undefined
      if (!process || config) {
        process = Process(id, config)
        this.processes[id] = process
        process.on('#', (topic, data) => {
          this.emit(data.id + '.' + topic, data)
        })
      }
      resolve(process)
    })
  }

  ProcessHost.prototype.restart = function (id) {
    const process = id ? this.processes[id] : undefined
    if (id === undefined) {
      return Promise.all(_.map(this.processes, function (process) {
        return process.start()
      }))
    } else if (process) {
      return process.start()
    }
  }

  ProcessHost.prototype.setup = function (hash) {
    const promises = _.map(hash, (config, id) => {
      const fn = config.start ? this.start : this.create
      return fn.call(this, id, config)
    })
    return Promise.all(promises)
  }

  ProcessHost.prototype.start = function (id, config) {
    if (!id) {
      throw new Error('Cannot call start without an identifier.')
    }
    const child = id ? this.processes[id] : undefined
    if (!child && !config) {
      throw new Error("Cannot call start on non-existent '" + id + "' without configuration.")
    }
    if (child && /start/.test(child.currentState) && config) {
      return new Promise((resolve, reject) => {
        child.once('stopped', () => {
          child.cleanup()
          this.createAndStart(id, config)
            .then(resolve, reject)
        })
        child.stop()
      })
    } else if (config) {
      return this.createAndStart(id, config)
    } else if (child) {
      return child.start()
    }
  }

  ProcessHost.prototype.stop = function (id) {
    if (id) {
      const process = id ? this.processes[id] : undefined
      if (process) {
        return process.stop()
      }
    } else {
      return Promise.all(_.map(this.processes, (process) => {
        process.stop()
      }))
    }
  }

  var host = new ProcessHost()
  var dispatcher = Dispatcher()
  return _.merge({}, host, dispatcher)
}
