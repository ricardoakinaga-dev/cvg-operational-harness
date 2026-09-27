# AUD-0580 — fronteira entre console e API na autenticação OIDC

- Data: 27/09/2026.
- Candidato inspecionado: branch isolado `codex/pr301-oidc-client`, commit
  `85c2c7d`; checkout compartilhado `main` não contém essa composição OIDC.
- Método: leitura do caminho conectado e `Fastify.inject` em Node 22.23.2,
  com origem e cookie sintéticos. Nenhum dado real, IdP, banco ou deploy.
- Veredito: `FAIL_FOR_CROSS_ORIGIN_PRODUCTION / LOCAL_E2E_UNCHANGED / NO_GO`.

Os links de código abaixo identificam caminhos; os bytes auditados são os do
branch isolado. SHA-256: `apps/web/src/api/client.ts`
`4dd6f5206d87682e5a97c70bab50265734a5a3f23358a651357f027080380995`,
`vite.config.mts`
`687e9cb58f5cda4285fc4dd58b3e3eb393f8053e3e964e18f17c3144eb59574c`,
`apps/api/src/http-security.ts`
`15fe65e9e6c66251d80417f3e235351fd996a51c2f9ef712c6d5272c21e09fc1`,
`apps/api/src/oidc-routes-local.ts`
`dd6c5644877b54b8c901149bc6df32414ddbc6d25f7582d480566ebc9653d0ca`,
`deploy/nginx.web.conf`
`b21cde94f18c4e5e990cae26344a51d5cab6f5bfd6d08cb3844d8081303fd7b8`.

## Caminho observado

1. O [cliente web](../../apps/web/src/api/client.ts) chama `fetch(path)` com
   `path` relativo, por exemplo `/v1/session`, e `credentials: 'include'`.
   O [Vite](../../vite.config.mts) encaminha `/v1` ao processo API; assim o
   navegador envia o cookie ao hostname do console antes do proxy. Portas
   diferentes não isolam cookies de um mesmo host, conforme a
   [RFC 6265 §8.5](https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5).
2. O [hook HTTP](../../apps/api/src/http-security.ts) aceita apenas origens
   configuradas e emite `Access-Control-Allow-Origin` e `Vary: Origin`, mas
   sua função `applyCorsHeaders` não emite
   `Access-Control-Allow-Credentials: true`. No
   [Fetch Standard](https://fetch.spec.whatwg.org/#cors-protocol-and-credentials),
   uma resposta com `credentials: 'include'` de outra origem precisa desse
   cabeçalho para ficar disponível ao JavaScript.
3. A rota OIDC local (`apps/api/src/oidc-routes-local.ts` no branch isolado)
   exige hostname igual para callback da API e redirect do console. A
   composição local (`apps/api/src/local-oidc-composition.ts` no branch)
   recusa
   `NODE_ENV=production`. A prova com Keycloak local não exercita uma
   topologia HTTPS de hosts distintos.
4. O [NGINX web](../../deploy/nginx.web.conf) também encaminha `/v1/` ao
   processo API no host do console e não configura `Content-Security-Policy`
   para limitar `connect-src`. O ajuste exige tanto o bundle quanto o
   servidor estático; corrigir só o proxy do Vite não fecha a lacuna.

## Prova de cabeçalhos no candidato

Com Fastify e `installHttpSecurityHooks` do commit acima, `allowedOrigins`
contendo apenas `https://console.example.test`:

```json
{"method":"GET","status":200,"allowOrigin":"https://console.example.test","allowCredentials":null,"vary":"Origin"}
{"method":"OPTIONS","status":204,"allowOrigin":"https://console.example.test","allowCredentials":null,"vary":"Origin"}
```

O `GET` incluiu `Cookie: synthetic=1`; o `OPTIONS` solicitou método `GET`.
Ambas as respostas vieram do runtime real do hook, mas a execução não
substitui teste de navegador. A ausência de `allowCredentials` é compatível
com a leitura do código e contradiz a exigência de uma chamada direta com
cookie do console para um host de API distinto.

## Impacto e próxima prova

O E2E local no mesmo hostname continua válido para login MFA sintético,
revogação e recarga por cookie **nesse** arranjo. Ele não prova que um
servidor de console separado deixa de receber o cookie de sessão nem que a
web consegue ler uma resposta da API em outra origem. A
[SPEC 0150](../02_spec/0150_cross_origin_operator_console.md) define a
correção T3 e a prova HTTPS de host, CORS e CSRF. Seu BUILD exige revisão
humana; a integração corporativa OIDC e produção continuam `NO_GO`.
