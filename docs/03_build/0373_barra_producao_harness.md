# 0373 — Barra proporcional de produção do Operational Harness

- Data: 06/10/2026. Task: `KERNEL-PLUGINS-20261006` (Claude Code).
- Status: `APPROVED` pelo usuário em 06/10/2026. Tipo escolhido pelo usuário
  em 06/10/2026: **proporcional**, como a
  [0368](0368_barra_proporcional_assistente_de_plantao.md), mas para o núcleo.
- Fontes: [ADR-011](../architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md),
  [auditoria 0596](../04_audit/0596_auditoria_motor_direcao_plugins_2026-10-06.md),
  [roteiro 0372](0372_kernel_plugins_roadmap.md) e
  [backlog do motor 0371](0371_engine_production_backlog.md).
- Escopo: o núcleo (kernel, plugins de controle, API e worker). Esta barra
  **não libera nenhum produto**: cada agente (Assistente de Plantão e os
  futuros) continua com a sua própria barra, e dado real ou provider externo só
  entra pela barra do produto.

O harness está pronto para produção quando as 10 condições abaixo forem
verificadas **no mesmo commit e na mesma imagem**. Cada condição é revista
quando algo relevante muda.

| #   | Condição                                                                                                                                 | Como se verifica                                                                                                                                              | Estado (PROD-0373, 06/10/2026)                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Conformidade com o dsh.** As invariantes I1–I12 da SPEC 0181 valem no kernel.                                                          | `tests/conformance/` verde, sem nenhum `it.fails` restante.                                                                                                   | ✅ `tests/conformance/` sem `it.fails`: I6/I7 e pausa I12 no `GovernedAgentRuntime` (PROD-0373, [resumo](../04_audit/evidence/PROD-0373-20261006/summary.md))    |
| 2   | **Suítes verdes.** Testes do monorepo e de PostgreSQL passam; skips existentes têm justificativa registrada.                             | `npm test` e `npm run test:postgres` com PostgreSQL efetivo; typecheck e lint.                                                                                | ✅ local: 358 arquivos/2.925 PASS, zero skips e `it.fails`; PostgreSQL 296 PASS; typecheck/lint (PROD-0373). Repetir no SHA publicado (condição 5)               |
| 3   | **Pilha real em modo produção.** API e worker com `NODE_ENV=production`, PostgreSQL com RLS e papéis de migração e de runtime separados. | Smoke registrado: `/live` e `/ready`, webhook assinado aceito e replay recusado após reinício, aprovação ponta a ponta com um efeito só, reuso sem duplicata. | ✅ smoke 16/16 na imagem endurecida, API e worker em produção ([smoke](../04_audit/evidence/PROD-0373-20261006/production-stack-smoke.json))                     |
| 4   | **Operadores conseguem entrar.** API em `CVG_IDENTITY_MODE=trusted` atende rotas protegidas com sessão.                                  | Login e rota protegida respondendo 200; sem sessão, 401.                                                                                                      | ✅ store de sessão PostgreSQL composto em produção: login 200, rota protegida 200, sem sessão 401 (smoke e teste PG)                                             |
| 5   | **CI remoto verde no mesmo commit.** Testes, typecheck, lint, CodeQL sem alerta high aberto, `secret-scan`; proteção do `main`.          | Execução do workflow ligada ao SHA candidato; regra de proteção ativa.                                                                                        | ⏳ CodeQL: config exclui evidências, ativos corrigidos, #6/#7 dispensados; falta push, CI verde e proteção do `main`                                             |
| 6   | **Segredos e dependências.** Nenhum segredo no código nem na imagem; sem vulnerabilidade high/critical em produção.                      | Varredura de segredos no CI; `npm audit --omit=dev`.                                                                                                          | ✅ `npm audit` 0 (completo e produção); gitleaks na imagem 0 achados ([inspeção](../04_audit/evidence/PROD-0373-20261006/image-inspection.json))                 |
| 7   | **Imagem endurecida.** Processo não-root, disco somente leitura com volumes explícitos, sem shell no runtime.                            | Inspeção da imagem e execução com `read_only` e `cap_drop: ALL`.                                                                                              | ✅ distroless sem shell, `cvg`, `--read-only --cap-drop ALL`, worker na mesma imagem ([inspeção](../04_audit/evidence/PROD-0373-20261006/image-inspection.json)) |
| 8   | **Backup testado.** Backup do PostgreSQL restaurado com a cadeia de auditoria íntegra.                                                   | Um restore feito e registrado, com a verificação da cadeia passando.                                                                                          | ✅ `pg_dump`/`pg_restore` com cadeia do kernel íntegra e adulteração detectada ([prova](../04_audit/evidence/PROD-0373-20261006/restore-audit-chain.json))       |
| 9   | **Alguém sabe quando quebra.** Alerta se o worker parar ou a fila deixar de progredir.                                                   | Parada induzida com alerta recebido num receptor de teste.                                                                                                    | ✅ heartbeat e fila no banco; alerta assinado recebido com worker parado (teste PG e smoke). Limiares e destino reais: decisão de operação                       |
| 10  | **Botão de desligar.** Pausa do kernel em um passo, sem perder pendências, e retomada.                                                   | Teste de pausa durante turno (C12) e de retomada.                                                                                                             | ✅ pausa durável no worker e no kernel durável, sem perder pendências, e retomada (C12, teste PG, smoke e `ops-kernel-pause`)                                    |

## O que deixa de ser exigido para começar

Certificação com 16 gates, as 13 condições do
[0354](0354_production_executive_plan_2026-09-26.md), rodadas múltiplas de crítica
independente por mudança, pentest externo, PITR com RPO/RTO formal, on-call
escalonado e IdP corporativo com MFA.

Esses itens voltam a ser avaliados se o harness passar a atender outra
organização, se a API abrir para a internet ou se algum agente passar a
escrever no HIS.

## Regra de processo

Uma revisão por mudança. Evidência pequena: resumo e logs compactados, fora dos
arquivos de documentação vivos. O resultado de cada condição é registrado nesta
tabela, com link para a evidência.
