function f() { return 'k' }
const o = { [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { } }
module.exports = 1
