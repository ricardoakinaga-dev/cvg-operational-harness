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

| #   | Condição                                                                                                                                 | Como se verifica                                                                                                                                              | Estado em 06/10/2026                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Conformidade com o dsh.** As invariantes I1–I12 da SPEC 0181 valem no kernel.                                                          | `tests/conformance/` verde, sem nenhum `it.fails` restante.                                                                                                   | ⚠️ kernel, single-pass e iterativo cumprem I1–I12; restam 2 lacunas no `GovernedAgentRuntime` (KPLG-004 parte B)                     |
| 2   | **Suítes verdes.** Testes do monorepo e de PostgreSQL passam; skips existentes têm justificativa registrada.                             | `npm test` e `npm run test:postgres` com PostgreSQL efetivo; typecheck e lint.                                                                                | ✅ em `a7dd030` (2.646 PASS / 1 skip; PG 288 PASS)                                                                                   |
| 3   | **Pilha real em modo produção.** API e worker com `NODE_ENV=production`, PostgreSQL com RLS e papéis de migração e de runtime separados. | Smoke registrado: `/live` e `/ready`, webhook assinado aceito e replay recusado após reinício, aprovação ponta a ponta com um efeito só, reuso sem duplicata. | ⚠️ validado em 04/10 (0371); repetir no kernel novo                                                                                  |
| 4   | **Operadores conseguem entrar.** API em `CVG_IDENTITY_MODE=trusted` atende rotas protegidas com sessão.                                  | Login e rota protegida respondendo 200; sem sessão, 401.                                                                                                      | ❌ ENG-014 (503 em toda rota protegida; frente do Codex)                                                                             |
| 5   | **CI remoto verde no mesmo commit.** Testes, typecheck, lint, CodeQL sem alerta high aberto, `secret-scan`; proteção do `main`.          | Execução do workflow ligada ao SHA candidato; regra de proteção ativa.                                                                                        | ❌ última verificação (28/09): CodeQL high e `secret-scan` falhando; sem proteção do `main`; commit não publicado                    |
| 6   | **Segredos e dependências.** Nenhum segredo no código nem na imagem; sem vulnerabilidade high/critical em produção.                      | Varredura de segredos no CI; `npm audit --omit=dev`.                                                                                                          | ⚠️ `npm audit` 0 vulnerabilidades; varredura depende da condição 5                                                                   |
| 7   | **Imagem endurecida.** Processo não-root, disco somente leitura com volumes explícitos, sem shell no runtime.                            | Inspeção da imagem e execução com `read_only` e `cap_drop: ALL`.                                                                                              | ⚠️ não-root e somente leitura provados em 03/10 (HISO-007); a base `bookworm-slim` ainda tem shell                                   |
| 8   | **Backup testado.** Backup do PostgreSQL restaurado com a cadeia de auditoria íntegra.                                                   | Um restore feito e registrado, com a verificação da cadeia passando.                                                                                          | ❌ não executado no candidato                                                                                                        |
| 9   | **Alguém sabe quando quebra.** Alerta se o worker parar ou a fila deixar de progredir.                                                   | Parada induzida com alerta recebido num receptor de teste.                                                                                                    | ❌ sem alerta de parada ou de fila parada                                                                                            |
| 10  | **Botão de desligar.** Pausa do kernel em um passo, sem perder pendências, e retomada.                                                   | Teste de pausa durante turno (C12) e de retomada.                                                                                                             | ⚠️ pausa no kernel, no single-pass e no iterativo (C12); falta no kernel durável do worker (KPLG-004 parte B) e o ensaio em operação |

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
