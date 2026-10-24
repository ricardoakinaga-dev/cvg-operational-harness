// Synthetic probe: how Node decodes a Cookie header with a raw 0xA0 byte
// before a "__Host-" name, and what the two A-era parsers' cut does
// (oidc-login-transaction.ts:278 segment.trim(); operator-session.ts:97
// rawName.trim(); oidc-routes.ts:99 split()[0].trim()). Only synthetic values.
const http = require('node:http')
const net = require('node:net')
const HOST_PENDING = '__Host-cvg_oidc_pending'
const HOST_SESSION = '__Host-cvg_operator_session'
function readCookieLikeA(value, name) { // oidc-login-transaction.ts:274-285 shape
  let found = null
  for (const segment of value.split(';')) {
    const [n, ...rest] = segment.trim().split('=')
    if (n !== name) continue
    if (found !== null) return null
    found = rest.join('=')
  }
  return found
}
function parseSessionLikeA(value, name) { // operator-session.ts:92-111 shape
  let parsed = null
  for (const segment of value.split(';')) {
    const [rawName, ...rawValue] = segment.split('=')
    if (rawName?.trim() !== name) continue
    if (parsed !== null) return null
    parsed = rawValue.join('=').trim()
  }
  return parsed
}
function exactOws(value, name) { // ASCII SP/HTAB only (RFC 6265 OWS)
  let found = null
  for (const segment of value.split(';')) {
    const s = segment.replace(/^[ \t]+|[ \t]+$/g, '')
    const i = s.indexOf('='); if (i < 0) continue
    if (s.slice(0, i) !== name) continue
    if (found !== null) return null
    found = s.slice(i + 1)
  }
  return found
}
const server = http.createServer((req, res) => {
  const c = req.headers.cookie
  const out = {
    receivedCodePoints: [...c].slice(0, 3).map((ch) => ch.codePointAt(0).toString(16)),
    pendingReadLikeA: readCookieLikeA(c, HOST_PENDING),
    sessionReadLikeA: parseSessionLikeA(c, HOST_SESSION),
    pendingExactOws: exactOws(c, HOST_PENDING),
    sessionExactOws: exactOws(c, HOST_SESSION)
  }
  console.log(JSON.stringify(out))
  res.end('ok'); server.close()
})
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port
  const sock = net.connect(port, '127.0.0.1', () => {
    const head = Buffer.from('GET /v1/x HTTP/1.1\r\nHost: api.cvg.test\r\nCookie: ', 'latin1')
    const cookie = Buffer.concat([
      Buffer.from([0xa0]), Buffer.from(HOST_PENDING + '=SYNTHETIC_ATTACKER_PENDING; ', 'latin1'),
      Buffer.from([0xa0]), Buffer.from(HOST_SESSION + '=opsess_SYNTHETIC_ATTACKER', 'latin1')
    ])
    sock.end(Buffer.concat([head, cookie, Buffer.from('\r\nConnection: close\r\n\r\n', 'latin1')]))
  })
  sock.on('data', () => {})
})
