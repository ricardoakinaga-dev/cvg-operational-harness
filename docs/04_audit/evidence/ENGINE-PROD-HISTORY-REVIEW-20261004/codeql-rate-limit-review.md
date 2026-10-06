# Revisão independente — alertas CodeQL ativos e rate limit

Data: 04/10/2026. Revisor: Claude Code, independente do Builder/Lead GREEN.
Objeto: `security-current-scan-summary.json` (`codeql.activeWarnings`, revisão
independente `REQUIRED`) e item 5 da emenda de segurança aprovada. Nenhum
threshold, rota ou `server.ts` foi alterado.

## `js/missing-rate-limiting` — publish e rollback de agente

Rotas `POST /v1/admin/agents/:agentId/versions/:versionId/publish` e
`POST /v1/admin/agents/:agentId/rollback`. O limitador é um hook global
`onRequest` (300 requisições/min por IP, exceto probes), que roda antes de
autenticação, preflight e efeito; o CodeQL reconhece só middlewares conhecidos.

Prova no código do repositório (HEAD `e653cd3` + `73669b8`), PostgreSQL 16
descartável com papéis de migração e runtime separados e RLS, dois processos
API compartilhando `PostgresRateLimiter`, mesma origem:

| Cenário | Resultado |
| --- | --- |
| 400 requisições alternando publish (processo A) e rollback (processo B), `production`, proxy confiável | 1º 429 na requisição 301; 300 recusadas antes do limite por falta de sessão (503); 100 com 429 divididas entre os processos; 1 bucket no banco com contagem 400, chave por HMAC |
| Store indisponível (papel de runtime sem permissão na tabela de buckets), IPs novos | 429 em todas (fail-closed); `/ready` 200; após restaurar a permissão, fluxo normal |
| Proxy não confiável, 340 requisições com 250 `X-Forwarded-For` falsos | 1 bucket (IP real do socket); 1º 429 na requisição 301 |

Veredito: falso positivo do scanner; orçamento aplicado antes do efeito,
compartilhado entre processos, fail-closed e imune a cabeçalho falsificado.
Recomendação (não aplicada, exige decisão própria): orçamento adicional por
tenant e operador nas duas rotas, como já existe em decisões de aprovação.

## `js/bad-code-sanitization` — `tests/product-boundary-code-execution.test.js:39`

Fixture negativa intencional do gate de fronteira: gera código com `eval`,
`Function`, `child_process`, `Worker` e `vm` para provar que o verificador
recusa execução de código desconhecido. Os valores interpolados são caminhos
de `mkdtemp` escapados por `JSON.stringify`, sem entrada externa; arquivo de
teste, fora do bundle e do entrypoint. Veredito: falso positivo aceito.

## Guard histórico — 11 alertas CodeQL em 10 fontes antigas

Objeto: `config/codeql-historical-source-inventory.json` da cópia integrada
(`executionClosure: REQUIRES_COMPILED_ARTIFACT_PROOF`). Os 10 arquivos são
cópias históricas sob `docs/04_audit/evidence/**` (scripts de rollback de
auditoria, `probe.mjs` e uma captura antiga de `server.ts`).

Prova no artefato executável `cvg-harness:green-20261004-clean-r2`
(`node apps/api/dist/main.js`, usuário `cvg`): sistema de arquivos exportado,
17.360 arquivos (11.029 em `/app`); 0 caminhos `docs/04_audit`; 0 arquivos
com SHA-256 igual ao de qualquer das 10 fontes históricas (comparação por
conteúdo, não só por caminho). Veredito: fora do bundle, do entrypoint e da
imagem; disposição aceita.
