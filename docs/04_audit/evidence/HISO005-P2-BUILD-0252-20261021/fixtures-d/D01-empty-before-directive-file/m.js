;
'use strict'
function f() { return 1 }
{ function f(s) { return require(s) } }
module.exports = f
