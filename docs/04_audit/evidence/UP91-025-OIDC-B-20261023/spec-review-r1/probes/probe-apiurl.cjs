// Synthetic probe of the WHATWG URL behaviour that §4.7 (apiUrl) relies on.
const base = 'https://api.cvg.test:4443'
const cases = ['/v1/x', '/v1/../x', '/v1/%2e%2e/x', '/v1/%2E%2e/x', '/v1/.\t./x', '/v1/..%2fx', '//evil/v1/x', '\\\\evil/v1/x', '/v1\\..\\x', 'https://evil/v1/x', '/v1/\nx']
for (const p of cases) {
  const u = new URL(p, base)
  console.log(JSON.stringify({ p, origin: u.origin, pathname: u.pathname, keepsV1: u.origin === base && u.pathname.startsWith('/v1/') }))
}
for (const v of ['https://console.cvg.test:443', 'https://Console.cvg.test', 'https://console.cvg.test', 'https://console.cvg.test/']) {
  console.log(JSON.stringify({ v, exact: new URL(v).origin === v }))
}
