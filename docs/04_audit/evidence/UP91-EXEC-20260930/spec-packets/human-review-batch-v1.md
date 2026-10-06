# Revisão humana T3 — sete módulos UP91 — lote1

**Candidato concreto, BUILD_NOT_AUTHORIZED, produção NO_GO.** Aceite I1 significa pronto para sua revisão. A decisão solicitada autoriza somente BUILD sintético dos módulos selecionados, preservando dependências, gates e limites. Não registra aprovação de012,0170, PRD/consumidor, providers/dados/efeitos reais ou release.

Fonte normativa é [human-review-batch-v1.json](human-review-batch-v1.json), contendo partes integrais selecionadas de cada SPEC e seus bindings; SHA-256 do pacote **`312d5e5d8a73a77f1dff385bbe988db551d4bfc93e93dce6abd9e75a66c58d85`**. Revisão modular pode aprovar/recusar itens separadamente pelo ID/hash. Conteúdo deste pacote fica congelado enquanto a decisão estiver pendente; metadados de solicitação serão registrados separadamente.

| Módulo   | Mudança concreta para BUILD sintético                                                                                                    | SHA-256 normativo                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| UP91-009 | Projeção de contexto/instruções com proveniência e limites até a chamada de decisão.                                                     | `086d39f6d7f3bb991a7538b2970aeec99981060cb7e1f36d008af0a13d9c9849` |
| UP91-010 | Carrier de segmentos: RESPOND direto ou intenção→compose→generate, guard de todos os bytes e efeito confirmado; zero reexecute.          | `27a34f27ff6a6a83d87c0f9c9c68ca016103def82fdca62c16459baf53ebaaa8` |
| UP91-011 | Budget por tentativa, routing/model/pricing pinados, microsUSD exatos, usageUNKNOWN, abort/deadline e reserva tardia.                    | `b177c53151157ef89174971c50847ffac7de8fd81f69105dfeae4d5ff965a9d6` |
| UP91-013 | Prompt aprovado/renderizado: hashes dos bytes efetivamente entregues, instruções separadas de dados.                                     | `ba2ff7545c88aa0a5b05b4a3ab894964d296147bf44477e19ce04a62ddd7632d` |
| UP91-014 | Approval ligado à execução e admissão transacional no journal existente, receipts originais imutáveis e digest do resultado reutilizado. | `5886b9ca132ad8766e9c040b4702d7f00880201675c67208486a72acb077efcd` |
| UP91-015 | Tenant/source/chunk/revision e renderer determinístico da resposta inteira; revogação impede publicação.                                 | `719d5561aa6ff288a2a4687ac49b220c73209d8990299ec1db2f4a8232c0bcce` |
| UP91-016 | Redação antes de sinks/read/export e checkpointV2 com refs/provas originais, validação de resultado e recovery sem novo efeito.          | `3aff5dbd5164126632b0a1a15a5943228ae3ea91af758e93b13671752861569a` |

## SPECs e provas de revisão

- [SPEC0166](../../../../02_spec/0166_governed_context_response_budget.md):009/010/011.
- [SPEC0167](../../../../02_spec/0167_policy_prompt_approval_knowledge_audit.md):013/014/015/016 e referências ao012 separado.
- [Parecer v3](../remaining-spec-review-v3.json), [parecer v4](../remaining-spec-review-v4.json) e [confirmação modular](../remaining-spec-review-v4-hash-confirmation.json).

D-12 em [AGENTS](../../../../07_agents/AGENTS.md): **“T2 + revisão explícita da SPEC pelo usuário antes do BUILD”**. Após decisão real: registrar sua autoridade/escopo/hash, conferir claims/fontes, implementar somente itens aprovados, executar Node22 typecheck/lint/unit/PG/E2E/certify e crítica do candidato integrado. Sem decisão, nenhuma implementação T3. Aceite isolado não remove dependências ou fecha cartão integral.

As três HIGH, skipgovernance, certifier e gates operacionais continuam pendentes nas trilhas próprias. Este lote não resolve essas falhas por declaração.
