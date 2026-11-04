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
