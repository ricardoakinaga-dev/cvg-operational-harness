function g() {
  function f() { return 1 }
  'use strict'
  { function f(s) { return require(s) } }
  return f
}
module.exports = g()
