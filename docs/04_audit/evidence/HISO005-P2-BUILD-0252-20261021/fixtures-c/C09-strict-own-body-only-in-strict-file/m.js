'use strict'
function f() { return 1 }
{ function f(s) { 'use strict'; return require(s) } }
module.exports = f
