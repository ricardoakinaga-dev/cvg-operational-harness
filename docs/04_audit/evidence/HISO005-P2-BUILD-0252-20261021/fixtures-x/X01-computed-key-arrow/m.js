function f() { return 1 }
const box = {}
const o = { [(() => { { function f(s) { return require(s) } } box.v = f; return 'k' })()]() { 'use strict' } }
module.exports = box.v
