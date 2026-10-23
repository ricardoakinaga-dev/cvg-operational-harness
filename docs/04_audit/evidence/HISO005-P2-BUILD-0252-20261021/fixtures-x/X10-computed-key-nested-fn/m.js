function f() { return 'k' }
function g() {
  const o = { [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { 'use strict' } }
  return 1
}
module.exports = g()
