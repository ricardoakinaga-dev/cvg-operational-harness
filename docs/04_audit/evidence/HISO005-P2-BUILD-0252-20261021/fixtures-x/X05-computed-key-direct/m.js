function f() { return 1 }
const o = { [(() => { { function f(s) { return require(s) } } return f })()]: 1 }
module.exports = f
