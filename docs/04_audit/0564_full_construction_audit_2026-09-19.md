# Auditoria integral de construção — 19/09/2026

## Decisão executiva

- task: `AUD-20260919-CONSTRUCTION`;
- etapa: `AUDIT`;
- candidato auditado: commit `05d1f33322a5b75e65ee3b6f0fa1a737c300d7bb`,
  com árvore limpa antes desta entrega documental;
- nota consolidada: **60/100**;
- parecer: **FAIL / REJECT** para a barra de prontidão integral;
- produção: **NO_GO**;
- escopo que continua válido: uso local, sintético e controlado, dentro dos
  limites já registrados;
- efeito desta auditoria: diagnóstico e planejamento; não revoga evidência
  histórica válida, mas impede que ela seja apresentada como certificação do
  candidato atual ou como autorização de produção.

O repositório possui uma base técnica substancial e vários controles
fail-closed. A conclusão negativa decorre da distância entre essa base e uma
composição operacional reproduzível, atual, observável e pronta para produção.
Os bloqueadores mais importantes são a cadeia de certificação divergente, o
gate PostgreSQL da Phase 4A capaz de terminar com skip, fronteiras transacionais
incompletas em aprovação/auditoria, controles distribuídos ainda locais e a
ausência de uma qualificação atual no runtime alvo.

## Escopo e método

A auditoria combinou inventário mecânico integral do diretório `docs`, leitura
dirigida dos contratos e artefatos operacionais, inspeção estática do código e
execução dos gates disponíveis. O inventário encontrou:

- 2.517 arquivos em `docs`, totalizando 27.704.911 bytes;
- 2.511 arquivos textuais;
- 633 arquivos Markdown, com 544 links internos e 15 links quebrados;
- 404 arquivos JSON, dos quais 403 parseáveis e um arquivo vazio:
  `docs/04_audit/evidence/AAA/AAA-07/rework-fencing-c6/probe-after.json`;
- 6 imagens PNG.

“Inventário integral” significa cobertura mecânica de todos os caminhos e
formatos. Não significa leitura humana linha a linha de cada log histórico. A
análise humana foi orientada por risco, contratos, entrypoints, persistência,
gates, evidências e superfícies operacionais.

Foram usados recortes independentes para backend/segurança/dados,
frontend/testes/operação e documentação/governança, seguidos de crítica final
nova. A crítica final retornou `REJECT`. A verificação foi somente leitura em
produto: nenhum código, migration, dependência, credencial, dado real, deploy
ou efeito externo foi alterado ou executado.

## Quadro de notas

| Dimensão                              |   Nota | Síntese                                                                                                                             |
| ------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------- |
| Q1 — Documentação e gates CVG         | **56** | Ampla cobertura documental, mas estado/certificação divergem e há links quebrados e vocabulário de estado inconsistente.            |
| Q2 — Arquitetura e modularidade       | **64** | Contratos e packages são fortes; módulos centrais cresceram demais e a composição ainda concentra autoridade.                       |
| Q3 — Correção e testes                | **65** | Regressão extensa e verde; skips, runtime fora do alvo e ausência de qualificação completa atual reduzem a confiança.               |
| Q4 — Segurança e privacidade          | **60** | Identidade e tenant binding são bons; replay local, SSRF/DNS e composição de produção permanecem incompletos.                       |
| Q5 — Dados, transações e migrations   | **61** | Migrações e RLS são maduras; aprovação/auditoria e idempotência de outbox precisam de garantias mais fortes.                        |
| Q6 — Confiabilidade e observabilidade | **64** | Backoff, heartbeat, DLQ e fencing existem; bootstrap de produção, sweeps e telemetria não estão qualificados.                       |
| Q7 — Frontend, UX e acessibilidade    | **68** | Há boas bases de foco, labels, reflow e reduced motion; autenticação real, recuperação de requests e evidência multibrowser faltam. |
| Q8 — Prontidão operacional            | **42** | Runbooks e CI existem, porém não há prova atual de imagem, restore, carga, segurança, SBOM e operação end-to-end no alvo.           |

Média simples: **60/100**. A média é um indicador de priorização, não substitui
os gates binários. Um único bloqueador crítico continua suficiente para manter
produção em `NO_GO`.

## Evidência executada

| Comando/controle               | Resultado                                                                 | Interpretação                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run readiness`            | PASS, 1 arquivo / 4 testes                                                | Prontidão documental básica passa.                                                                                                                   |
| `npm run typecheck`            | PASS                                                                      | Tipagem atual consistente no Node local.                                                                                                             |
| `npm run lint`                 | PASS                                                                      | Lint atual consistente.                                                                                                                              |
| `npm run format:check`         | FAIL, 9 arquivos                                                          | O comando agregado `verify` está vermelho antes de chegar aos demais gates.                                                                          |
| `npm test`                     | PASS, 269 arquivos / 1.883 testes; 14 arquivos / 116 testes skipped       | Boa regressão, mas skips não contam como evidência executada.                                                                                        |
| `npm run verify:phase4a`       | exit 0, 11 arquivos pass / 1 skip; 72 testes pass / 1 skip; 16 assertions | O contrato permite sucesso com o recorte PostgreSQL não executado.                                                                                   |
| `npm run certification:verify` | FAIL                                                                      | `CANDIDATE_DRIFT`: gravado `6185c586…`, atual `a4696afa…`; 29 hashes passam e decisão `CONDITIONAL_GO` permanece coerente para o artefato histórico. |
| Runtime local                  | Node 24.20.0                                                              | Fora do engine declarado `>=22 <23`; resultados não qualificam o runtime alvo.                                                                       |

Não foram executados nesta rodada: catálogo PostgreSQL completo atual sem
skips, E2E atual, coverage atual, build/imagem Docker, security audit, SBOM,
license gate, carga, restore ou desastre. Todos permanecem `NOT_RUN`, nunca
`PASS` por inferência.

## Achados prioritários

### F-01 — P0 — cadeia de qualidade atual não fecha

`npm run format:check` falha em nove arquivos, incluindo artefatos de gate e
evidência. Como `npm run verify` inicia pelo format, o gate agregado está
vermelho. O reparo deve ser mecânico, revisado e separado de mudança semântica.

### F-02 — P0 — certificação não representa o candidato atual

`npm run certification:verify` detecta drift entre o candidato registrado e a
árvore atual. A passagem de 29 hashes apenas prova coerência dos artefatos
históricos; não certifica a implementação presente. Uma nova certificação deve
ser gerada somente após congelar o candidato e executar todos os gates exigidos.

### F-03 — P0 — identidade do gate Phase 4A é contraditória

`docs/phase4a/GATE_VALIDATION.md:15` registra o digest
`6185c586e382d9f7…c2f5dc8`, enquanto
`docs/phase4a/PHASE_4_HANDOFF.md:25` registra
`6185c586e3820665…dbba73e`. O gate precisa de uma autoridade canônica e
checagem automática de identidade.

### F-04 — P0 — PostgreSQL pode ser pulado com saída bem-sucedida

O teste Phase 4A exige simultaneamente `TEST_DATABASE_URL` e
`PHASE4A_DISPOSABLE_PG=1` (`scripts/phase4a-certify.mjs:342-343`). A CI fornece
apenas `TEST_DATABASE_URL` (`.github/workflows/verify.yml:76`) e o script
`test:postgres` não injeta o segundo sinalizador. O verificador observado
terminou com exit 0 apesar de um arquivo/teste skipped.

### F-05 — P0 — decisão de aprovação, retomada e auditoria não são atômicas

Em `apps/api/src/server.ts:847-930`, a autoridade de aprovação é atualizada, a
execução é retomada e a auditoria é anexada em chamadas distintas. Uma falha
após a mudança de estado pode deixar a decisão efetiva sem o evento causal
esperado. A própria SPEC admite ausência de atomicidade entre repositórios.

### F-06 — P0 — idempotência de outbox não vincula o conteúdo

`packages/persistence/src/postgres.ts:953-1009` retorna o registro vencedor por
`tenant_id + idempotency_key`, sem rejeitar reuso da chave com tipo/payload
diferente. O contrato deve vincular chave, tipo, versão e hash canônico do
payload.

### F-07 — P0 — preflight de isolamento não cobre todo o schema atual

A lista de tabelas em `apps/api/src/server.ts:4385-4414` não inclui todas as
tabelas de journeys, journals, steps e checkpoints introduzidas nas migrations
recentes. O bootstrap pode declarar o conjunto pronto sem verificar RLS/grants
de todas as superfícies tenant-scoped.

### F-08 — P1 — replay de token do operador é local ao processo

`apps/api/src/operator-identity.ts:108-175` usa `Map` em memória. Em múltiplas
réplicas ou após restart, o mesmo `jti` pode ser aceito por outro processo. A
proteção precisa de autoridade distribuída ou de um desenho criptográfico que
não dependa desse cache local.

### F-09 — P1 — validação SSRF não fecha resolução e redirecionamento

`packages/shared/src/ssrf.ts:162-167` aceita imediatamente um hostname
allowlisted. A validação por endereço resolvido não está composta no caminho de
produção inspecionado. É necessário resolver, validar todos os IPs, revalidar
redirects e definir política HTTPS/credenciais.

### F-10 — P1 — caminho de worker de produção não existe

`apps/worker/src/worker.ts:131-137` bloqueia o adapter PostgreSQL controlado em
produção, sem alternativa de produção qualificada. Isso é um guardrail correto,
mas confirma que produção ainda não é uma capacidade entregue.

### F-11 — P1 — composição de observabilidade de produção é insuficiente

O servidor desabilita ou não recebe a telemetria relevante fora dos modos
controlados, e o entrypoint não demonstra exportadores, health de dependências
e alertas operacionais. Sweeps contínuos do worker também não estão compostos
no bootstrap observado.

### F-12 — P1 — cliente web não está pronto para identidade confiável

`apps/web/src/api/client.ts:446-465` envia headers de operador/tenant adequados
ao modo controlado, mas não token confiável. O helper também não estabelece
timeout, retry seguro ou tratamento robusto de resposta não JSON.

### F-13 — P1 — hotspots de manutenção e dependências implícitas

Os maiores hotspots são `apps/api/src/server.ts` (6.118 linhas),
`apps/web/src/features/platform/index.tsx` (2.235) e
`packages/persistence/src/postgres.ts` (3.672). Manifests de workspaces também
omitem dependências diretas hoje satisfeitas por hoisting da raiz, reduzindo a
reprodutibilidade isolada.

### F-14 — P1 — plano de controle documental diverge da realidade

O README ainda descreve V1/ausência de loop completo, enquanto runtime V2 e
Phase 4A estão registrados como entregues. O índice central de BUILD não
referencia adequadamente as entregas recentes, há 15 links quebrados e alguns
documentos permitem dados “anonimizados/autorizados”, em conflito com a regra
do repositório de não usar dados reais.

### F-15 — P1 — evidência de revisão independente não é reproduzível

Os artefatos em `docs/phase4a/evidence/critics` não preservam de forma uniforme
identidade da sessão, timestamp, pacote selado, sentinel por revisão e saída
bruta. Há também texto histórico dizendo que críticos estavam pendentes ao
lado de relatório final que afirma três aprovações. Isso exige reconciliação,
não apagamento do histórico.

### F-16 — P2 — qualificação operacional atual está ausente

Faltam execução atual e vinculada ao mesmo candidato para Node 22, PostgreSQL,
E2E multibrowser, coverage, imagem não-root, supply chain, carga, restore,
rollback e recuperação. A migration `0020`/delivery Phase 4A também não possui
runbook de rollback específico e ensaiado.

## Controles positivos preservados

- resolução de identidade fail-closed, tenant binding e comparação HMAC em
  tempo constante;
- RLS e wrappers que limpam contexto de tenant;
- migrations transacionais, advisory locks e checksums;
- idempotência de submissão vinculada ao payload;
- journals com tenant, hashes de proposta/payload e fencing;
- backoff, heartbeat, DLQ, drain, logs e métricas no worker controlado;
- labels, skip link, foco, reduced motion e snapshots responsivos no frontend;
- workflows de CI/security bem definidos e actions fixadas;
- postura documental honesta de `NO_GO` para produção e efeitos reais.

Esses controles reduzem risco e devem ser reutilizados. Eles não compensam os
gaps binários acima.

## Critério de saída da remediação

O parecer só pode ser reavaliado quando um único candidato congelado comprovar:

1. gates de formatação, tipo, lint, build, unit, coverage, PostgreSQL e E2E sem
   skips obrigatórios;
2. identidade de evidência e certificação sem drift;
3. invariantes transacionais e de idempotência com falhas injetadas;
4. controles distribuídos de identidade, replay, rate limit e egress;
5. worker, telemetria, runbooks, restore e rollback operacionais;
6. qualificação no Node 22 declarado, imagem e supply chain;
7. crítica independente contra o candidato selado e sentinel pós-crítica;
8. aprovação humana explícita para qualquer ampliação além do escopo
   sintético/local.

O plano de execução está em
[`0328_audit_20260919_executive_plan.md`](../03_build/0328_audit_20260919_executive_plan.md),
o roadmap em
[`0329_audit_20260919_roadmap.md`](../03_build/0329_audit_20260919_roadmap.md)
e o backlog em
[`0330_audit_20260919_backlog.md`](../03_build/0330_audit_20260919_backlog.md).
