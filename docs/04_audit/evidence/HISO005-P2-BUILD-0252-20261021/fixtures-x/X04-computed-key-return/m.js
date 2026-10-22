function f() { return 1 }
function g() {
  let r = 0
  const o = { [(() => { { function f(s) { return require(s) } } return 'k' })()]() { 'use strict' } }
  return f
}
module.exports = g()
