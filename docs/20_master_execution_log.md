# 04/11/2026 — auditoria 0626 e reconciliação dos pontos de entrada (Claude Code)

- Auditoria [0626](04_audit/0626_repository_audit_2026-11-04.md): nota 76/100, produção `NO_GO`. Gates: typecheck, lint, `npm audit`, links/evidências, skips, catálogo de tools PASS; `boundary:products` 0 violações e `INCOMPLETE` (HISO-005); amostra de 535 testes PASS.
- PR #40 (`362dc043c`) confirmado MERGED com 11 checks SUCCESS; consolidação `MAIN-CONSOLIDATION-20261103` e publicação `PUBLICATION-20261102` encerradas como integradas.
- Ledgers de estado, log e backlog reduzidos ao registro vigente; histórico preservado em `08_runtime/archive/*_ate_20261103.md.txt`.
- SPECs propostas para as pendências da 0626: 0313 (sandbox `PROCESS` na imagem, T3), 0314 (evidência fora do clone, T3) e 0315 (divisão do `server.ts`, T2). Nenhum BUILD, remoção ou mudança de imagem.
- SPEC 0314 (opção A) implementada: clone enxuto de ~56 MB e modo `CVG_SPARSE_EVIDENCE=1` nos checkers de links e higiene, com testes. Nada removido do repositório.
- SPEC 0315 implementada: `server.ts` dividido em 7 módulos de apoio e 13 registradores de rota; ordem de rotas protegida por fixture do original. `apps/api` 977/977 (sem PG), lint, tipos e build de runtime verdes. `test:postgres`, cobertura e `certify` ficam para a CI.
- SPEC 0313 revisada sem BUILD: o código só habilita `PROCESS` com `bubblewrap`; a decisão "só Landlock" partia de premissa errada e foi revogada. `Dockerfile` intacto; nova decisão D1' registrada como pendente.
- PR #41: 7 alertas CodeQL de rate limit (código movido) dispensados como falso positivo por decisão do usuário. Novo gate de ledgers (`check-ledgers.mjs`, 5 testes) encadeado em `docs:check-links`.
- Decisões D1' (runner separado, SPEC 0316), staging local e Keycloak no staging registradas. Proteção do `main` verificada via API e arquivada como evidência; condição 5 da barra 0373 atualizada.

## 05/11/2026 — SPEC-GUARDRAILS-20261105 (Codex, T1 documental / proposta T3)

- [SPEC 0317](02_spec/0317_security_guardrails.md): seis achados conferidos, regras, negativos, aceites e decisões de contrato; `PROPOSED_FOR_HUMAN_T3_REVIEW`, sem BUILD. Probe sintético em clone `d394d71a4` reproduziu engine com operatorId do agente, três saídas allowed, answer do cliente, POST com approval:view e segredo na URL do produto. Autoria humana ponta a ponta PostgreSQL ainda NOT_RUN; flags têm também atribuições no smoke, sem guarda de despacho encontrada.
- G6 encaminhado separadamente ao [backlog do Assistente de Plantão](../products/shift-assistant/docs/backlog.md), item SEC-SHIFT-WEBHOOK-20261105. Sem importar consumidor no núcleo ou conceder release.
- Dependência de validação: [AUDIT-PG-RUN-20261105](08_runtime/audit-pg-run-20261105.md), clone externo e npm ci exit 0; Docker client instalado com socket negado, psql ausente, 5432 preservada. Gates PG/imagem locais NOT_RUN; baseline legado não aplicável ao banco novo pretendido. Sem sudo/usermod na ausência de autorização explícita.
- CI histórica do PR #41 consultada via GitHub: artefato ZIP com digest conferido; commit 06eaa98fb tem 482 PG passados, zero falhos/skips. Nenhuma transferência de PASS para d394d71a4. Node local 22.23.3 diverge do pin 22.23.2. Código, lockfile e certification principal preservados; execução do Claude não alterada.
- Validação documental: docs:check-links completo (links, higiene e ledgers), formatação direcionada e git diff --check exit 0. Evidência em `docs/04_audit/evidence/SPEC-GUARDRAILS-20261105/`; sem rodar gates de aplicação como substituto dos bloqueados.
- Retomada AUDIT-PG-RUN-20261105 após usuário informar “feito”: grupo Docker atualizado, acesso via sg docker, sem sudo. Node 22.23.2 próprio com checksum oficial; npm ci exit 0 em 7,741 s. PostgreSQL 16.15 descartável na porta 32768, sem tocar 5432.
- [Resultados locais](08_runtime/audit-pg-run-20261105.md): test:postgres 482/482, zero falhas/skips, exit 0, 599,318 s; postgres-proof PASS, 19,133 s (32 eventos/53 tabelas restauradas); Phase4A 102/102, zero falhas/skips, exit 0, 21,239 s; gate image/smoke não root PASS, exit 0, 80,032 s. Baseline legado não aplicável ao banco novo. Comparação por arquivo/nome completo: mesmo inventário de 47 arquivos/482 testes da CI #41.
- Logs/JSON/hashes da retomada em `docs/04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/`; saída também no scratch externo. Containers nomeados e tag da imagem desta task removidos após captura; sem prune global. Código/lockfile/certification principal e execução do Claude preservados. SPEC 0317 segue proposta sem BUILD; produção NO_GO.

- Histórico anterior (até 03/11/2026) arquivado integralmente, sem alteração, em [`execution_log_ate_20261103.md.txt`](08_runtime/archive/execution_log_ate_20261103.md.txt) (SHA-256 `4d8e2cdcd2776a2fea4016241710745c7ab19032e68191991e204ec910ade57c`, ledger original completo). Texto `.md.txt` para não manter links relativos quebrados.

## 05/11/2026 — AUDIT-FULL-RUN-20261105 (Claude Code, auditoria com execução)

- Bateria completa em clone descartável de `d394d71a4`, Node 22.23.2 e PostgreSQL próprio: `certify` 16/16 em 1h59, `CONDITIONAL_GO`; `verify:phase2` e `verify:phase3` 482/482; OIDC hosts 15/15; produto 185/185; imagem PASS. Nota 73/100, produção `NO_GO`.
- Falhas: `certification:self-test` (defeito real; 43/43 só com a linha aplicada no clone), `boundary:products` `INCOMPLETE`, `test:boundary:native` (pin do git; 79/79 com pin ajustado no clone), `rem21-014` (WebKit sem bibliotecas no host; PASS na CI), `certify:phase4a` (pareceres presos ao candidato antigo, esperado).
- Não executados: `test:differential:reference`, `test:secrets:config`, `test:coverage:per-file`, prova HTTP com PostgreSQL do G1. `docs:audit` cortado por timeout.
- Evidência em `docs/04_audit/evidence/AUDIT-FULL-RUN-20261105/`. Relatório no [Claude Docs](https://claude.ai/artifact/7rHkerLqzhGKR3rj8M3Zp2). Sem mudança de código, commit ou push.
