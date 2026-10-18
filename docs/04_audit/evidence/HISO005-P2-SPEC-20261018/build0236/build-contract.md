# Contrato interno BUILD0236 v1

Autoridade exata em ../authority-build0236.json; SPEC0236 cf07fd5d congelada. Candidata exclusiva /home/ricardo/cvg-candidates/hiso005-integrated-20261018. Lead integra checker/CLI/origens e proveniência compilada; dois builders disjuntos, sem descendentes. Nenhuma fonte root promovida antes da composição final/gates/revisão.

## Lane engine

Escreve apenas `scripts/boundary-semantic-engine.mjs`, `tests/b6-0236-semantic-engine.test.js` e evidência `build0236/engine/**`. API síncrona exportada `runSemanticBoundary(input)` supervisiona worker/processo próprio com timeout monotônico total120s (análise+validação), env mínimo e Node22 pinado; não executar alvos analisados. Limites internos só podem reduzir os tetos da SPEC. Exporta também funções internas de análise/verificação para testes; nenhuma dependência nova.

Input serializável:

```js
{
  root, // absolute evaluated tree
  starts: ['packages/core/src/index.js'], // all existing reachable first-party starts, not a subset whitelist
  origins: [{ id, file, fileSha256, kind, start, end, reason, ordinal, expression, synthetic }],
  installed: [{ key, manifest, identityStatus, referenceDigest }], // host-validated0234 observations; no nominal approval
  compiled: { status, files: [{ file, sha256 }] }, // host-validated provenance or unavailable
  limits: {} // internal reductions only, absent for real CLI
}
```

Paths `file`/`manifest`/`key` são relativos ao root; `start/end` UTF16. `synthetic` é ausente ou `{ originalKind, originalStart, originalEnd, property }`; não atribuir span inventado. Host registra origem real antes de serializar diagnóstico. Nenhuma origem histórica por linha/digest é autoridade.

Output:

```js
{
  schemaVersion: 1, kernelVersion: 'semantic-kernel-v1',
  status: 'PROVEN' /* or UNKNOWN or VIOLATION */,
  proofs: [{ id, originId, status, rule, dependencies, file, fileSha256, kind, start, end, ordinal, derivation }],
  installed: [{ key, status, proofIds, reason }],
  unknowns: [{ file, reason, originId, detail }],
  violations: [{ file, reason, target }],
  inputs: [{ file, sha256 }], limits, usage,
  validation: { valid: true }, // only after actual recomputation/validation, not a self-approval input
  telemetry: { elapsedMs }
}
```

`PROVEN` para um módulo/pacote requer corpo/exports/sucessores fechados, identidadeMATCH para pacote e sem efeitos desconhecidos que possam invalidar intrínsecos. K0 input público UNKNOWN; K2 só próprios descritores intactos; K3 `this` real; K4 três intrínsecos enumerados; K5 todos alvos finitos reais; K6 loops/async/etcUNKNOWN; K7 ciclo provaUNKNOWN. Implementar recusa conservadora ampla é permitido; fixture JS puro com dependência fechada/MATCH e reflexão local conhecida precisa de positivo. Não inventar resumo de vi/Proxy/bind/sandbox/bootstrap. Native/WASM/paths/formatos não suportadosUNKNOWN. Produto conhecidoFAIL preservado, inclusive resolução instalada concatenada. Fonte/config/TCB mutada invalida provas.

Proofs incluem no máximo uma prova consumível por `originId`; a validação deve refutar spans/kinds/hashes/ordinais trocados, DAG cíclico e conclusão forjada. Host só move diagnósticos com PROVEN válido após sua própria revalidação dos inputs e registro emitido. O output total deve permanecer determinístico excluindo `telemetry`. Timeout invalida tudo, não retorna subset como prova integral. Não executar kernel0236 no root, em candidatoP1 antigo ou em dados/providers reais.

## Lane migração de testes

Somente `tests/pare100-sdk-boundary-qualification.test.js` e `tests/pare100-compiled-kernel-boundary.test.js`, evidência `build0236/test-migration/**`. Manter as92variantes e todos negativos/pins/catálogos congelados; atualizar o oráculo para0228: tabela inativa, nenhuma exceção, ocorrências preservadas, produtoFAIL, desconhecidoINCOMPLETE. Não editar script de checker, catálogo/SPEC histórica ou fonte peer. Falta de emits deve ser corrigida por preparação pública da candidata, não copiando outputs antigos. Copied-checker fixtures devem copiar dependências internas novas que a integração aprovada adicionou.

## Lead

Registra origens no emissor atual e serializa spans reais (incluindo BindingElement), liga `semantic:true`/CLI e a contabilidade por ocorrência. Proveniência compilada em scripts próprios separados `boundary-semantic-compiled.mjs` e testes próprios, com receita exata freshforce da SPEC e recibo/digest externos, sem source-proof transfer. Integra resultado do engine; default0228/0234 byte-equivalente. Não alterar scripts/testes ativos dos builders. Compilação dos pins existentes pela receita pública ocorre antes de executar92casos, com logs; não há nova confiança por pin.

A composição final inclui o portP1 e as mudanças0236 aprovadas, um freeze novo e gates completos atuais. Tentativa9b/88d6 interrompida com92ENOENT é histórica, nunca renomeada como PASS. As18aceitações precisam de evidência real; correta recusa da árvore real não encerraHISO005/B6.
