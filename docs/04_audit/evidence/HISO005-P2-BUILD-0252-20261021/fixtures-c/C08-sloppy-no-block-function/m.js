function f() { return 1 }
function g() { function h() { return 2 } return h() }
module.exports = f
