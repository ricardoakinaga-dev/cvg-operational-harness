# Nota 0232b — o oráculo do servidor de falhas aceita o corpo governado (AUD0625 F06b)

R1, 29/10/2026. Task `AUD0625-F06B-D9-20261029`, follow-up F06b (T2, só teste) da
[SPEC 0267](0267_model_gateway_prompt_binding_classification_usage.md). Estado
`APPROVED_BY_INTEGRATOR`: **o oráculo é contrato congelado da
[SPEC 0232](0232_private_model_fault_server.md)** (candidata `26d866c3`, SHA-256
`8f8ecd2934fd3dbfd7b82141efb6a97e2a653782eefe10ef8c177b01a408fe93`), então
nada foi alterado em `tests/support/model-fault-server/` antes da aprovação do
autor desta nota.

## Por que é contrato congelado

- O plano é um objeto **fechado** de 6 campos (`validatePlan`, `closed(...)`).
- O servidor recusa qualquer corpo que não seja byte a byte
  `expectedRequestBytes(plan)`: um só `user` com `CVG_SYNTHETIC_REQUEST:<caseId>`.
- `planSha256` e `requestSha256` das gravações derivam desses dois objetos; as
  fixtures e os digests do MF03/MF06 dependem deles.

Depois da 0267 o gateway renderiza a instrução aprovada como mensagem `system`,
então o corpo real do gateway não é mais aquele. Hoje os 6 casos MF que passam
pelo gateway (MF01 `ok-json` e `chunked-json`, MF02 `rate-limit`, `timeout`,
`disconnect`, `invalid-json`) usam o wrapper `withoutGovernedSystem` em
`tests/model-fault-server.test.ts`, que apaga `system` e `promptBinding` antes
do provider. É um atalho de teste, não o caminho governado real.

## Mudança proposta (aditiva)

1. **Campo opcional no plano:** `governedSystem?: true`. Ausente, o plano, o
   corpo esperado, `planSha256`, `requestSha256` e todos os digests de
   gravação ficam **byte a byte iguais** aos congelados. Presente, é o único
   valor aceito (`true`); qualquer outro valor falha no `closed schema` antes do
   `listen`.
2. **Corpo esperado governado** (`expectedSyntheticRequest` e
   `expectedRequestBytes` com o campo): `messages` passa a ter
   `[{role:'system', content:'CVG_SYNTHETIC_INSTRUCTION:<caseId>'}, {role:'user', content:'CVG_SYNTHETIC_REQUEST:<caseId>'}]`; o resto do corpo
   (`model`, `temperature`, `max_tokens`, `stream`) não muda. O servidor continua
   comparando byte a byte: um `system` diferente, ausente, duplicado ou fora de
   ordem é recusado como qualquer corpo divergente.
3. **Teste:** o prompt aprovado do gateway usa
   `CVG_SYNTHETIC_INSTRUCTION:<caseId>` como conteúdo; o wrapper
   `withoutGovernedSystem` sai; um provider espião registra `promptBinding` no
   `ProviderRequest` (o binding não vai ao fio) e o teste afirma que ele existe
   e que seus digests batem com o prompt registrado. Os 6 casos passam a
   afirmar o mesmo que afirmam hoje (usage, eventos, códigos de erro).
4. **Controles:** o corpo antigo (só `user`) continua aceito com o plano sem o
   campo, e é recusado com o campo; o corpo governado é recusado sem o campo;
   campo com valor diferente de `true` falha; digests do plano sem o campo
   iguais aos congelados.

## Fora desta nota

- Não muda a semântica de erros do gateway (0232, última frase) nem o contrato
  público dos providers.
- Não toca `record-probe.js`/`cause-probe.js` além do tipo opcional em
  `index.d.ts`; as gravações existentes não são regravadas.

## Alternativa descartada

Aceitar os dois corpos no mesmo plano (união): enfraquece o oráculo, porque um
corpo errado em um dos formatos passaria. O campo opcional mantém um só corpo
exato por plano.

## Decisão do autor/integrador (29/10/2026)

Aprovada por delegação, como integrador, pelo Claude DF em mensagem de sessão cruzada de 29/10/2026 (resposta à nota 0232b): extensão aditiva `governedSystem?: true`, com o campo ausente preservando digests e corpo byte a byte, e os controles acima. A implementação é T2, só teste.

## Decisão pedida ao autor (histórico)

Aprovar a mudança aditiva acima como extensão do contrato 0232, com o digest
congelado preservado para planos sem o campo. Sem a aprovação, nada em
`tests/support/model-fault-server/` é alterado.
