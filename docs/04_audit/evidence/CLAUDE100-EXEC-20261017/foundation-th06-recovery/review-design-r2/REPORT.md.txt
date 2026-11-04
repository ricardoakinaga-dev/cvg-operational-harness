**C100-FND-TH06-RECOVERY-001 — R2 terminal do desenho**

**APPROVE_RECOVERY_DESIGN — zero obrigatórios restantes no HOW.** Julgamento do [delta R2](../../../../../../../../../../tmp/cvg-claude100-exec-20261017/foundation-th06-recovery/review-design-r2/how-delta.source.txt) e dos dois findings R1, confrontado com [fonte settlement congelado](../../../../../../../../../../tmp/cvg-claude100-exec-20261017/foundation-th06-recovery/review-design-r2/inputs/10-complete-settlement-public-postgres.integration.ts.source.txt). Somente análise estática; nenhuma aplicação, alvo, teste, gate, PG, Docker, rede, instalação ou descendente.

| Finding | Decisão e contrato fechado |
| --- | --- |
| RD-01 | Fechado no desenho. `instrumentSql` (fonte 125–174): a seção R2 RD-01 do [plano](../../../../../../../../../../tmp/cvg-claude100-exec-20261017/foundation-th06-recovery/review-design-r2/inputs/00-plan.md.source.txt), linhas 38–42, trata sync/Promise/callback, combina erro SQL e diagnóstico por presença e entrega o callback uma vez. O combinador síncrono reutiliza a política existente; retorno e registros normais permanecem preservados. SQL-entry falho impede despacho antes de existir erro SQL. |
| RD-02 | Fechado no desenho. `createAttempt`/`joinDelivery`/`finish` (737, 1036–1108), `caseRun` (1213–1283) e `afterAll` (1308–1321): seção R2 RD-02, linhas 44–52, define registro global local, liberação de todos, espera de todos os runResult e depois de todos os joins. O latch sticky impede DB/end também no hook; rejeição nativa já concluída continua distinta de join não confirmado. |

São obrigações da implementação aprovada: controles extraídos da instrumentação real nas três formas de query; segundo ready/runtime retido após falha do corpo; todos os joins observados quando um rejeita; nenhum finish/DB/end dependente antes de confirmação; latch sobrevivendo até afterAll; primárias falsy, falha de summary e falha de end conservadas. As extensões de testes estão descritas no HOW; não foram executadas nesta rodada. As regras gerais anteriores sobre aquisição/transferência, asserções, payloads e runtime/policy permanecem vinculantes. Não há novo escopo de produto.

Hashes SHA-256 **antes = depois**:

- Plano: `bc6fec81bff5b46a43f59cce2d94d5489bf00f5c1b39c975feda4bc232631b19`.
- Task: `bbcfc91519ef433e4e8230c27e3e4f0e4816e5e2404e03e08f1ece7d4b437f37`.
- Design-inputs R2: `da1a527aec99400780ba8190eb6b430188d243669112ae4fe6eee32e7bcb29dc`.
- Fonte settlement: `7e76951c90cc25ca4082430d3cf072485f8b7a7133250aadce3288dfadeb1cd7`.

Sete fontes e sete protegidos continuam iguais aos hashes R1. Os três artefatos R1 conferem com os hashes da entrega anterior. Integridade completa: 26/26 inputs inalterados; eventual drift contextual está discriminado nos JSONs. [Antes](../../../../../../../../../../tmp/cvg-claude100-exec-20261017/foundation-th06-recovery/review-design-r2/before.json), [depois](../../../../../../../../../../tmp/cvg-claude100-exec-20261017/foundation-th06-recovery/review-design-r2/after.json), [resultado](result.json) e [manifesto](manifest.json) registram os hashes efetivamente lidos. Links relativos apontam para arquivos existentes, incluindo snapshots `.source.txt` no temporário autorizado.

O [claim local](../../../../../../../../../../tmp/cvg-claude100-exec-20261017/foundation-th06-recovery/review-design-r2/claim.json) foi registrado antes das escritas. R1 e a unidade histórica `FAILED_REQUIRED_TH06_CLOSED` permanecem preservados. Este R2 esgota o único ajuste documental; **restam uma implementação e um postreview, zero correções de código pré-autorizadas**. O postreview não foi consumido. EC01–EC08 não recebem PASS por esta análise; integração, paridade, M1, release e produção não são concedidos.
