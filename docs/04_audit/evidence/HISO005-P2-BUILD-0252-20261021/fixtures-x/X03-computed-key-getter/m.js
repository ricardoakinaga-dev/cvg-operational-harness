function f() { return 1 }
const box = {}
const o = { get [(() => { { function f(s) { return require(s) } } box.v = f; return 'k' })()]() { 'use strict'; return 1 } }
module.exports = box.v
