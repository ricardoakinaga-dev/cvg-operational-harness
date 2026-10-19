# SPEC0237 — pacote de decisão para BUILD local

Estado: revisão documental final APPROVE_SPEC, zero achados obrigatórios; [checksT1 concluídos](document-checks-final.json). Nenhuma decisão humana registrada para0237.

## Decisão concreta proposta

Revisar o [contrato SPEC0237](../../../02_spec/0237_b6_runtime_resolution_profile.md), SHA-256 `81f091fa8edaf3ce89543773e24960b4dc9feff3de15f6552940192e9f1ef5f1`, para autorizar somente o BUILD local futuro `HISO005-P2-BUILD-0237` em candidata isolada. Esta decisão é distinta da0236 já aprovada.

O delta propõe aquisição Linux por descritores ancorados, links diretos de workspace com gramática byteexata e seleção finita de owner/exports condicionais conforme Node22.23.2 pinado. Alvos selecionados ainda precisam da prova semântica K0–K7; resolução correta não prova o corpo. Módulos nativos continuam UNKNOWN antes de owner/self-reference/pacotes; casos não modelados continuam UNKNOWN e produto conhecido continua FAIL.

## Evidência e limites

- [Baseline corrente reconciliada](current-baseline-reconciliation.json): candidataD8 qualificada e dois paths integrados localmente; B6 INCOMPLETE2258=537baseline+1721novos,303MATCH/zeroverified/zeroresolvidos. O checkout misturado não recebe essa certificação.
- [Primeira revisão](review-r1/REPORT.md): três achados obrigatórios, preservados. [Resposta documental](r1-response-draft.json) e [contrato da revisão final](review-r2-contract.json). [Parecer final R2](review-r2/REPORT.md): APPROVE_SPEC, zero obrigatórios; os três achadosR1 tratados no HOW. Revisão estática, sem execução dos aceites futuros.
- TodosRS01–14 de BUILD permanecem NOT_RUN. Não houve código0237, novo teste de aplicação, oracle, gate de certificação ou execução de alvo nesta preparação. A revisão documental não valida implementação futura.

## Condições da execução futura

Após decisão explícita para este SHA: registrar autoridade/task/claim e candidata; reconciliar baseline atual; implementar somente helper interno/resolução/engine/checker/testes previstos; preservar controles e recusas; congelar fonte para revisão independente e16gates Node22/verificador corrente, consumidor e nova medição integral. Cada referência compilada precisa da raiz física/inputprojeção correspondente. Sem transferir certificadosD8/75df ou resumir desconhecidos como prova.

Sem mudança de produto/runtime/API pública/lock/schema, provider, dado real, ação clínica/financeira/de agenda real, push/deploy/produção ou aceiteB6 por associação. Uma aprovação deste BUILD local não concede release.

## Por que há decisão própria

[D-12/T3](../../../07_agents/AGENTS.md) exige “T2 + revisão explícita da SPEC pelo usuário antes do BUILD” para segurança/identidade/policy. A [seção5 da0236](../../../02_spec/0236_b6_semantic_boundary_proof.md) conserva a autoridade existente para correções negativas, mas exige delta explícito para novas regras positivas.0237 acrescenta essas regras. A preparação documental e o fechamento do pacote sãoT1 já autorizados.

## Clarificação dos controles futuros — R2-O1/P3

A sugestão não bloqueante do revisor esclarece a notação resumida de RS06: usar literais separados `module`, `fs`, `fs/promises`, `node:fs` e `node:test` nos controles nativos. O subpath é `fs/promises`. A grafia `fs-promises` não deve ser cadastrada como nativo por convenção; os nomes ordinários `test` e `fs-promises` passam somente pelo resultado exato de `isBuiltin` e pelas regras comuns aplicáveis. Cobrir import/require e self-reference homônima, mantendo controles positivos ordinários com closure K0–K7. Esta anotação de planejamento não altera a SPEC congelada nem concede nova regra positiva.
