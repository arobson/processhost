require('./setup')

describe('Live Process Control', function () {
  let child
  let handleEvent = false
  let stdoutData = false
  let spawn
  before(function (done) {
    spawn = require('cross-spawn')
    const Process = require('../src/process.js')(spawn)
    child = new Process('timer2', {
        cwd: './spec',
        command: 'node',
        args: ['timer.js'],
        stdio: 'pipe'
    })

    // although you can attach *before* start
    // written this way to test attaching after
    // to assert that use of nextTick delays start
    // long enough for the listener to catch "started"
    child.once('stdout', () => {
      stdoutData = true
      done()
    })
    child.once('started', function () {
      handleEvent = true
    })
	  child.start()
  })

  it('should capture started event from handle', function () {
    handleEvent.should.equal(true)
  })

  it('should have captured stdout data', function () {
    stdoutData.should.equal(true)
  })

  after(function () {
    child.stop()
    child.cleanup()
  })
})

describe('Process transitions', function () {
  let child
  describe('with stubbed spawn', function () {
    let spawn
    let onSpawn
    const handle = {
      handles: {},
      off: function (ev) {
        delete this.handles[ev]
      },
      on: function (ev, handler) {
        this.handles[ev] = handler
      },
      raise: function (ev, one, two, three) {
        if (this.handles[ev]) {
          this.handles[ev](one, two, three)
        }
      },
      removeAllListeners: function () {
        this.handles = {}
      },
      kill: function () {
        process.nextTick(() => {
          this.raise('exit', 0, '')
        })
      },
      crash: function () {
        process.nextTick(() => {
          this.raise('exit', 100, '')
        })
      }
    }
    _.bindAll(handle)

    before(function (done) {
      spawn = function () {
        if (onSpawn) {
          process.nextTick(function () {
            onSpawn()
          })
        }
        return handle
      }
      const Process = require('../src/process.js')(spawn)
      child = new Process('test', {
        command: 'node',
        args: ['node'],
        restartLimit: 10,
        restartWindow: 1000
      })
      child.start()
        .then(function () {
          done()
        })
    })

    it('should be in the started state', function () {
      child.currentState.should.equal('started')
    })

    describe('when restarting a user restart-able process', function () {
      let transitionalState

      before(function (done) {
        child.once('restarting', function () {
          transitionalState = child.previousState
        })
        child.once('started', function () {
          done()
        })
        handle.crash()
      })

      it('should restart the process (stop and start)', function () {
        transitionalState.should.equal('restarting')
      })

      it('should resolve to a started state', function () {
        child.currentState.should.equal('started')
      })

      it('should increment exits', function () {
        child.exits.should.equal(1)
      })
    })

    describe('when calling restart on an un-restart-able process', function () {
      let transitionalState

      before(function (done) {
        child.config.restart = false
        child.once('restarting', function () {
          transitionalState = child.currentState
        })

        child
          .start()
          .then(function () {
            done()
          })
      })

      it('should not restart the process', function () {
        should.not.exist(transitionalState)
      })

      it('should stay in started', function () {
        child.currentState.should.equal('started')
      })

      it('should not increment exits', function () {
        child.exits.should.equal(0)
      })
    })

    describe('when calling stop on a started process', function () {
      before(function () {
        return child.stop()
      })

      it('should resolve to a stopped state', function () {
        child.currentState.should.equal('stopped')
      })

      it('should not increment exits', function () {
        child.exits.should.equal(0)
      })

      after(function (done) {
        child.once('started', function () {
          done()
        })
        child.start()
      })
    })

    describe('when a process crashes', function () {
      let exit
      before(function (done) {
        child.once('exited', (topic, details) => {
          exit = details
          done()
        } )
        handle.crash()
      })

      it('should have emitted a crash event', function () {
        exit.should.eql({ id: 'test', data: { code: 100, signal: '' } })
      })

      it('should increment exits', function () {
        child.exits.should.equal(1)
      })

      it('should restart', function () {
        child.currentState.should.equal('started')
      })

      after(function (done) {
        child.once('started', function () {
          done()
        })
        child.start()
      })
    })

    describe('when a process crashes during restart', function () {
      before(function (done) {
        onSpawn = function () {
          handle.crash()
        }

        child.once('started', function () {
          done()
        })

        child.start()
      })

      it('should resolve to a started state', function () {
        child.currentState.should.equal('started')
      })

      it('should increment exits', function () {
        child.exits.should.equal(0)
      })

      after(function (done) {
        onSpawn = undefined
        child.start()
          .then(function () {
            done()
          })
      })
    })

    describe('when stopping a process', function () {
      before(function (done) {
        child.once('stopped', function () {
          done()
        })
        child.stop()
      })

      it('should not increment exits', function () {
        child.exits.should.equal(0)
      })

      it('should end in a stopped state', function () {
        child.currentState.should.equal('stopped')
	  })
	  
	  after(function() {
		child.cleanup()
	  })
	})
  })
})
