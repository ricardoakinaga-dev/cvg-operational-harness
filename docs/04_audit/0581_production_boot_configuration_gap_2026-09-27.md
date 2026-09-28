# AUD-0581 — contrato de configuração no boot de produção

- Data: 27/09/2026. Task: [PR-204](../03_build/0356_production_backlog_2026-09-26.md).
- Estado: `CONFIGURATION_CONTRACT_GAP / SPEC_REVIEW_READY / PRODUCTION_NO_GO`.
- Escopo: inspeção somente leitura do checkout `7a70420` e do branch OIDC
  `85c2c7d`; sondas sintéticas do parser e do preflight do worker em Node 22. Não houve boot completo,
  conexão com dado real, deploy ou alteração de código nesta auditoria.
- Barra: a [condição 7 do plano 0354](../03_build/0354_production_executive_plan_2026-09-26.md)
  exige RLS no boot e roles separadas; as condições 2, 4 e 5 exigem contrato
  publicado, gates atuais e identidade MFA no mesmo candidato/configuração.

## Observações reproduzidas

| Fronteira            | Fato observado                                                                                                                                                                                                                                                                                                                | Limite da inferência                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser compartilhado | [`parseEnv`](../../packages/shared/src/env.ts) aceitou um ambiente sintético `production` com `CVG_IDENTITY_MODE` ausente, `OUTBOX_DURABLE_INBOUND=false`, keyrings ausentes; aceitou também `ENABLE_REAL_CHANNELS=true`. Rejeitou `CVG_IDENTITY_MODE=simulation`.                                                            | Aceite do parser não prova que a API escuta ou executa efeito externo: o builder tem verificações próprias.                                                                                        |
| API                  | [`main.ts`](../../apps/api/src/main.ts) chama `parseEnv(process.env)` e descarta o valor; [`buildServerFromEnv`](../../apps/api/src/server.ts) lê o ambiente de novo e aplica guards adicionais de RLS, inbound durável, resolver de identidade e rate limit. Opções injetáveis podem mudar a fonte efetiva de algumas flags. | Os negativos existentes cobrem o builder, mas não uma matriz única de processo publicado, opções e ambiente. Não foi confirmado bypass de RLS ou inbound nesse entrypoint.                         |
| Worker               | [`main.ts`](../../apps/worker/src/main.ts) seleciona runtime por variáveis próprias, sem `parseEnv`; os modos reconhecidos em [`worker.ts`](../../apps/worker/src/worker.ts) recusam `NODE_ENV=production`. Com `NODE_ENV` ausente, o modo `controlled-memory` ultrapassa essa guarda.                                        | Não foi encontrado worker produtivo autorizado; o perfil ausente é uma lacuna de configuração e precisa falhar antes do runner.                                                                    |
| Web                  | [`vite.config.mts`](../../vite.config.mts) fixa flags no build, e a imagem serve estáticos com [`nginx.web.conf`](../../deploy/nginx.web.conf). [`session.ts`](../../apps/web/src/auth/session.ts) aceita o perfil de teste controlado no bundle.                                                                             | Um build com flags de simulação não é candidato válido para produção; a API ainda teria de aceitar autoridade indevida para existir bypass fim a fim. Não houve execução desse build nesta rodada. |
| Gateway              | [`gateway.ts`](../../packages/model-gateway/src/gateway.ts) recebe providers do chamador; o adapter externo exige chave por padrão, mas `requiresApiKey: false` dispensa essa checagem. O parser exige `OPENAI_API_KEY` não placeholder em produção mesmo sem provider composto e não conhece `MODEL_PROVIDER_API_KEY`.       | A exigência do parser não demonstra integração real: o worker atual usa provider determinístico. Uma composição externa produtiva deve bloquear o override sem método alternativo aprovado.        |

A sonda usou apenas valores sintéticos. Seu resultado, em ordem, foi:

```json
{"name":"baseline","accepted":true,"identity":null,"durable":false,"realChannels":false,"operatorKeyringPresent":false,"rateLimitKeyringPresent":false}
{"name":"real_channels","accepted":true,"identity":null,"durable":false,"realChannels":true,"operatorKeyringPresent":false,"rateLimitKeyringPresent":false}
{"name":"identity_simulation","accepted":false,"error":"Production requires trusted operator identity mode; simulation is forbidden"}
```

`getWorkerStartupFailure` com `controlled-memory` e tenant sintético
retornou `null` quando `NODE_ENV` estava ausente ou `unknown`; com
`production`, retornou `production_controlled_worker_forbidden`. A sonda
chamou somente o preflight, sem iniciar worker ou processar evento.

`ENABLE_REAL_*` aparece no schema, mas o helper
`realWorldActionsDisabled` não tem chamada de runtime fora de testes.
Portanto a flag pode declarar capacidade real sem ativá-la ou impedir seu
uso; isso é drift do contrato, não prova de ação clínica, financeira, RAG ou
canal real. O branch OIDC já rejeita credencial DDL e auto-migration no
serving de produção e proíbe o IdP local nesse perfil; a PR-204 deve
preservar essas barreiras da [SPEC 0144](../02_spec/0144_trusted_operator_session_production.md).

## Achados e próximo gate

1. **P0 para GO, contrato dividido:** o parser é chamado e descartado na API;
   o builder decide de novo, enquanto worker e bundle web usam outros
   caminhos. Não há um snapshot tipado por processo/artefato que prove a
   configuração efetiva antes de listener, polling ou build publicável.
   Um worker controlado aceita `NODE_ENV` ausente; isso não é prova de
   execução produtiva, mas pode mascarar um deploy mal configurado.
2. **P0 para GO, flags sem efeito:** as quatro `ENABLE_REAL_*` passam pelo
   parser sem consumidor operacional; qualquer `true` deve ser recusado
   enquanto a capacidade correspondente não tiver composição, testes e gate
   próprios. A flag não pode servir como autorização implícita.
3. **P1, segredo sem vínculo:** `OPENAI_API_KEY` é obrigatório em produção
   embora nenhum provider real seja composto. A migração para o nome neutro
   deve exigir segredo somente quando o adapter autorizado for selecionado,
   sem imprimir o valor nem criar precedência ambígua. O adapter externo
   admite `requiresApiKey: false`; produção deve recusar esse override salvo
   autenticação alternativa aprovada e testada.
4. **P0 para candidato web:** o gate de build deve rejeitar simulação/teste
   controlado em bundle de produção e ligar o artefato à topologia HTTPS
   aprovada; a [SPEC 0150](../02_spec/0150_cross_origin_operator_console.md)
   ainda aguarda revisão T3.

A [SPEC 0151](../02_spec/0151_production_boot_configuration_contract.md)
define a correção e os negativos. Ela requer revisão humana T3 antes de
BUILD. O discovery do primeiro consumidor, o IdP corporativo e a escolha de
provider/canal continuam em gates próprios; esta auditoria não promove o
candidato a produção.

Uma crítica independente I1 rejeitou quatro lacunas da primeira SPEC:
perfil ausente do worker, ordem OIDC/HMAC, rollout da variável de segredo e
override `requiresApiKey: false`. A revisão corrigiu os quatro pontos; I2
retornou `ACCEPT_SPEC_REVIEW_READY` somente para revisão humana, sem executar
testes ou validar código de BUILD.
