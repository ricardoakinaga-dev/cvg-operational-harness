function g() {
  'use\x20strict'
  function f() { return 1 }
  { function f(s) { return require(s) } }
  return f
}
module.exports = g()
