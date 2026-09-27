Estado corrente AUD52: o gate C1L parou com exit 64 no candidate freeze por drift em `docs/02_spec/0190_spec_validation.md`. Não houve candidate nem testes de produto; veja o [resultado C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md). C1J/C1K permanecem históricos; M07-S1 `FAIL / OPEN`, S2/S3/S4 e M05 bloqueadas.

`A24-03-C1L-GATE` terminou `FINISHED / STOP / FAIL`; o preview C1L foi aplicado aos três paths permitidos e o candidate freeze parou antes de criar candidate. O desvio de baseline em `docs/02_spec/0190_spec_validation.md` está fora do allowlist, então a correção e os testes não foram executados. Próximo passo técnico: packet separado de atualização/reconciliação de baseline, seguido de gate hash-bound. M07-S2/S3/S4 e M05 permanecem bloqueadas.

## Histórico AUD45 — C1J packet preparado; decisão humana pendente

## Histórico AUD44 — C1I terminou antes do candidate — 24/09/2026

## Histórico AUD43 — Packet C1I preparado antes da decisão — 24/09/2026

Estado: M07-S1 permanece `FAIL / OPEN`; C1H terminou `candidate-freeze` exit 64 sem candidate e o Gauntlet foi formalmente encerrado `FINISHED / STOP / FAIL`. C1F (`89e4d30ce8b2fd1d102a200bc729249a99ebc47499e4d04a79cd7f6633890f1a`) continua o último candidate real. C1I foi preparado e passou validação estática; aguarda decisão humana no pedido SHA-256 `86bc71b2bf7dac7f500a3dbb8a942e5d4cbeb9d6638ac43bf9dd65d923b1af57`. Produção `NO_GO`.

## Resultado C1H preservado

C1H encontrou dois tuples R1 stale: `docs/02_spec/0190_spec_validation.md` e `docs/07_agents/AGENTS.md`. Candidate freeze rejeitou o baseline, nenhum candidate ou check posterior foi produzido e a tentativa não pode ser repetida sob o mesmo gate. Ver [resultado C1H](../04_audit/evidence/AUD-20260924/M07-S1-C1H/final-gate-result.md), [quality bar](../04_audit/evidence/AUD-20260924/M07-S1-C1H/quality-bar-results.json), [command records](../04_audit/evidence/AUD-20260924/M07-S1-C1H/command-records.json) e verificação final do Gauntlet arquivada (`.gauntlet-archive/m07-s1-c1h-20260924-finished-fail/c1h-final-verification.json`, fora do versionamento desde a PR-004; SHA-256 no [manifesto Gauntlet](../04_audit/evidence/AUD-20260926/gauntlet-state-manifest.json)).

## Packet C1I proposto

- [Approval request C1I](../04_audit/evidence/AUD-20260924/M07-S1-C1I/approval-request.md), SHA-256 `86bc71b2bf7dac7f500a3dbb8a942e5d4cbeb9d6638ac43bf9dd65d923b1af57`.
- [Validação estática](../04_audit/evidence/AUD-20260924/M07-S1-C1I/packet-validation.json) passou; nenhum patch, candidate, teste, typecheck, lint ou coverage C1I foi executado.
- O baseline C1I proposto tem 973 inputs e atualiza somente os hashes/tamanhos de 0190 e AGENTS; R1 e C1H ficam preservados. O patch limita futuras edições a policy, scanner e teste do scanner; o fixture conversacional permanece snapshot-only.
- O plano inclui 36 comandos locais capturados, archive e verificação íntegra do Gauntlet C1H, matriz de testes/coverage e reviewers I1/Final Critic separados. Qualquer falha ou reviewer indisponível mantém S1 `FAIL / OPEN`.

## Próxima decisão

1. Aprovar ou pedir correções ao pedido C1I pelo SHA completo acima. A aprovação C1H não é transferível.
2. Se aprovado, registrar a resposta no decision record antes de executar somente o plano C1I. Uma falha interrompe dependências e exige novo gate para outra tentativa.
3. A aprovação não aceita M07-S1, não autoriza S2/S3/S4 ou M05, mantém G21-5/G21-6 fechados e não libera produção.

## Histórico AUD42 — Resultado C1H e plano pré-C1I

## Resultado C1H — candidate freeze rejeitou baseline stale

O usuário aprovou o [pedido C1H](../04_audit/evidence/AUD-20260924/M07-S1-C1H/approval-request.md), SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`; a decisão foi registrada antes da execução. O command plan parou em `candidate-freeze` com exit 64 porque `docs/02_spec/0190_spec_validation.md` e `docs/07_agents/AGENTS.md` divergem dos hashes do baseline R1. Veja [resultado](../04_audit/evidence/AUD-20260924/M07-S1-C1H/final-gate-result.md), [quality bar results](../04_audit/evidence/AUD-20260924/M07-S1-C1H/quality-bar-results.json) e [command records](../04_audit/evidence/AUD-20260924/M07-S1-C1H/command-records.json). Nenhum candidate ou teste posterior foi produzido.

Escopo de produto: `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js`; o fixture conversacional permanece somente para snapshot. O helper C1H corrige uma linha da raiz do processo e o command plan usa um novo diretório de evidência C1H. Outputs permitidos: somente `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/`, `.gauntlet/` novo e o archive C1F no alvo exato descrito no gate, após passar as precondições. A matriz local, thresholds 90/85/90/90, I1 e Final Critic separados estão no packet.

## Próxima etapa

1. Preservar R1 e C1H como evidência histórica imutável; não rerodar C1H.
2. Preparar um packet documental novo para aceitar, por path e hash allowlisted, os dois inputs de governança modificados depois de R1. Manter o fingerprint original como histórico; não sobrescrevê-lo.
3. Congelar patch/plan, novo baseline vinculado aos bytes correntes, snapshots e stop rules, depois pedir uma decisão humana separada com SHA integral.
4. Até nova aprovação, não aplicar outro patch nem executar freeze, inventory ou checks downstream. S1 continua aberta; S2/S3/S4 e M05 bloqueadas; G21-5/G21-6 fechados; produção `NO_GO`.

## AUD36 — Packet C1H anterior à decisão e à execução

O pacote e o pedido C1H originais permanecem hash-bound e preservados. A decisão e o resultado real atual são registrados no [C1H decision record](../04_audit/evidence/AUD-20260924/M07-S1-C1H/decision-record.md) e no resultado linkado acima.

## Histórico C1/C1E

Estado: `WAITING_HUMAN_APPROVAL` para C1E; M07-S1 `FAIL / OPEN`; I1 `UNAVAILABLE`; produção `NO_GO`. Fonte factual: [resultado C1 interrompido](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/final-gate-result.md). O gate C1 original foi aprovado e seu fixture corrigido, mas o freeze do candidate encerrou com exit 64.

### Decisão anterior C1

O [gate C1](../04_audit/evidence/AUD-20260923/M07-S1-R1/correction-gate-proposal.md), SHA-256 `9d865f7db78b479dacaf69ca2de7dffcc03892eff061dd49ca90ec2035eb83f1`, foi aprovado pelo usuário com “aprovo este gate”. O preview vinculado tinha SHA-256 `9d7fc894b728967aaa4f0949bc5dc8ae466d31ecc616fe9a902a58859ebb0c17`. A aprovação autorizou o único fixture e a matriz C1. O fixture foi corrigido conforme o preview e seu snapshot foi preservado.

### Resultado da tentativa C1

O preflight Node `v22.23.2`/TypeScript `6.0.3`, verificação do candidato R1 e ausência inicial do diretório C1 passaram. O scanner recusou `M07-S1-R1-C1` no passo de freeze porque o allowlist de `validateOutputPath` aceita apenas `M07-BUILD-S1` e `M07-S1-R1`. Leitura estática adicional identificou que o candidate validator e a policy também fixam o registro npm em `M07-S1-R1/npm-version.txt`, enquanto o gate C1 exige arquivo sob a pasta C1.

Não houve candidate C1, inventário, comparação, testes, typecheck, lint, coverage, pós-check ou I1. A tentativa e os logs permanecem em [M07-S1-R1-C1](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/).

### Decisão pendente à época — C1E

O próximo gate é [M07-S1-R1-C1E](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-gate.md), SHA-256 `75b6307384074660bde873ca4aa95bfedfb52c1f58d2448ad227e96e87ad34cc`, com [preview](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-preview.md), SHA-256 `3c4b80ad07a1bf59cce8279b40e916140c908b5d7f7a518caf1d0362e57100ec`.

O preview autoriza, se aprovado, somente `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js` para adicionar o diretório C1E e o path npm candidate-bound, mantendo traversal/symlink controls e testando a rejeição de nome não aprovado. A tentativa ocorrerá em novo diretório `M07-S1-R1-C1E`; a pasta C1 original não será reutilizada.

### Handoff histórico condicionado a C1E

1. Sem aprovação do SHA C1E, nenhum scanner/config/teste do scanner ou check posterior C1 será executado.
2. Após aprovação, registrar A24-03-C1E em [0344](0344_reaudit_m07_backlog.md), criar snapshots dos três paths autorizados e aplicar somente o preview.
3. Congelar 977 inputs candidate-bound, executar inventário e a matriz autorizada sob Node `v22.23.2`, capturando logs/exits/durações/skips. Thresholds permanecem 90/85/90/90.
4. Solicitar I1 fresh-context para o mesmo candidato. Se indisponível, registrar `UNAVAILABLE` e manter S1 `FAIL / OPEN`.
5. Atualizar evidências, roadmap/backlogs, execution log e runtime state na ordem definida; M07-S2/S3/S4 e M05 seguem bloqueados. G21-5/G21-6 continuam fechados e produção `NO_GO`.
