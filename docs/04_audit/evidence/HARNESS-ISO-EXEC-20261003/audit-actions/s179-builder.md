# S179 — emendas documentais e dados propostos

Data: 03/10/2026. Claim `AUDIT_ACTIONS_EXEC_20261003`, lane `S179`.
Entrega do Builder: **IMPLEMENTED (documentação e DATA), não APPROVED**.
SPEC permanece `PROPOSED / HUMAN_T3_REVIEW_PENDING`; expectativas dos novos
fixtures são `PROPOSED_NOT_EXECUTED`. Nenhum serviço/normalizador foi implementado.

Diferenças concretas:

- C2: gramática local determinística pt-BR para inteiros 0–999, decimal com
  vírgula e escala preservada, horas explícitas; comparação por
  (bloco, campo, valor, unidade), fonte literal exibida, ambiguidades bloqueantes.
  Sem confiança em normalização de LLM, conversão/alias de unidade ou merge de paciente.
- C3: modelo fornece quote com path/patientRef; serviço futuro atribui bloco,
  enumera ocorrências inclusive sobrepostas e calcula UTF-16 absoluto.
  Zero/ausência rejeita; múltiplos candidatos bloqueiam sem escolha da primeira.
  Hint de offset antigo errado fica fora do novo payload estrito.
- C6: movimentação física concluída em 03/10/2026; gate HISO-005 T2 ainda sob
  reparo/revisão, sem aceite inferido.
- B2/B3: novos hashes exigem revisão humana separada 0179/0180; conteúdo CLINICAL
  permanece NO_MODEL/policy_denied, zero chamadas/budget, até decisão separada D2.
  D1–D4 continuam registrados; fidelidade e gates futuros preservados.
- Steering C4: definição proposta de operação saudável exige dispositivo conectado
  do destinatário; offline é indisponibilidade reportada. ≤60 s permanece entrega
  comprovada. Adapter pode derivar identidade local de evento autenticado dos
  campos documentados; horários/IDs externos não são obrigatórios universais.
  Preservar receipt bruto/hash e tempos locais conservadores; qualificação futura
  do adapter escolhido é obrigatória.

[Pesquisa C4 do Lead](ap011-provider-delivery-receipt-r1.md) foi lida; não
executei provider nem fiz pesquisa externa nesta lane. Item D2 já registrado
pelo Lead no backlog do produto; não o alterei.

Artefatos alterados e SHA-256:

| Caminho | SHA-256 |
| --- | --- |
| `docs/02_spec/0179_shift_consumer_reliability.md` | `988192fe48737b4571ed659f051e22f3a9283d5c433e7c6c078e1dd0f7be86c3` |
| `products/shift-assistant/src/__tests__/fixtures/reliability/numeral-equivalence-cases.json` | `28665a695886b10675fc3b27c43e7bd1e3a6f9e42f727f0ce3b121ad1c78571b` |
| `products/shift-assistant/src/__tests__/fixtures/reliability/quote-evidence-cases.json` | `4b6ad2a5ab95162251fe870e1c0444a41a8749d243a1a01496cd3716604f9d22` |

Baseline da SPEC, preservada no [before](before-0179_shift_consumer_reliability.md.txt):
`6c01f8080d190b8cdeec524c5732fa35cf63ed7a938c251480665df14c752423`.

Dados: 41 casos de numerais (139 comparações declarativas), incluindo dez
positivos e dez negativos com texto integral de audio01–audio10; cenários adicionais
de troca entre pacientes/campos/unidades, escala, identificação, hora ausente,
histórico versus atual e gramática inválida. 21 casos de quote: dez referências
originais mais índice antigo errado/quote válido, inexistente, ausente/vazia,
duplicada, sobreposta, repetida em blocos distintos com/sem atribuição, cruzamento
de bloco e não-BMP. Expectativas de sucesso significam somente comparação ou
localização; zero tarefas ativadas. Audio06 mantém visita ambígua, audio09 mantém
hora ausente, audio10 mantém correção/pausa.

Checks efetivamente executados em Node `v22.23.2`:

1. JSON parse/consistência declarativa por Node, exit 0. Resultado completo da
   primeira verificação:
   ```json
{
  "node": "v22.23.2",
  "result": "PASS_DATA_CONSISTENCY_ONLY",
  "numeralCases": 41,
  "quoteCases": 21,
  "comparisonRecords": 139,
  "quoteRecords": 21,
  "referenceTranscripts": 10,
  "positiveAudioComparisons": 10,
  "negativeAudioComparisons": 10,
  "nonBMP": {
    "codePoints": 8,
    "UTF16": 9
  },
  "overlappingCandidates": 3,
  "sectionsByteUnchanged": [
    2,
    3,
    5,
    6,
    10
  ],
  "productOracles": "NOT_RUN",
  "grammarParser": "NOT_IMPLEMENTED",
  "approval": "PENDING"
}
   ```
2. Após o último ajuste de texto, rechecagem reproduzível abaixo, exit 0:
   ```text
PASS_DATA_CONSISTENCY_ONLY: 41 numeral cases; 21 quote cases; 10 references per file; sections 2/3/5/6/10 unchanged; product oracles NOT_RUN
   ```
3. Prettier dos três artefatos, exit 0:
   ```sh
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/prettier/bin/prettier.cjs --check docs/02_spec/0179_shift_consumer_reliability.md products/shift-assistant/src/__tests__/fixtures/reliability/numeral-equivalence-cases.json products/shift-assistant/src/__tests__/fixtures/reliability/quote-evidence-cases.json
   ```
   Resultado: `All matched files use Prettier code style!`.
4. `git diff --check -- docs/02_spec/0179_shift_consumer_reliability.md`,
   exit 0, sem saída. As seções 2, 3, 5, 6 e 10 são byte-idênticas ao baseline.
5. Sentinel SHA-256 de 26 inputs protegidos: **MATCH**, zero divergências.
   Inclui before-SPEC, manifests áudio/corpus, os vinte casos originais e
   organizer/store/assistant. Hashes dos manifests preservados:
   áudio `71cceaee3a18c14dab2d6d99d0b36ddca84ce7674e3f7ca4f4e6d87e285b40f6`;
   corpus `27f07e90b092bdc5797dd0d1052fda3884e05c8b211f029871ddcfc24e32a0ff`.
   O Lead poderá atualizá-los na integração posterior, fora desta lane.

Reprodução do check 2 a partir da raiz do repo (somente leitura; asserts sobre
dados propostos, não implementação do parser/serviço):

```sh
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = 'products/shift-assistant/src/__tests__/fixtures/reliability/';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const audio = JSON.parse(fs.readFileSync(root + 'audio-manifest.json', 'utf8')).audio;
const data = ['numeral-equivalence-cases.json', 'quote-evidence-cases.json'].map(n => JSON.parse(fs.readFileSync(root + n, 'utf8')));
assert.equal(audio.length, 10);
assert.deepEqual(data.map(d => d.cases.length), [41, 21]);
for (const d of data) {
  assert.equal(d.status, 'PROPOSED_NOT_EXECUTED');
  assert.equal(d.execution.serviceImplemented, false);
  assert.equal(d.execution.productOracleExecuted, false);
  assert.equal(new Set(d.cases.map(c => c.id)).size, d.cases.length);
  for (const a of audio) {
    const linked = d.cases.filter(c => c.source.audioId === a.id && c.source.derivation === 'EXACT_REFERENCE_TRANSCRIPT');
    assert.ok(linked.length > 0);
    for (const c of linked) {
      assert.equal(c.rawText, a.referenceTranscript);
      assert.equal(c.source.referenceTranscriptSha256, sha(a.referenceTranscript));
    }
  }
  for (const c of d.cases) {
    assert.equal(c.status, 'PROPOSED_NOT_EXECUTED');
    assert.equal(c.expected.status, 'PROPOSED_NOT_EXECUTED');
    assert.equal(c.expected.tasksActivated, 0);
    for (const b of c.patientBlocks) assert.ok(0 <= b.start && b.start < b.end && b.end <= c.rawText.length);
    for (const x of c.comparisons ?? []) {
      assert.equal(x.expected.status, 'PROPOSED_NOT_EXECUTED');
      const b = c.patientBlocks.find(b => b.patientRef === x.source.patientBlock);
      assert.ok(b && c.rawText.slice(b.start, b.end).includes(x.source.quote));
      if (x.expected.outcome === 'EQUIVALENT') {
        assert.equal(x.source.patientBlock, x.output.patientBlock);
        assert.equal(x.source.field, x.output.field);
        assert.equal(x.source.unitLiteral, x.output.unitLiteral);
        assert.equal(x.expected.displayLiteral, x.source.valueLiteral);
      }
    }
    if (c.modelEvidence) {
      assert.ok(Object.keys(c.modelEvidence).every(k => ['path', 'patientRef', 'quote'].includes(k)));
      for (const r of c.expected.candidateRanges) assert.equal(c.rawText.slice(r.start, r.end), c.modelEvidence.quote);
      if (c.expected.outcome === 'LOCATED') {
        assert.equal(c.expected.candidateRanges.length, 1);
        assert.equal(c.rawText.slice(c.expected.serviceEvidence.start, c.expected.serviceEvidence.end), c.modelEvidence.quote);
      }
    }
  }
}
const nonBMP = data[1].cases.find(c => c.id === 'non-BMP-UTF16');
assert.equal(nonBMP.modelEvidence.quote.length, 9);
assert.equal([...nonBMP.modelEvidence.quote].length, 8);
assert.equal(nonBMP.expected.serviceEvidence.end - nonBMP.expected.serviceEvidence.start, 9);
const overlap = data[1].cases.find(c => c.id === 'overlapping-ambiguous-quote');
assert.equal(overlap.expected.candidateRanges.length, 3);
assert.equal(overlap.expected.candidateRanges[1].start - overlap.expected.candidateRanges[0].start, 2);
const before = fs.readFileSync('docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/before-0179_shift_consumer_reliability.md.txt', 'utf8');
const after = fs.readFileSync('docs/02_spec/0179_shift_consumer_reliability.md', 'utf8');
const section = (s, n) => s.split(new RegExp('^## ' + n + '\\.', 'm'))[1].split(/^## \d+\./m)[0];
for (const n of [2, 3, 5, 6, 10]) assert.equal(section(after, n), section(before, n));
assert.ok(after.includes('até 60 s após dueAt'));
assert.ok(after.includes('NO_MODEL'));
console.log('PASS_DATA_CONSISTENCY_ONLY: 41 numeral cases; 21 quote cases; 10 references per file; sections 2/3/5/6/10 unchanged; product oracles NOT_RUN');
NODE
```

Limitações e continuidade: parser de numerais, SourceEvidence, serviço, Whisper,
oracles do produto, P01–P11, latência/adapter AP011 e BUILD T3 **NOT_RUN**.
Não rodei testes/runtime, PostgreSQL, E2E, certify, SBOM ou licenses.
Consistência JSON não prova gramática executável, fidelidade ou produção.
Nenhum cartão PISO/HISO foi fechado e nenhum aceite T2 foi atribuído.
Sem filhos, dados/providers reais, segredos, commit/push/deploy ou alterações
a controllers/ledgers/lockfile/manifests/casos originais. Lead integra
manifestos/hashes/packet, backlog e continuidade após esta entrega.
