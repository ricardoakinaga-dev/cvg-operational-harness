# AGENTS.md — CVG Operational Harness

Este repositorio opera pelo pipeline CVG documentado em `docs/07_agents/AGENTS.md`.

Direção vigente: `docs/architecture/adrs/ADR-010-harness-product-isolation.md`.
O harness é infraestrutura reutilizável; o Assistente de Plantão é consumidor
em `products/shift-assistant`, com domínio, dados, processo, testes, deploy e
backlog próprios. Núcleo e hosts genéricos não importam o consumidor. A barra
0368 e decisões D1–D4 pertencem ao produto; nenhum release é concedido pela
separação. Carteira de transição: `docs/03_build/0370_harness_product_isolation_backlog.md`.

Antes de qualquer alteracao, o agente deve ler:

- `docs/07_agents/AGENTS.md`
- `docs/99_runtime_state.md`
- `docs/20_master_execution_log.md`
- `docs/30_backlog_master.md`

Regras principais:

- Seguir `DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT`.
- Nao iniciar codigo sem gate aprovado e task registrada.
- Nao usar dados reais.
- Nao liberar producao irrestrita.
- Nao confirmar, cancelar ou reagendar consulta real automaticamente.
- Nao responder RAG sem fonte institucional aprovada.
- Nao executar acao clinica, financeira ou prontuario definitivo.
- Toda acao sensivel exige approval ou handoff.
- Ao final de qualquer rodada, atualizar runtime state, execution log, backlog quando aplicavel e evidencias.

## Trabalho simultâneo com outros agentes

Codex e Claude Code trabalham ao mesmo tempo neste repositório, no mesmo
diretório e no mesmo `main`. Antes de alterar qualquer arquivo, leia e siga
`docs/08_runtime/agent_coordination.md`:

- registre um claim com a tarefa e os caminhos antes de começar;
- faça commit apenas dos arquivos que você alterou (`git add <caminho>`), nunca
  `git add -A`, `git add .` ou `git commit -a`;
- não use `git checkout --`, `git restore`, `git stash`, `git reset` ou
  `git clean` em arquivos de outro agente, nem reescreva histórico;
- `certify`, `test:e2e`, `sbom`, `licenses:check` e mudanças no lockfile só com
  claim próprio; push só com autorização do usuário.

Fonte operacional completa: `docs/07_agents/AGENTS.md`.
