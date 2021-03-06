require('./setup')
const processHost = require('../src/processHost.js')

describe('ProcessHost API', function () {
  const originalExit = process.exit

  describe('when starting a child process', function () {
    let host
    let hostEvent = false
    let stdoutData = false

    before(function (done) {
      host = processHost()
      host.start('timer1', {
        cwd: './spec',
        command: 'node',
        args: ['timer.js'],
        stdio: 'pipe'
      })

      // written this way to test attaching after
      // to assert that use of nextTick delays start
      // long enough for the listener to catch "started"
      host.once('timer1.started', function () {
        hostEvent = true
      })

      host.once('timer1.stdout', function () {
        stdoutData = true
        done()
      })
    })

    it('should capture started event from host', function () {
      hostEvent.should.equal(true)
    })

    it('should have captured stdout data', function () {
      stdoutData.should.equal(true)
    })

    describe("when redefining a process with 'start'", function () {
      let stdout
      before(function () {
        this.timeout(5000)
        return host.start('timer1', {
          cwd: './spec',
          command: 'node',
          args: ['timer2.js'],
          stdio: 'pipe'
        }).then(() => {
          var { promise, resolve, reject } = _.future()
          host.on('timer1.stdout', (t, l) => {
            stdout = l.data
            resolve()
          })
          return promise
        })
      })

      it('should reflect new process', function () {
        stdout.should.equal("It's been 100 ms.\n")
      })
    })

    after(function (done) {
      host.removeListeners()
      host.on('timer1.stopped', function (t, d) {
        done()
      })
      host.stop('timer1')
    })
  })

  describe('when setting up multiple child process', function () {
    let host

    before(function (done) {
      host = processHost()
      host.setup({
        timer3a: {
          cwd: './spec',
          command: 'node',
          args: ['timer.js'],
          stdio: 'pipe',
          start: true,
          restart: true
        },
        timer3b: {
          cwd: './spec',
          command: 'node',
          args: ['timer.js'],
          stdio: 'pipe',
          start: true,
          restart: true
        },
        timer3c: {
          cwd: './spec',
          command: 'node',
          args: ['timer.js'],
          stdio: 'pipe',
          start: true,
          restart: true
        }
      }).then(function (handles) {
        done()
      })
    })

    it('should create all three processes', function () {
      Object.keys(host.processes).should.eql(['timer3a', 'timer3b', 'timer3c'])
    })

    it('should start all three processes', function () {
      _.reduce(_.values(host.processes), (all, process) => {
        return all && process.state === 'started'
      }, true)
    })

    describe("when restarting specific process with 'start'", function () {
      let restarts = 0
      const total = 1
      before(function (done) {
        host.once('timer3b.started', function () {
          restarts++
          done()
        })
        host.start('timer3b')
      })

      it('should capture a restart for each process', function () {
        restarts.should.equal(total)
      })

      it('should result in all processes in started state', function () {
        _.reduce(_.values(host.processes), (all, process) => {
          return all && process.state === 'started'
        }, false)
      })
    })

    describe("when restarting multiple processes with 'restart'", function () {
      let restarts = 0
      let total = 0
      before(function (done) {
        total = Object.keys(host.processes).length
        host.on('#.restarting', function (t) {
          restarts++
          if (restarts === total) {
            done()
          }
        })
        host.restart()
      })

      it('should capture a restart for each process', function () {
        restarts.should.equal(total)
      })

      it('should result in all processes in started state', function () {
        _.reduce(_.values(host.processes), (all, process) => {
          return all && process.state === 'started'
        }, true)
      })
    })

    describe('when calling start with no arguments', function () {
      it('should throw an exception', function () {
        expect(function () {
          host.start()
        }).to.throw('Cannot call start without an identifier.')
      })
    })

    describe('when calling start on missing process', function () {
      it('should throw an exception', function () {
        expect(function () {
          host.start('testd')
        }).to.throw("Cannot call start on non-existent 'testd' without configuration.")
      })
    })

    after(function () {
      host.removeListeners()
      return host.stop()
    })
  })

  describe('when handling process signals', function () {
    describe('when process emits an exit with an error code', function () {
      let host, exitMock

      before(function (done) {
        host = processHost()
        exitMock = sinon.expectation.create('exit')
          .once()
          .withArgs(100)
        process.exit = exitMock
        process.emit('exit', 100)
        setTimeout(function () { done() }, 50)
      })

      it('should call exit with error code as expected', function () {
        exitMock.verify()
      })
    })

    describe('when process emits an exit without an error code', function () {
      let host, exitMock

      before(function (done) {
        host = processHost()
        exitMock = sinon.expectation.create('exit')
          .once()
          .withArgs(0)
        process.exit = exitMock
        process.emit('exit')
        setTimeout(function () { done() }, 50)
      })

      it('should call exit with error code as expected', function () {
        exitMock.verify()
      })
    })

    describe('when process emits SIGINT with an error code', function () {
      let host, exitMock

      before(function (done) {
        host = processHost()
        exitMock = sinon.expectation.create('exit')
          .once()
          .withArgs(20)
        process.exit = exitMock
        process.emit('SIGINT', 20)
        setTimeout(function () { done() }, 50)
      })

      it('should call exit with error code as expected', function () {
        exitMock.verify()
      })
    })

    describe('when process emits SIGINT without an error code', function () {
      let host, exitMock

      before(function (done) {
        host = processHost()
        exitMock = sinon.expectation.create('exit')
          .once()
          .withArgs(0)
        process.exit = exitMock
        process.emit('SIGINT')
        setTimeout(function () { done() }, 50)
      })

      it('should call exit with error code as expected', function () {
        exitMock.verify()
      })
    })
  })

  after(function () {
    process.exit = originalExit
  })
})
