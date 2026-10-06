# I13 — crítica independente pós-I12 da SPEC 0162

- **Revisor:** Leibniz, contexto fresh, somente leitura.
- **Candidato antes/depois:** `6e3d4eed7c5381710a8b0c75376e11d7068ca731183019da7c74de21cde1f1ad` — idêntico nos dois extremos.
- **Veredito:** `REVISE`, 1 P1, 1 P2, sem P0. BUILD T3 não pode avançar; produção permanece `NO_GO`.
- **Execução:** nenhum teste, SQL, migration, banco ou runtime. Nenhum arquivo foi alterado pelo revisor.

## Achados

### P1 — high-water externo não inclui `decision_at` confirmado

**Referência:** SPEC 0162, “Estado durável”, “Avanço e decisão” e “Precisão, assinatura e saúde temporal”.

A comparação do marker SQL usa somente `baseline_highwater` e os valores `sampled_at` de `SAMPLE`. Cada autorização válida, porém, avança `highest_seen_at` para um `decision_at` posterior ao sample; o receipt COMMIT pós-transação carrega esse instante, mas a regra do máximo não o inclui. No pedido seguinte, tráfego normal pode então produzir `marker > máximo witnessado`, situação que a própria SPEC manda fechar sem reparo automático. Definir como `decision_at` de COMMIT integra o máximo externo e como concorrência/atraso do receipt é ordenado.

**Confiança:** alta.

### P2 — lock global mantido durante I/O remoto

**Referência:** SPEC 0162, “Avanço e decisão” e benchmark obrigatório.

A SPEC adquire `FOR UPDATE` antes da amostra e mantém a transação/linha global bloqueada enquanto observer, witness e verifier retornam receipts/attestations. Um atraso de 100 ms, dentro do orçamento descrito, serializa admissions perto de 10/s; o benchmark exige 64 requests/s e p99 ≤800 ms. A barra não fixa um limite de tempo para essa seção crítica nem separa I/O remoto do lock SQL. O critério de carga pode falhar; confiança alta na retenção do lock, média quanto à falha quantitativa sem medição.

## Resolução de I12

I13 considerou os dois achados I12 tratados documentalmente: validade reavaliada em `decision_at` dentro da rotina atômica, com testes de borda/atraso; e upgrade legado 0027 separado do genesis, com drain, fence, revogação, quiet window e handoff fail-closed. Ainda não há validação comportamental desses contratos.

## Drift e riscos residuais

`docs/02_spec/0190_spec_validation.md` continua indicando aceitação do hash antigo `c334…` e que a crítica nova já estaria satisfeita. Esse estado não corresponde à SPEC atual, que registra I12 `REVISE`, I13 pendente/REVISE, BUILD pausado e nova aprovação T3 pendente. O contrato também depende de controller, observer, witness/WORM, verifier/HSM, sink, registry de identidade e autoridade de fencing independentes; B3, D-06, integração root, CI e staging são gates separados.

Esta crítica não autoriza BUILD. Uma futura crítica ACCEPT ainda exigirá nova aprovação humana T3 vinculada ao hash exato.
