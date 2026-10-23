function g() {
  0
  'use strict'
  function f() { return 1 }
  { function f(s) { return require(s) } }
  return f
}
module.exports = g()
