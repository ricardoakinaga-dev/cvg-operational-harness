### FIX-ALL-20261105 — correção dos achados da auditoria e BUILD da SPEC 0317 (Claude Code) (ATIVO)

- Autoridade: usuário em 05/11/2026 pediu resolver todos os achados e, por decisão explícita, aprovou BUILD de G1–G5 da SPEC 0317 como proposta, HMAC próprio no G6 e push com merge do PR #41.
- Caminhos: `scripts/phase10-verify.mjs`, `scripts/build-installed-reference.mjs`, `scripts/boundary-semantic-compiled.mjs`, `.github/workflows/`, `apps/api/`, `apps/worker/`, `packages/`, `products/shift-assistant/`, `docs/02_spec/0317*`, ledgers. Trabalho paralelo em worktrees próprias; `certify`, `test:e2e`, `sbom` e `licenses:check` cobertos por este claim. Se precisar destes caminhos, coordene aqui antes.

### AUDIT-PG-RUN-20261105 / SPEC-GUARDRAILS-20261105 — Codex (GATES CONCLUÍDOS / SPEC PROPOSTA)

- Autoridade: pedido do usuário em 05/11/2026, tarefas de gates isolados e SPEC T3 sem BUILD. Sem sudo sem autorização explícita, usermod, push, código, lockfile ou dados reais.
- Gates: somente clone descartável externo em `d394d71a4`; nunca escrever `certification/` neste checkout nem interferir no clone/processos do Claude. Após usuário informar “feito”, Docker acessível via grupo atualizado e PostgreSQL 16.15 descartável na porta 32768. Porta 5432 e execução do Claude preservadas.
- Caminhos próprios: esta seção, novo `docs/02_spec/0317_security_guardrails.md`, `docs/08_runtime/audit-pg-run-20261105.md` e evidências pequenas em `docs/04_audit/evidence/AUDIT-PG-RUN-20261105/` e `docs/04_audit/evidence/SPEC-GUARDRAILS-20261105/`. Continuidade da SPEC somente em seções novas identificadas pela task nos três ledgers; preservar seções e alterações do Claude, sem assumir a auditoria geral 0627. Sem commit de arquivos de outro agente.
- Resultado: [SPEC 0317](../02_spec/0317_security_guardrails.md) em `PROPOSED_FOR_HUMAN_T3_REVIEW`, seis achados rastreados, sem BUILD. [Gates locais](audit-pg-run-20261105.md) PASS em Node 22.23.2: 482 PG (mesmo inventário da CI #41), prova backup/restore/rollback, 102 Phase4A e imagem/smoke não root. Zero falhas/skips nas suítes; baseline legado não aplicável. Containers próprios e tag da imagem removidos após captura. Sem sudo, push ou liberação de produção. Próximos passos: incorporar evidência à auditoria geral e revisar SPEC T3.
- Extensão documental do claim: novo item `SEC-SHIFT-WEBHOOK-20261105` em `products/shift-assistant/docs/backlog.md`, separado dos dez cartões PISO existentes, conforme ADR-010.
- Retomada após usuário informar “feito”: grupo docker já inclui ricardo; processo atual ainda tem grupos antigos. Conferir acesso em novo processo `sg docker`, sem sudo/usermod, e rodar gates no clone próprio `/tmp/cvg-codex-20261105/repo`. Claim inclui recursos Docker nomeados `cvg-codex-audit-pg-20261105*`, logs externos, atualização do relatório/evidências próprios e somente continuidade Codex nos ledgers. SPEC 0317 continua proposta sem BUILD autorizado.
- Docker via `sg docker` confirmado acessível. Runtime próprio Node 22.23.2 obtido de nodejs.org com SHA-256 conferido. Recursos adicionais: tag da receita `cvg-operational-harness:ci-cvg-codex-audit-pg-20261105-*` e containers `cvg-rem21-010-*` criados exclusivamente pelo processo da prova desta task, com cleanup do próprio script; não remover recursos de outros processos.

### AUDIT-FULL-RUN-20261105 — auditoria com execução completa dos gates (Claude Code) (CONCLUÍDO)

- Autoridade: usuário pediu em 05/11/2026 relatório completo com notas 0–100, rodando todos os testes, para dar o estado real do programa. Sem push, sem produção, sem mudança de código.
- Execução em clone descartável `~/.cache/cvg-audit-20261105/repo` (fora de `/tmp`, exigência dos testes de sandbox), Node 22.23.2 e contêiner próprio `cvg-claude-audit-pg` (`postgres:16-alpine`, porta aleatória em loopback; não toca em `cvg-his-v5-postgres`): `certify`, `test:e2e`, `sbom`, `licenses:check` e `test:postgres` não escrevem neste checkout. Lockfile intacto.
- Caminhos exclusivos neste checkout: esta seção; ao fim, `docs/99_runtime_state.md`, `docs/20_master_execution_log.md`, `docs/30_backlog_master.md` e novo `docs/04_audit/0627*` se o usuário pedir o arquivo em `docs/`.
- Resultado: `certify` 16/16, `CONDITIONAL_GO`; nota 73/100, produção `NO_GO`. Relatório no [Claude Docs](https://claude.ai/artifact/7rHkerLqzhGKR3rj8M3Zp2); evidência em `docs/04_audit/evidence/AUDIT-FULL-RUN-20261105/`. Clone, contêiner e imagem removidos. Sem commit, push ou mudança de código.

### IMPL-0626-20261104 — implementação das SPECs 0313, 0314 e 0315 (Claude Code) (CONCLUÍDO local)

- Autoridade: usuário decidiu em 04/11/2026 (0313 D1 = só Landlock; 0314 = só opção A; 0315 = 9 fatias) e pediu "pode implementar, siga a melhor sequência lógica". Sem push, sem produção.
- Resultado: 0314 (`e1c6edeb2`) e 0315 (`56069ff3e`, `71dbc8a4c`) implementadas localmente; 0313 bloqueada para nova decisão (sem alteração em `Dockerfile`). Sem push; CI com PostgreSQL pendente.
- Ordem: 0314, depois 0315 (suíte base com PostgreSQL antes), depois 0313 (só após conferir que o Codex não tem claim vivo no `Dockerfile`).
- Caminhos exclusivos: `docs/02_spec/0313*`, `0314*`, `0315*`; README (seção de clone); 0314: `docs/08_runtime/clone_enxuto.md` e teste novo; 0315: `apps/api/src/server.ts`, `apps/api/src/routes/**`, teste de caracterização novo; 0313: `Dockerfile`, `packages/sandbox/native/**` (leitura), `deploy/systemd/user/README.md`, `certification/runtime-image.json` só se o gate exigir. Commits seletivos por `git add <caminho>`; ledgers ao fim de cada SPEC.

### AUDIT-REPO-SCORE-20261104 — auditoria com notas do repositório (Claude Code) (CONCLUÍDO T1, ampliado)

- Autoridade: usuário pediu auditoria do repositório e relatório com nota 0–100 por item; depois pediu salvar o arquivo em `docs/`.
- Escopo (ampliado a pedido do usuário para resolver as pendências documentais da 0626): `docs/04_audit/0626_repository_audit_2026-11-04.md`, `README.md` (seção de estado), `docs/99_runtime_state.md`, `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`, `docs/08_runtime/aud0625_current_index.md` (aviso de superado), `docs/08_runtime/main-consolidation-20261103.md` (status), esta seção e novos `docs/08_runtime/archive/*_ate_20261103.md.txt`. Sem mudança de código, push ou produção.

### MAIN-CONSOLIDATION-20261103 — integração e limpeza (Codex) (CONCLUÍDO)

- Resultado: PR #40 MERGED em `362dc043c` (04/11/2026, 11 checks SUCCESS); somente `main` no remoto; onze pontas preservadas em tags `archive/consolidation-20261103/*`. Detalhe em [main-consolidation-20261103.md](main-consolidation-20261103.md).

### Histórico de claims

- Todos os claims anteriores (inclusive os marcados ATIVO, parados e sem dono vivo) estão arquivados integralmente, sem alteração, em [`agent_coordination_ate_20261103.md.txt`](archive/agent_coordination_ate_20261103.md.txt) (SHA-256 `5f27479dbf6508f419223cf4653d05f154ff5ca58dea58c26d7c46866ece4ff2`). Nenhum deles reserva caminho a partir de 04/11/2026; novos claims entram no topo desta seção. Regras: `AGENTS.md` da raiz.
