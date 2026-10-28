// Synthetic probe: do headers set in an early onRequest survive on 404,
// error-handler and later-hook responses in fastify 5.12.7? Mirrors the
// hook order of server.ts:523-617 (error/notFound handlers set first).
const Fastify = require('fastify')
;(async () => {
  const app = Fastify({ logger: false })
  app.setErrorHandler((error, _req, reply) => { reply.code(500); return reply.send({ ok: false }) })
  app.setNotFoundHandler((_req, reply) => { reply.code(404); return reply.send({ ok: false, nf: true }) })
  app.addHook('onRequest', async (req, reply) => {
    if (req.headers.origin === 'https://console.cvg.test') {
      reply.header('access-control-allow-origin', req.headers.origin)
      reply.header('access-control-allow-credentials', 'true')
      reply.header('vary', 'Origin')
    }
  })
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/v1/limited')) { reply.code(429).header('cache-control', 'no-store'); return reply.send({ ok: false }) }
  })
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/v1/')) reply.header('cache-control', 'private, no-store')
    return payload
  })
  app.get('/v1/boom', async () => { throw new Error('x') })
  app.get('/v1/ok', async (_r, reply) => { reply.header('cache-control', 'no-store'); return { ok: true } })
  const o = { origin: 'https://console.cvg.test' }
  for (const url of ['/v1/ok', '/v1/boom', '/v1/missing', '/v1/limited']) {
    const r = await app.inject({ method: 'GET', url, headers: o })
    console.log(JSON.stringify({ url, status: r.statusCode, acao: r.headers['access-control-allow-origin'] ?? null, acac: r.headers['access-control-allow-credentials'] ?? null, cache: r.headers['cache-control'] ?? null }))
  }
  await app.close()
})()
