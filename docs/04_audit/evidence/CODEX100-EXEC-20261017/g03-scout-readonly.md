<!-- Rendered copy with portable links; verbatim original: g03-scout-readonly.raw.txt -->

**DX100-G03: não há evidência suficiente para considerar os reusos de Q01/K01 integrados e qualificados.** Existem implementações e aprovações locais aproveitáveis, com escopos restritos.

Leitura em **17/10/2026, 19:19:22–19:20:35 −03**, HEAD `7ecc5b53944dcbc50fc26a95cfaec05bb1c62eb5`, mantido durante a inspeção. Alterações concorrentes preservadas. Nenhuma escrita, teste, build, serviço, rede ou descendente; worktrees não foram inspecionadas diretamente. Resultados executados abaixo são **registros de terceiros lidos**, não execuções deste scout.

**1) Pré-requisitos da fronteira inicial**

Dono significa ownership canônico observado; não atribuição nova pelo scout.

| Pré-requisito                   | Dono / paths                                                                                     | Estado e prova localizada                                                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gates DX100-G01–G04             | Lead CODEX100; `0386`, futuros Discovery/PRD/SPEC                                                | Snapshot: G01 `READY`, G02/G03/G04 `TODO`. G04 depende G02/G03 e exige pacote concreto antes do BUILD. G01/G02 não foram reinvestigados. [0386:64]                                                                                                                     |
| PAR-G01                         | PARE100/Codex; candidata PARE100, composição/migration0029                                       | `TODO`. Texto sobre trabalho exclusivamente não commitado está superado pelo registro de commit `a72422be`; isso não demonstra integração/qualificação. [0380:98], [99:37]                                                                                             |
| PAR-Q03                         | CLAUDE100-EXEC, task `PAR-Q03-KIT-001`; `tests/support/governed-test-kit/**` e três consumidores | Carteira `TODO`; SPEC0230 T2 e candidata reservadas. Evidência localizada fixa inputs, sem recibo TK01–TK08 concluído. Kit integrado/qualificado ainda não demonstrado. [0230:13], [inputs:2]                                                                          |
| PAR-Q04                         | PAR/P100-004; servidor privado de falhas ainda a delimitar                                       | `TODO`; adapters/falhas roteirizadas não demonstram servidor HTTP reutilizável e record/refresh. Depende Q03. [0380:134]                                                                                                                                               |
| PAR-K01                         | PARE100/Codex; API/worker/plataforma/persistência                                                | `IN_PROGRESS`. 0217 autoriza fatia publicada PostgreSQL **opt-in sintética**, sem migração integral dos consumidores. O worker atual ainda documenta kernel opt-in. Conformidade completa dos três modos não demonstrada. [autoridade0217:10], [worker:79], [0380:172] |
| PAR-K03                         | PARE100/Codex; harness/orchestrator/contracts/persistence                                        | `IN_PROGRESS`. Aceite R19 é **RESPONSE nativa em memória**: registra 36 focais, 1.012 regressões passadas e 126 puladas. Exclui PostgreSQL completo, consumidor publicado, integração root e aceite global. [R19:10], [R19:27]                                         |
| PAR-S01                         | PAR/persistência; `packages/persistence/src/session-events.ts`, migration0031 futura             | `TODO`. Store PostgreSQL existe; ownership entre processos, recusa de writer antigo e API completa da fatia ainda não demonstrados. 0221 aprovada **com ajustes**. [store:25], [0380:349]                                                                              |
| PAR-X01                         | PAR/subprocessos; `packages/sandbox/**` e consumidores                                           | `TODO`. `runContained` usa bwrap e timeout, mas o `spawn` observado não recebe allowlist explícita de ambiente. Não prova serviço único nem encerramento completo da árvore. [run:114], [0380:253]                                                                     |
| PAR-X02, transitivo de X04      | PAR/segurança nativa; sandbox/helper futuro                                                      | `TODO`. Landlock é inferido da versão do kernel; não é prova de syscall/ruleset aplicado. Bloqueio transitivo concreto de Q01. [capabilities:26], [0380:262]                                                                                                           |
| PAR-X04                         | PAR/sandbox e persistência futura                                                                | `TODO`. Modos/journal existentes não demonstram política persistida por sessão nem enforcement factual por efeito. Depende X02. [0380:280]                                                                                                                             |
| PAR-K02, adicional de DX100-K01 | PAR/legado; exports, hosts, workspaces/lock                                                      | `TODO`; remoção só depois de K01. Não há prova localizada de empacotamento sem legado. [0380:181]                                                                                                                                                                      |
| PAR-K04, adicional de DX100-K01 | PAR/capabilities; registries/boundary                                                            | `IN_PROGRESS`; boot/dispose não equivalem a gerações, leases e quiescência. 0222 aprovada com ajustes, ainda sem entrega qualificada localizada. [0380:199], [decisões:37]                                                                                             |

O DAG confirma **sete PAR diretos em Q01** e acrescenta **K02/K04 em K01**. X02 é transitivo; **X03 não é dependência explícita dessa fronteira DX**, embora seja obrigatório no C100-Q01. Sua inclusão na primeira SPEC DX precisa ser deliberada, sem copiar automaticamente o gate Claude. [DAG:2907], [C100:159]

**2) SPECs, condições e gates humanos restantes**

- **Primeira jornada DX:** G04 ainda precisa entregar WHAT/equivalências, contratos, aceites e SPEC concreta. A reserva `0231` no claim não é aprovação. K01 é T3; Q01 admite T2/T3 conforme contrato do kit. Mudanças em segurança, approval ou contrato público exigem revisão humana explícita antes do BUILD. [0386:80], [coordenação:4]
- **0221/0222/0225 não aguardam simplesmente nova aprovação humana.** O registro de 16/10 permite aplicar **somente os ajustes enumerados**, depois revisão técnica independente, sem novo gate humano. Ampliação exige novo T3. Condições relevantes:
  - 0221: primeira API/ownership reduzidos, provas de dois processos/tenant/writer antigo, migration **0031**, limites de writers e restrição a PgBouncer transaction.
  - 0222: gerações/lease/troca/quiescência reduzidas; definir relação entre registries e conferir colisão com 0223.
  - 0225: corte exclusivo; teto menor ou medido; retirar J14/J15 do primeiro BUILD; migration **0030**.  
    As fontes ainda evidenciam descompasso: 0221 propõe0030 e 0225 conserva8MiB/J14/J15. [decisões:5], [0221:156], [0225:147]
- **0220 está adiada:** qualificação corrente proposta como0227 precisa recomposição sem drift e pacote próprio. **0226 está adiada até0225 implementada**, seguida de reapresentação reduzida; não autoriza adoção publicada agora. [decisões:8], [decisões:65]
- **X01/X02/X04:** faltam contratos/SPECs T3 concretos e respectivos gates humanos para as capacidades novas; wrappers existentes não suprem isso.
- **B6/0228 já está aprovada**, hash `05fa3140…`, candidata `f11f762f…`. Registro corrente: revisão `APPROVE_SCOPED_DIFF`, 156 focais e 3.479 unitários passados, certificação ainda em curso. Não pedir novamente essa aprovação; também não transferir seu aceite para DX. A contenção mantém a fronteira `INCOMPLETE` e exclui redesenho de prova positiva. [B6-authority:2], [B6-state:15]

**3) Primeira fatia disjunta**

**Nenhum BUILD de runtime DX está liberado imediatamente pelos documentos lidos.** A próxima fatia de suporte nativo sem sobrepor0230 é **PAR-Q04: servidor HTTP sintético e gravação/replay de stream**, em diretório privado novo e candidata própria, com task/claim/SPEC curta T2.

Ela deve preservar os paths exclusivos0230 e os drivers DeepSeek/Claude, cobrir429/timeout/corte/JSON inválido e recusar record com credencial real. **A conclusão continua dependente do Q03 integrado/qualificado**; hoje cabe preparar essa unidade, sem declarar Q01 desbloqueado. Mudança pública ou de segurança sobe para T3. [0380:134], [0230:20]

A unidade antiga de hardening224 terminou `FAILED_REQUIRED_TH06`, após dois retrabalhos; seus50 testes verdes não autorizam reabertura nem substituem essa nova task. [closure:2]

**4) Riscos de `SHARED:C100` no DAG**

- **Estado proposto confundido com entrega:** os nós declaram `PROPOSED_TECHNICAL_SLICE_PENDING_G03` e `not_live_status:true`. Não permitem desconto de saldo nem BUILD. [DAG:1722]
- **Gate de origem omitido sem substituir suas obrigações:** `C100-S01` depende C100-Q01; a fatia compartilhada usa pré-requisitos PAR e DX100-G04. Isso só é válido após G03 delimitar os aceites técnicos reaproveitados e DX produzir prova própria. A eliminação da qualificação Claude inteira não elimina segurança, integração ou revisão. [C100:175], [DAG:2590], [0384:98]
- **Dupla contagem e colisão:** Q03 é um único trabalho sob CLAUDE100-EXEC; K01/K03 continuam PARE100; checker/manifests pertencem B6. Reuso não transfere ownership. [coordenação:9]
- **Desbloqueio inicial fictício:** Q01/K01 têm `shared_c100:[]`; portanto, aceitar qualquer nó SHARED posterior não satisfaz seus PAR pendentes. [DAG:79]

Hashes SHA-256 observados, em prefixos: `0386 eb76dc6ebf33`, `0380 00489d7b1c8f`, `plan-index 7de07b2858c8`, decisões `282c8e6be6ff`. SPEC0230: `c2931623c94f96422b4d1e5e43ebf6a73e844e2747f84d7279e76bc4d2af12ac`. Os quatro primeiros artefatos centrais rechecados —0386/0380/0230/plan-index— mantiveram seus hashes durante a leitura.

[0386:64]: ../../../03_build/0386_backlog_paridade_codex.md:64
[0386:80]: ../../../03_build/0386_backlog_paridade_codex.md:80
[0380:98]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:98
[0380:134]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:134
[0380:172]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:172
[0380:181]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:181
[0380:199]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:199
[0380:253]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:253
[0380:262]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:262
[0380:280]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:280
[0380:349]: ../../../03_build/0380_backlog_paridade_100_deepseek.md:349
[99:37]: ../../../99_runtime_state.md:37
[0230:13]: ../../../02_spec/0230_private_governed_test_kit.md:13
[0230:20]: ../../../02_spec/0230_private_governed_test_kit.md:20
[inputs:2]: ../CLAUDE100-EXEC-20261017/q03/candidate-inputs.json:2
[autoridade0217:10]: ../PARE100-EXEC-20261014/lead/t3-user-approval-0217.json:10
[worker:79]: ../../../../apps/worker/src/kernel-composition.ts:79
[R19:10]: ../PARE100-EXEC-20261014/spec0224-build/published-adapter-complete/response-repair/acceptance-r19.json:10
[R19:27]: ../PARE100-EXEC-20261014/spec0224-build/published-adapter-complete/response-repair/acceptance-r19.json:27
[store:25]: ../../../../packages/persistence/src/session-events.ts:25
[run:114]: ../../../../packages/sandbox/src/run.ts:114
[capabilities:26]: ../../../../packages/sandbox/src/capabilities.ts:26
[decisões:5]: ../USER-DECISIONS-20261016/spec-gates.json:5
[decisões:8]: ../USER-DECISIONS-20261016/spec-gates.json:8
[decisões:37]: ../USER-DECISIONS-20261016/spec-gates.json:37
[decisões:65]: ../USER-DECISIONS-20261016/spec-gates.json:65
[0221:156]: ../../../02_spec/0221_pare100_public_session_persistence.md:156
[0225:147]: ../../../02_spec/0225_pare100_complete_tool_result_journal.md:147
[coordenação:4]: ../../../08_runtime/agent_coordination.md:4
[coordenação:9]: ../../../08_runtime/agent_coordination.md:9
[B6-authority:2]: ../B6-0228-BUILD-20261017/authority.json:2
[B6-state:15]: ../B6-0228-BUILD-20261017/state.json:15
[closure:2]: ../PARE100-EXEC-20261014/test-resource-hardening-r1/contract/unit-closure.json:2
[DAG:79]: ../CODEX100-PLAN-20261017/plan-index.json:79
[DAG:1722]: ../CODEX100-PLAN-20261017/plan-index.json:1722
[DAG:2590]: ../CODEX100-PLAN-20261017/plan-index.json:2590
[DAG:2907]: ../CODEX100-PLAN-20261017/plan-index.json:2907
[C100:159]: ../../../03_build/0383_backlog_paridade_claude_code.md:159
[C100:175]: ../../../03_build/0383_backlog_paridade_claude_code.md:175
[0384:98]: ../../../03_build/0384_plano_executivo_paridade_codex.md:98
