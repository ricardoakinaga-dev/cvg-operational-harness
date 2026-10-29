# 0277 — F01: adoção do contrato existente de sandbox no descriptor

Estado: **PROPOSED_FOR_HUMAN_T3_REVIEW**. Task `AUD0625-SANDBOX-DISCOVERY-CODEX-20261028`, atribuição GBrain9520. Baseline exato `a69030d3fa3cc22eccfd7eb9e1cb2ae2c3df7867`, branch de origem `candidate/aud0625-wave-20261028`.

## Problema e contrato canônico

O [achado F01](../04_audit/0625_repository_score_audit_2026-10-28.md#f01--p1-a-fábrica-pública-perde-a-obrigação-de-sandbox) permanece reproduzível: o registro elimina `sandbox`, seu fingerprint não distingue WORKSPACE de PROCESS e a fábrica pública pode executar a capability sem chamar o gate. O corpo sintético desta reprodução não é uma ferramenta FS; portanto a recusa de FS sem handle introduzida pela0270 não mascara a normalização.

**O contrato de reparo já existe na [SPEC0222 §5.3](0222_pare100_managed_capability_lifecycle.md#53-preservação-de-sandbox-no-descriptor-autenticado).** Esta proposta é sua aplicação finita ao baseline atual, com reconciliação de propriedade; não cria outro catálogo, fingerprint, lifecycle, gate ou regra de normalização. A aprovação histórica da0222 não é revogada nem reaberta por este documento. O DF encaminhará a adoção desta fatia e sua composição concreta para revisão humana, conforme9520; nenhuma correção foi executada nesta fase.

## Escopo proposto de implementação

1. Conservar integralmente §5.3: ler propriedade própria de dados sem disparar accessor; recusar enum inválido; ausência/undefined/NONE canonizam para omissão, com os vetores antigos estáveis. Os demais quatro modos conservam o literal antes do hash e do registro.
2. Lista, resolução, clone e adapter executável devem entregar o mesmo descriptor autenticado ao pipeline nativo. Gate ausente, negado, indisponível, exceção e handle incompatível impedem o corpo; gate válido entrega somente seu handle validado.
3. A autenticação do catálogo e o owner gerenciado continuam na0222. Este recorte do registry legado não declara ML29, bootstrap/replace ou toda a fundação0222 concluídos.
4. Fingerprints dos descriptors não-NONE corrigidos devem mudar. Não reutilizar approvals, snapshots ou resultados reservados sob a composição que perdeu o modo. Vetores ausência/undefined/NONE permanecem iguais, sem inferir modo de sideEffect.

Paths previstos após aprovação/reconciliação: `packages/harness/src/capability-boundary.ts` e testes dessa fronteira. `packages/contracts/src/contracts.ts` já contém o campo e não requer alteração. O pipeline atual é o enforcement canônico; nenhum segundo controle em plugin é proposto. Build/exports compilados devem ser verificados junto ao consumidor real.

## Reconciliação e dependências

33E9 possui o port managed-tool-binding §5.2, com interseção física no arquivo, e seu claim exclui o bloco sandbox0222. A coordenação também relata uma preimagem privada do normalizer; não foi importada, revisada ou declarada aceita por esta sessão. Antes de BUILD, o integrador deve escolher os bytes de composição e obter ACK do titular, conservando seu helper e binding. Se o reparo já estiver aceito nessa composição, esta fatia vira verificação/adoção, sem reimplementação. Aviso GBrain9557 registra a consulta; silêncio não é ACK de código.

## Aceite e provas

| ID    | Resultado exigido no futuro BUILD                                                                   | Evidência desta fase                                    |
| ----- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| F01-A | Modo WORKSPACE permanece em descriptor/lista/resolução/adapter                                      | Teste de retenção RED                                   |
| F01-B | WORKSPACE e PROCESS produzem fingerprints distintos                                                 | Teste de fingerprint RED                                |
| F01-C | Fábrica pública via capabilities, gate ausente: UNSAFE_REQUEST e zero chamadas                      | Teste de fábrica RED; via tools é controle positivo     |
| F01-D | Todos os modos não-NONE, gates negado/indisponível/exceção/handle errado e permitido; NONE positivo | Critérios herdados de0222 §5.3; NOT_RUN neste recorte   |
| F01-E | Invalid enum/getter recusados; compatibilidade de ausência/undefined/NONE e bindings33E9            | Vetores atuais e composição a qualificar após aprovação |

Sonda: [aud0625-sandbox-authority-red.test.ts](../../tests/aud0625-sandbox-authority-red.test.ts). Usar o registry, a fábrica e o pipeline reais; controles sintéticos podem substituir somente portas externas. Remover `it.fails` quando houver correção aprovada e exigir os mesmos oráculos verdes. Não alterar expectativas para preservar o defeito.

## Qualificação, rollout e autoridade

Após aprovação: composição isolada, reconciliação33E9, focal/regressões de registry e ambos os perfis, tipos/lint e barra T3 atual (npmtest/PG/E2E/CI/proveniência conforme o integrador), sem herdar resultados. Mudança em hashes exige tratamento de compatibilidade descrito na0222. Se o rollout falhar, interromper adoção e manter NO_GO; voltar a perder o modo não é rollback promovível.

Esta proposta não altera contenção de SO, Landlock, filesystem ou subprocessos. F02/F05 e a fundação gerenciada permanecem independentes. Somente documentos e testes de defeito foram escritos; fonte de produção intacta. Próximo: DF revisar hashes e submeter a fatia ao Ricardo; depois registrar autoridade e task de BUILD com paths reconciliados.
