function f() { return 1 }
{
  function f(s) {
    { function g() { return 1 } }
    return require(s)
  }
}
module.exports = f
