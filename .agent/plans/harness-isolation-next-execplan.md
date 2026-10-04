# NEXT-D1/NEXT-D2 — ciclo autorizado — 04/10/2026

## Purpose / Big Picture

Executar a concessão explícita do usuário para corrigir C1 e PV10 em novas cópias isoladas, com um ciclo de implementação e uma revisão nova por frente. Fonte técnica: `docs/08_runtime/handoffs/harness_isolation_weekly_decision_20261004.md`, SHA-256 aprovado `602d8f6957804a4361206bd68a3ac64cd834d5a2b8b30f6e86e3d15f4fa7934e`. Contratos T3 0179/0180 já aprovados e byte-preservados; NO_MODEL/D2 aberta e os 24 critérios originais continuam exigidos.

## Progress

- [x] Pedido, packet, skills, constituição, coordenação, ledgers e artefatos R2 recuperados; claim antes de novas escritas.
- [x] Concessão explícita preservada em `next-exec-20261004/human-cycle-approval.json`.
- [ ] Congelar baseline e barra; demonstrar controle conhecido ruim antes das alterações.
- [ ] C1: propagação/recusa de bindings aninhados, positivos e 14 históricos + 11 negativos R2.
- [ ] PV10: estados finais duráveis sem perder registro bruto NO_MODEL; transientes/erro/reopen/replay/SIGKILL.
- [ ] Gates locais por frente e integração Node 22/PG/E2E/neutro, com inventário da baseline.
- [ ] Uma crítica nova por frente, sem contexto herdado, artefato congelado e sentinel antes/depois.
- [ ] Confrontar os reprodutores/manifestos dos críticos; aplicar a decisão sem ciclo adicional automático.
- [ ] Avaliar R2-D3 somente com todas as condições; preservar fontes alheias se ownership não liberado.
- [ ] Evidências compactas e handoff/backlogs próprios; ledgers via owner quando livres; commits locais por caminho, sem push.

## Decision Log

04/10/2026 — Ricardo concedeu NEXT-D1/NEXT-D2 literalmente conforme o packet, um ciclo e uma revisão nova por frente. A autorização é específica e substitui o bloqueio de orçamento dessas frentes, sem dispensar aceites. Não usar o estado bloqueado histórico do goal como negação dessa mensagem nova. Não fabricar uma API de retomada do goal; a ferramenta disponível só muda status terminal.

## Context and Orientation

Scratch: `/home/ricardo/.cache/cvg-harness-next-exec-20261004`. Lead possui C1 (`scripts/check-product-boundary.mjs`, `tests/product-boundary.test.js`) e integração. Builder único possui PV10 (`products/shift-assistant/src/assistant.ts`, `organizer.ts` somente se necessário ao NO_MODEL explícito, testes de confiabilidade). Schema, journal, contratos e arquivos comuns permanecem congelados. Builders e críticos sem descendentes; no máximo dois agentes simultâneos; crítico nunca é o Builder.

## Plan of Work

Copiar as fontes R2 sem `.git/.gauntlet`; os arquivos anteriores continuam leitura. Capturar hashes antes de BUILD e provar os defeitos com fixtures existentes. Builder PV10 trabalha em paralelo à correção C1 do Lead; Lead não edita a lane ativa. Usar as transições duráveis existentes, preservando asserções originais, raw e zero modelo clínico. Congelar cada fonte após verificações focais; preparar packets sem racional/histórico/ledgers/coordenação e com inventários exatos dos controles. Uma revisão por frente; eventual rejeição encerra o ciclo sem nova correção.

## Concrete Steps

Node `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`. PG exclusivo em 55597, container `cvg-hiso-next-pg`, label com este claim; API 3257/web 4257 no E2E. Captures e logs somente em scratch, comandos com cwd/exit/SHA-256 e sentinels. Gates PG serializados. Nunca usar portas/volumes 3400/3401. Nunca alterar lockfile Root, limpar checkout, restaurar arquivos alheios, empilhar commits com arquivos de terceiros ou executar provider/dados reais.

## Validation and Acceptance

C1 recusa todos os 25 negativos acumulados e preserva positivos, resolução física de runtime/tipos e API/CLI. Propagação estática demonstra os casos conhecidos; closure/anchor/computed/rest/default/escape indeterminados devolvem INCOMPLETE. Scan instalado não vira PASS por declaração e HISO-005 não vira DONE enquanto o aceite amplo não estiver comprovado.

PV10: erro permanente termina review_required com fonte/erro/attempt/stage/draftAt no reopen, zero tarefas/retry automático; transiente termina após cinco tentativas, backoff durável e reinício real no estágio. Registro bruto NO_MODEL funciona no bundle público sem transmitir CLINICAL; negação arbitrária de organizer não vira êxito silencioso. Todas PV01–PV14, 37 situações originais e 40 casos de fundação são obrigatórios; nenhum relaxamento de assert.

Regressões: typecheck/lint/build público/smoke, full Node 22 com PostgreSQL, PG dedicado, E2E zero retries e variante sem products. Não somar suites sobrepostas. Comparar identidade dos testes com a baseline histórica, não apenas números. Os quatro arquivos/23 casos alheios só são incorporados depois de liberação/ownership; enquanto isso a condição noLostTests permanece não satisfeita e impede promoção.

## Idempotence and Recovery

Destinos novos recusam sobrescrita; preservar primeiro failure e logs. Só repetir comando após mecanismo identificado de falha de preparação/transiente ou alteração coerente antes do freeze; nenhuma nova rodada para obter verde depois de crítico. Aprovações de SPEC anteriores não são pedidas novamente. Ledgers compartilhados dirty esperam owner AP-LOCAL-20261001/Codex; continuidade vai ao handoff próprio até liberação.

## Outcomes / Remaining Work

IN_PROGRESS. Resultado final depende de execução e das duas críticas. Sucesso local não conclui o objetivo integral nem autoriza piloto/produção. Próximo passo ativo: baseline, C1 e PV10 nas cópias novas.
