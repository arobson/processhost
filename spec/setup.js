const chai = require('chai')
chai.use(require('chai-as-promised'))
chai.use(require('sinon-chai'))
global.should = chai.should()
global.expect = chai.expect
global._ = require('fauxdash')
global.fs = require('fs')
global.sinon = require('sinon')
global.proxyquire = require('proxyquire').noPreserveCache()
