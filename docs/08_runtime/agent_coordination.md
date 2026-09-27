# Coordenação entre agentes — Codex e Claude Code

- Criado em 27/09/2026 a pedido do usuário: Codex e Claude Code trabalham ao
  mesmo tempo neste repositório, no mesmo diretório e no mesmo `main`, com a
  mesma identidade git. Este arquivo é a fonte única de quem está com o quê.
- Vale para qualquer agente. Em conflito entre este arquivo e uma instrução
  direta do usuário, vale a instrução do usuário.

## Regras

1. **Claim antes de trabalhar.** Antes de alterar código ou documento, o
   agente registra no quadro abaixo a tarefa, os caminhos que vai tocar e o
   estado `ATIVO`. Não trabalhe em caminho que outro agente declarou `ATIVO`.
   Ao commitar, mude para `CONCLUÍDO` com o hash.
2. **Commit só do que é seu.** Use `git add <caminho>` explícito com os
   arquivos que você alterou. Proibido: `git add -A`, `git add .`,
   `git commit -a` e `git add` de diretório inteiro que contenha arquivo de
   outro agente.
3. **Não desfaça trabalho alheio.** Proibido `git checkout --`, `git restore`,
   `git stash`, `git reset`, `git clean` ou reformatar arquivo que você não
   alterou. Proibido reescrever histórico ou force push.
4. **Ferramentas de efeito amplo exigem claim.** `prettier --write` só nos
   seus arquivos; `npm install`/`npm ci` que alterem `package-lock.json`,
   `npm run certify`, `npm run test:e2e` (regrava snapshots e artefatos) e
   `npm run sbom`/`licenses:check` (regravam `certification/`) só com claim da
   linha correspondente.
5. **Ledgers compartilhados.** `docs/99_runtime_state.md`,
   `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`, o backlog
   `docs/03_build/0356_*` e o pacote `docs/03_build/0357_*` são editados por
   ambos. Antes de editar, confira `git status <arquivo>`: se estiver
   modificado e não for por você, espere o outro agente commitar. Entradas
   novas entram no topo; não reescreva entrada de outro agente.
6. **Certificação e push.** Um agente por vez, com claim próprio. O
   `certify` exige worktree limpo: só rode quando nenhum claim `ATIVO` tiver
   arquivos sem commit. Push para o GitHub só com autorização do usuário.
7. **Isolamento opcional.** Para trabalho de código longo, o agente pode usar
   um `git worktree` em branch própria e integrar em `main` só com todos os
   gates verdes; o claim continua obrigatório.

## Divisão de frentes (confirmada pelo usuário em 27/09/2026)

| Frente                                                                                                               | Dono        | Referência                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| AUD-0578 R0–R2: CI remoto, E2E (PR-009), candidato e certificação (PR-003), qualidade (PR-005/007), discovery PR-101 | Codex       | [0358](../03_build/0358_aud0578_execution_roadmap.md)                                                     |
| Frente FL do legado: PR-L04, PR-L06 a PR-L10, PR-L12 (R3 do 0358)                                                    | Claude Code | [0356](../03_build/0356_production_backlog_2026-09-26.md), [inventário](../../legacy/LEGACY_INVENTORY.md) |

## Quadro de claims

| Tarefa                                        | Agente      | Caminhos                                                                                                                                                                               | Desde      | Estado                                                                                            |
| --------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| SPEC 0139 — fonte visual do E2E (AUD-0578 R1) | Codex       | `apps/web/**`, `package-lock.json`, `tests/e2e/**`, `certification/license-report.json`, `docs/02_spec/0139_*`, `docs/03_build/0358_*`, `docs/03_build/0305_*`, `docs/03_build/0356_*` | 27/09/2026 | `ATIVO`; lockfile contém também a edição PR-L06, aguardar commit dessa frente antes de certificar |
| PR-010 — prontidão do worker homolog          | Codex       | `apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts`, `docs/02_spec/0141_*`, `docs/02_spec/0190_*`                                                              | 27/09/2026 | `ATIVO`                                                                                           |
| PR-L06 — evals neutros                        | Claude Code | `packages/agent-evals/**`, `legacy/**`, `scripts/phase10-eval-report.ts`, `packages/harness/src/__tests__/agent-loop-evals.test.ts`, `docs/02_spec/0140_*`                             | 27/09/2026 | `ATIVO`                                                                                           |
