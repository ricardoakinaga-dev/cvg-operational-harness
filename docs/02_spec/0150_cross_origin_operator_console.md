# SPEC-PR301/302-002 — console e API em hosts HTTPS distintos

- Trilha: **T3**; altera transporte do console, CORS com credenciais e
  proteção CSRF da sessão de operador.
- Estado: `BUILD_T3_APPROVED_USER / ISOLATED_SYNTHETIC_BUILD_PASS / ROOT_AND_STAGING_PENDING / PRODUCTION_NO_GO`.
  O usuário aprovou BUILD e testes sintéticos em 28/09/2026. Dados reais,
  publicação e release seguem fora do escopo desta aprovação.
- Críticas independentes I27 (API/segurança) e I28 (browser/web): ambas
  `ACCEPT_SPEC_REVIEW_READY` após corrigir injeção de cookie por origem irmã,
  cache entre tenants, rollback do bundle antigo e prova de CSP/NGINX. Os
  críticos não executaram BUILD nem aprovaram produção.
- Tasks: [PR-301/302](../03_build/0356_production_backlog_2026-09-26.md).
- Base: [SPEC 0144 aprovada](0144_trusted_operator_session_production.md),
  [AUD-0580](../04_audit/0580_cross_origin_oidc_gap_2026-09-27.md),
  [Fetch Standard](https://fetch.spec.whatwg.org/#cors-protocol-and-credentials)
  e [RFC 6265 §8.5](https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5).

## Recon e escolha

**Atual:** o cliente web usa `fetch('/v1/...', { credentials: 'include' })`;
Vite faz proxy de `/v1` para a API. Console e API no E2E local usam o mesmo
hostname com portas diferentes, portanto o servidor Vite recebe o cookie
host-only. A API permite uma origem exata, mas não emite
`Access-Control-Allow-Credentials: true`; [AUD-0580](../04_audit/0580_cross_origin_oidc_gap_2026-09-27.md)
reproduziu isso no hook com Node 22. O cliente OIDC local exige hostname
igual para console/callback e recusa produção.

**Invariante:** um cookie operacional emitido pela API chega à API nas
chamadas do console, nunca ao servidor estático do console, e nunca autoriza
uma mutação originada de outro site ou de uma origem irmã não aprovada. A
recarga por cookie e os erros 401/503 preservam o contrato da SPEC 0144.

| Caminho                                                                | Avaliação                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Mesmo hostname com proxy `/v1` no servidor web                         | Simples para dev, mas o servidor web recebe o cookie; não satisfaz o invariante de produção.                              |
| Hosts HTTPS distintos no mesmo site, navegador chama a API diretamente | **Escolhido**: cookie host-only fica no host da API; exige origem fixa no bundle, CORS com credenciais e CSRF por origem. |
| Proxy BFF no servidor web                                              | O BFF receberia o cookie, ampliando a fronteira de confiança sem necessidade demonstrada.                                 |

Exemplo de topologia, sem escolher domínio real:
`https://console.example.test` e `https://api.example.test`. Ambos devem
pertencer ao mesmo site HTTPS sob controle do deployment, com certificados e
DNS próprios. O domínio real, a relação de site e o hostname do IdP serão
registrados no manifesto de ambiente e verificados no navegador; o código
não tenta inferir eTLD+1 por uma regra caseira.

## Contrato proposto

1. O build de produção do console exige `VITE_CVG_CONSOLE_ORIGIN` e
   `VITE_CVG_API_ORIGIN` públicos, HTTPS, sem usuário, senha, path, query ou
   fragmento, com hosts distintos. A imagem web vincula os valores ao
   manifesto/digest do candidato. No boot do browser, `location.origin`
   deve corresponder à origem de console compilada; divergência bloqueia
   chamadas autenticadas e mostra erro de configuração. Nenhum valor vem de
   query string, `postMessage`, redirect do IdP ou storage. Apenas o perfil
   local sintético pode usar URLs relativas e proxy Vite; um build de
   produção falha se cair nesse modo.
2. Um único transporte do cliente web transforma caminhos internos `/v1/`
   na origem de API fixada, rejeitando URL absoluta, `//`, path fora da
   allowlist e troca de origem após normalização. Todas as chamadas de
   sessão, login, logout e domínio passam por ele com
   `credentials: 'include'`. O callback global de 401 continua distinguindo
   primeira visita/recarga, e falha de rede/CORS vira indisponibilidade sem
   apagar cookie nem declarar logout. O console não persiste token ou sessão.
3. A API tem `OPERATOR_CONSOLE_ORIGIN` explícita e contida na allowlist de
   origens. Somente para essa origem emite `Access-Control-Allow-Origin`
   exato, `Access-Control-Allow-Credentials: true` e `Vary: Origin` em
   preflight e resposta real, inclusive 401/503. Outras origens que a API
   admita para contratos sem cookie não ganham o cabeçalho de credenciais.
   Origem ausente, `null`, múltipla ou não permitida também não ganha CORS
   com credenciais. `*` é proibido. Métodos e headers continuam na
   allowlist explícita. O proxy/CDN não pode sobrescrever ou refletir
   qualquer `Origin`. `Vary: Origin` isola variantes de CORS, não usuários:
   todas as respostas `/v1/**` recebem `Cache-Control: private, no-store`
   (inclusive 200/401/503 e `Set-Cookie`), e o CDN faz bypass de cache para
   esse prefixo. Não se usa `public`, `s-maxage` ou outra diretiva que
   permita armazenar dados de operador em cache compartilhado. A regra
   segue a [RFC 9111 §5.2.2](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2).
4. Para `POST`/`PATCH` e outras mutações autenticadas por cookie, a API
   exige `Origin` exato do console antes de efeitos. Ausência, `null`,
   múltiplo, origem irmã ou esquema HTTP são negados; a validação ocorre no
   servidor e não depende de CORS como proteção CSRF. A presença do **nome**
   do cookie operacional, inclusive duplicado ou malformado, não pode fazer
   a rota pular a checagem ou cair em outro modo de autenticação; o guard
   roda antes do efeito e distingue chamadas de serviço sem cookie. O
   `POST /v1/auth/oidc/start` exige `Origin` exato mesmo sem cookie
   operacional, antes de reservar state ou emitir pendente, como já faz a
   rota local. O callback OIDC GET
   continua público para a navegação do IdP, mas só aceita state/cookie
   pendente válido e de uso único. Webhooks assinados e chamadas de serviço
   sem cookie mantêm contrato próprio e são testados separadamente.
5. Em HTTPS, o cookie de sessão da API se chama
   `__Host-cvg_operator_session`, com `Secure; HttpOnly; SameSite=Strict;
Path=/` e **sem** `Domain`. O pendente se chama
   `__Host-cvg_oidc_pending`, com `Secure; HttpOnly; SameSite=Lax; Path=/`
   e cinco minutos. O prefixo `__Host-` faz o browser rejeitar um cookie
   com `Domain` injetado por uma origem irmã, inclusive quando a vítima
   ainda não possui cookie da API, conforme o
   [draft rfc6265bis §4.1.3.2](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/).
   O serving de produção rejeita os nomes locais antigos, mesmo se forem
   o único cookie apresentado; os nomes sem prefixo ficam limitados ao
   perfil HTTP sintético. A resposta de callback apaga o pendente e emite
   o operacional. Cookies duplicados ou malformados falham fechados. O
   servidor estático do console não recebe, encaminha, registra nem
   replica qualquer um desses cookies.
6. O NGINX de produção do console **não** encaminha `/v1/`; essa rota
   responde 404 sem SPA fallback. Ele emite `Content-Security-Policy` com
   `connect-src` restrito à origem de API do manifesto, sem `*`; um destino
   extra exige justificativa e revisão. A API usa HTTPS/HSTS e só confia em
   proxies com endereços explícitos. A configuração do proxy TLS, do CSP e
   da allowlist CORS são parte do manifesto do candidato. Não se usa a
   implementação `localOidc` em produção. O cliente OIDC corporativo HTTPS,
   método de autenticação do client, issuer, redirect e claims MFA/grupo
   requerem integração e revisão separadas da SPEC 0144 quando o usuário
   fornecer os parâmetros.

## Rollout e prova

A API ganha primeiro o contrato de CORS/CSRF com origens exatas enquanto o
console anterior ainda usa o proxy sintético, sem emitir o novo cookie em
produção. O bundle web com origem fixa é certificado em staging com a API
compatível e o par real de hosts. Se houver clientes antigos ativos, o
cutover exige janela controlada: drenar o console antigo, revogar sessões
antigas, impedir que HTML/service worker em cache reabra o bundle relativo
e exigir novo login. Não se aceita simultaneamente o nome local antigo e o
`__Host-` de produção. Na primeira implantação sem clientes ativos, o
bundle novo já nasce com host separado.
Depois de emitir cookies host-only no host da API, rollback só pode usar um
bundle anterior que **já** chame diretamente esse host. O bundle antigo com
proxy relativo não restaura a sessão e não é destino válido. Se ainda não
houver versão anterior compatível, o rollback bloqueia o serving do console,
revoga as sessões afetadas e exige novo login após corrigir o candidato;
não emite cookie no host do console. A remoção do proxy é etapa posterior,
com prova de que nenhum cliente ativo ainda o usa. O manifesto registra imagem, origem de console,
origem de API, issuer, redirect, certificado TLS e allowlist de proxy/CORS.

- Testes de configuração e HTTP: valores ausentes, HTTP em produção, mesmo
  host, URL com usuário/path/query, path `//evil`, URL absoluta, origem
  malformada, preflight de método/header não permitido, ACAO/ACAC/Vary
  exatos em 200/401/503, ausência de ACAC para origem negada e cache/CDN.
- Testes CSRF: mutação com cookie e `Origin` exato passa; sem `Origin`, com
  `null`, origem irmã, HTTP e cabeçalho duplicado falha antes de efeito.
  `POST /v1/auth/oidc/start` sem cookie também exige origem exata; webhook
  assinado e chamada de serviço sem cookie continuam a funcionar.
- Cache e cookie: dois operadores/tenants pedem o mesmo `GET /v1/**` pela
  mesma origem e nunca recebem o corpo um do outro, mesmo através do CDN;
  `private, no-store` está presente em respostas autenticadas, erros e
  `Set-Cookie`. Uma origem irmã tenta injetar cookie operacional/pending
  com `Domain` quando não há cookie da API e quando já há; Chromium rejeita
  `__Host-` inválido. O serving de produção rejeita nomes antigos únicos e
  duplicados.
- Servidor estático real: imagem NGINX do candidato responde `/v1/session`
  com 404 sem encaminhar cookie, entrega CSP com `connect-src` da API
  exata, e Chromium bloqueia via CSP uma tentativa de conexão a origem não
  aprovada antes de chegar à rede. O teste lê os headers servidos, não só
  o arquivo de configuração.
- Chromium com dois hosts HTTPS sintéticos no mesmo site e IdP sintético em
  outro site, usando certificados e resolução locais: o request ao servidor
  do console **não** contém cookie operacional; o request direto à API o
  contém; `GET /v1/session` restaura identidade; 401/503 e retry mostram
  estados corretos. No callback, só o cookie pendente Lax chega; o Strict
  operacional não chega. OTP errado não cria sessão, OTP válido cria;
  replace/logout/replay e limpeza de fixtures são observados.
- A prova de transporte com sessão/IdP sintéticos pode anteceder o issuer
  corporativo. A prova final do fluxo corporativo, a retenção/purga da
  [SPEC 0149](0149_operator_auth_purge.md), integração do branch após
  PR-L04, `typecheck`, `lint`, suíte Node 22 sem skips relevantes,
  `test:postgres`, E2E, certificação e Verify/Security remotos no mesmo SHA
  são gates separados de produção.

## Estado

`BUILD_T3_APPROVED_USER / ISOLATED_SYNTHETIC_BUILD_PASS /
CORPORATE_ISSUER_PENDING / ROOT_AND_STAGING_PENDING / PRODUCTION_NO_GO`.

A implementação isolada `7019422` e os gates sintéticos estão registrados na
[prova PR-301/302 T3](../04_audit/evidence/PR301-CORP-T3-20260928/proof.json).
O follow-up isolado `ed012a4` exige que console e API HTTPS pertençam ao
mesmo site, preservando o cookie operacional `SameSite=Strict`. A
[prova Chromium de transporte](../04_audit/evidence/PR302-HTTPS-BROWSER-20260928/proof.json)
usa a imagem NGINX do commit e hosts HTTPS sintéticos distintos; valida o
bundle real, o hook de segurança da API, cookies, CORS, CSRF, CSP e estados
401/503. O IdP, a sessão e os handlers da API nessa prova são sintéticos;
o entrypoint corporativo com PostgreSQL, MFA e issuer HTTPS público no mesmo
digest, a integração no root e o certificado de produção continuam pendentes.
