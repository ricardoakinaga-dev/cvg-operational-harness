# S180 Builder — AUDIT_ACTIONS_EXEC_20261003

03/10/2026. Resultado: **IMPLEMENTED — DOCUMENTARY_I0 — NOT_APPROVED — BUILD_NOT_AUTHORIZED**. Lane sem descendentes, commit, código novo, npm audit, instalação, alteração de dependências/lock, ledgers/controllers, provider real, push ou deploy. Checkout compartilhado e trabalho alheio preservados. A revisão posterior única de C1 pertence ao Lead; esta autoinspeção documental não é revisão independente nem consome/substitui aquela revisão.

## Caminhos desta lane

- [SPEC 0180](../../../../02_spec/0180_shared_transport_ci_security.md).
- Este registro próprio, `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/s180-builder.md`.

C8/B3 removeu integralmente a proposta de autorização excepcional clínica da SPEC. D009 mantém CLINICAL→NO_MODEL; oracle CLASSIFICATION-NO-MODEL exige policy_denied antes de consultar/reservar/consumir/settle budget ou provider/DNS/HTTP, com zero chamadas. Sucesso da migração pública e R14/R15 usam exclusivamente texto não clínico sintético, prompt de teste compatível e provider de fixture. NOTE clínica sintética permanece negativo separado. D2 fica indecidida e bloqueia apenas organização clínica por modelo, mantendo gates próprios das tarefas HISO/PISO independentes.

C5 tornou R01–R15 obrigatórios na tabela e em V011; explicitou re-congelamento de todos os inputs de fonte no início de cada BUILD autorizado. A tabela reconcilia 2.357 PASS/189 SKIP históricos com 2.650 PASS/0 SKIP no candidato posterior com PG/coverage, sem transformar totais em denominador/gate ou afirmar que diferenças são apenas testes novos. DRIFT bruto por XML gerado e reconciliação de fonte MATCH continuam explícitos.

C6 liga brace-expansion HIGH ao tooling ESLint/typescript-eslint→minimatch, fast-uri HIGH aos dois paths runtime do Fastify/AJV/serializer da API, undici HIGH ao jsdom de desenvolvimento/testes. Fastify MODERATE continua explícito. O manifest do legado declara Fastify dev e a fonte importa tipo; runtime real é o host API. Cadeias provam ownership/dependência, não exploração ou ausência em imagem; exposição de artefato não demonstrada fica UNDETERMINED. [Audit já existente](../security-audit-readonly-r1.log) e [árvore já existente](../security-exposure-tree.json) apenas lidos, sem nova execução do scanner.

## Hashes e preservação

| Artefato | SHA-256 |
| --- | --- |
| SPEC antes / [cópia preservada pelo Lead](before-0180_shared_transport_ci_security.md.txt) | `b1b6f4f0cdcc701e66c0b20973b2475799f6222525d99649b7b15c52e5a8f368` |
| SPEC emendada | `7971771ca8e4a12be90e58536ea105c8399d844e28c47093b2a50575afff6dc2` |
| `package-lock.json` (read-only, MATCH antes/depois) | `c857e1b9ce4990d8a5105ee8eeb2b7a75e7930118a91230073972a8d70bd8e72` |
| `package.json` (read-only, MATCH antes/depois) | `3a4fdc73fad162f2c57922e96140cad813e07e594112174d67e81597cf1c1a5e` |
| `apps/api/package.json` (read-only, MATCH antes/depois) | `2631318cbed49999dde8cb689bf6202c577567775f40e1e8ce0d4df975457fb6` |
| `legacy/packages/secretary-journeys/package.json` (read-only, MATCH antes/depois) | `59f3119b3d55a8504202a198cd55260a2178c4e5c1f19416d887d5d73ed93405` |
| `products/shift-assistant/package.json` (read-only, MATCH antes/depois) | `429e5034e8fa85263adc2bf4988fa1f3670cc3476db9cbb868c73d62ddb65ca7` |
| `vitest.config.mts` (read-only, MATCH antes/depois) | `f6c603da3498b09b5184cef30581e9a3431bf8d3bd853d6e7c7343a0509edab1` |
| `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/security-audit-readonly-r1.log` (read-only, MATCH antes/depois) | `067794b0930ccfeb47ab04b10a060f7261ddca0c2da01ae465e5fd645ebf6244` |
| `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/security-exposure-tree.json` (read-only, MATCH antes/depois) | `4679b5ff8cfac92abd9b96ef679a79f69c4373bd946edcd081486ad23de4dc58` |

Sentinel dos oito inputs relidos: **MATCH 8/8**. Comparação com a cópia anterior: orçamento diário durável e núcleo de cancelamento/deadline byte-idênticos; limites/streaming/SSRF/erros D011, conteúdo R01–R13 e HOW CI/jobs/manifests/imagem/variante neutra idênticos após normalizar whitespace/linhas separadoras de tabela. Smoke público externo de dist permanece byte-idêntico. Esses controles não atestam imutabilidade de todo o checkout concorrente; esta lane escreveu apenas os dois caminhos declarados.

## Checks executados

Todos em cwd do repositório, usando `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node` (`v22.23.2`). Prettier --write foi limitado à SPEC e a este registro. A verificação final de formato/links/diff abrange ambos os caminhos e seu recibo fica no retorno ao Lead.

```sh
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/prettier/bin/prettier.cjs --check docs/02_spec/0180_shared_transport_ci_security.md
```

Resultado: exit `0`; formatação PASS.

```sh
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node scripts/check-doc-links.mjs docs/02_spec/0180_shared_transport_ci_security.md
```

Resultado: exit `0`; DOC_LINKS_OK, nenhuma referência interna quebrada ou path absoluto não autorizado.

```sh
git diff --check -- docs/02_spec/0180_shared_transport_ci_security.md
```

Resultado: exit `0`; sem saída; whitespace PASS.

Controle estrutural executado por stdin, sem criar script no repositório:

```sh
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node --input-type=module <<'NODE'
import fs from 'node:fs'; import crypto from 'node:crypto'; import assert from 'node:assert/strict';
const p='docs/02_spec/0180_shared_transport_ci_security.md';
const s=fs.readFileSync(p,'utf8'); const old=fs.readFileSync('docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/before-0180_shared_transport_ci_security.md.txt','utf8');
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
assert.equal(hash(old),'b1b6f4f0cdcc701e66c0b20973b2475799f6222525d99649b7b15c52e5a8f368');
assert(!/ModelTransmissionGrant|Ed25519|TRANSMISSION-GRANT|\bgrants?\b/i.test(s));
assert(!s.includes('R01–R13'));
for(let i=1;i<=15;i++) assert(new RegExp('^\\| R'+String(i).padStart(2,'0')+'(?:\\s| /)', 'm').test(s),'missing R'+i);
assert(/^\| V011[^\n]*R01–R15[^\n]*R14[^\n]*R15/m.test(s));
assert(s.includes('BUILD_NOT_AUTHORIZED') && s.includes('CLASSIFICATION-NO-MODEL'));
assert(s.includes('CLINICAL/FINANCIAL/CREDENTIAL→NO_MODEL'));
assert(s.includes('antes de consultar/reservar/consumir/settle budget') && s.includes('counters de budget/provider/DNS/HTTP todos zero'));
assert(s.includes('signal não abortado') && s.includes('fixture não clínica INTERNAL/prompt de teste'));
assert(s.includes('No início de cada BUILD autorizado, re-congelar todos os inputs de fonte'));
assert(s.includes('2.357 PASS / 189 SKIP') && s.includes('2.650 PASS / 0 SKIP'));
assert(s.includes('Nenhuma dessas contagens constitui denominador congelado ou gate atual'));
assert(s.includes('fastify **MODERATE**') && s.includes('node_modules/fastify/node_modules/fast-json-stringify/node_modules/fast-uri'));
const section=(t,a,b)=>t.slice(t.indexOf(a),t.indexOf(b,t.indexOf(a)));
const norm=t=>t.replace(/^\|[\s|:-]+\|\s*$/gm,'').replace(/\s/g,'');
assert.equal(section(s,'### Orçamento diário durável','### Classificação e D2'),section(old,'### Orçamento diário durável','### Classificação e D2'));
assert.equal(section(s,'### Cancelamento e deadline integrados','Regressões adicionais obrigatórias'),section(old,'### Cancelamento e deadline integrados','Regressões adicionais obrigatórias'));
assert.equal(norm(section(s,'## HISO-011','### Regressões reais obrigatórias')),norm(section(old,'## HISO-011','### Regressões reais obrigatórias')));
assert.equal(norm(section(s,'### HOW dos jobs e manifests','## HISO-012')),norm(section(old,'### HOW dos jobs e manifests','## HISO-012')));
for(let i=1;i<=13;i++){ const prefix='| R'+String(i).padStart(2,'0'); const row=t=>t.split('\n').find(l=>l.startsWith(prefix)); assert(row(s) && row(old)); assert.equal(norm(row(s)),norm(row(old))); }
assert.equal(section(s,'### Prova de consumo público','Produto deve rodar'),section(old,'### Prova de consumo público','Produto deve rodar'));
const fingerprints={'package-lock.json':'c857e1b9ce4990d8a5105ee8eeb2b7a75e7930118a91230073972a8d70bd8e72','package.json':'3a4fdc73fad162f2c57922e96140cad813e07e594112174d67e81597cf1c1a5e','apps/api/package.json':'2631318cbed49999dde8cb689bf6202c577567775f40e1e8ce0d4df975457fb6','legacy/packages/secretary-journeys/package.json':'59f3119b3d55a8504202a198cd55260a2178c4e5c1f19416d887d5d73ed93405','products/shift-assistant/package.json':'429e5034e8fa85263adc2bf4988fa1f3670cc3476db9cbb868c73d62ddb65ca7','vitest.config.mts':'f6c603da3498b09b5184cef30581e9a3431bf8d3bd853d6e7c7343a0509edab1','docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/security-audit-readonly-r1.log':'067794b0930ccfeb47ab04b10a060f7261ddca0c2da01ae465e5fd645ebf6244','docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/security-exposure-tree.json':'4679b5ff8cfac92abd9b96ef679a79f69c4373bd946edcd081486ad23de4dc58'};
for (const [path,expected] of Object.entries(fingerprints)) assert.equal(hash(fs.readFileSync(path)),expected,path+' changed since read');
console.log(JSON.stringify({node:process.version,result:'PASS_DOCUMENTARY_I0',requiredOracleRows:15,removedProposalMatches:0,unchangedSections:['durable budget exact','deadline/cancellation core exact','D011 limits/streaming/SSRF/errors normalized','CI jobs/manifests/image/neutral variant normalized','R01-R13 content normalized','public dist smoke exact'],readOnlyInputsSentinel:'MATCH 8/8',specBeforeSha256:hash(old),specAfterSha256:hash(s),inputs:fingerprints},null,2));
NODE
```

Resultado final: exit `0`, 15 linhas R obrigatórias, zero matches da proposta removida, contratos acima preservados e sentinel MATCH 8/8. Saída exata:

```json
{
  "node": "v22.23.2",
  "result": "PASS_DOCUMENTARY_I0",
  "requiredOracleRows": 15,
  "removedProposalMatches": 0,
  "unchangedSections": [
    "durable budget exact",
    "deadline/cancellation core exact",
    "D011 limits/streaming/SSRF/errors normalized",
    "CI jobs/manifests/image/neutral variant normalized",
    "R01-R13 content normalized",
    "public dist smoke exact"
  ],
  "readOnlyInputsSentinel": "MATCH 8/8",
  "specBeforeSha256": "b1b6f4f0cdcc701e66c0b20973b2475799f6222525d99649b7b15c52e5a8f368",
  "specAfterSha256": "7971771ca8e4a12be90e58536ea105c8399d844e28c47093b2a50575afff6dc2",
  "inputs": {
    "package-lock.json": "c857e1b9ce4990d8a5105ee8eeb2b7a75e7930118a91230073972a8d70bd8e72",
    "package.json": "3a4fdc73fad162f2c57922e96140cad813e07e594112174d67e81597cf1c1a5e",
    "apps/api/package.json": "2631318cbed49999dde8cb689bf6202c577567775f40e1e8ce0d4df975457fb6",
    "legacy/packages/secretary-journeys/package.json": "59f3119b3d55a8504202a198cd55260a2178c4e5c1f19416d887d5d73ed93405",
    "products/shift-assistant/package.json": "429e5034e8fa85263adc2bf4988fa1f3670cc3476db9cbb868c73d62ddb65ca7",
    "vitest.config.mts": "f6c603da3498b09b5184cef30581e9a3431bf8d3bd853d6e7c7343a0509edab1",
    "docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/security-audit-readonly-r1.log": "067794b0930ccfeb47ab04b10a060f7261ddca0c2da01ae465e5fd645ebf6244",
    "docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/security-exposure-tree.json": "4679b5ff8cfac92abd9b96ef679a79f69c4373bd946edcd081486ad23de4dc58"
  }
}
```

A primeira extensão do controle estrutural falhou com exit 1 (`TypeError: Cannot read properties of null (reading '0')`) por escaping incorreto do regexp de linha na própria sonda. Corrigido o seletor para prefixo literal e reexecutado uma vez; nenhum arquivo da SPEC mudou entre a falha da sonda e o PASS final. A verificação estrutural original já havia passado antes dessa extensão. Não houve retry de teste comportamental para obter verde.

## Limites e handoff

Testes comportamentais, R01–R15, gateway/provider, PostgreSQL/E2E, build/imagem, advisories atuais, certify/SBOM/licenses e CI remoto: **NOT_RUN nesta lane**. Os resultados históricos citados foram conferidos em artefatos existentes; não são resultados da futura implementação. Exposição por imagem e correção dos advisories continuam pendentes. Nenhum gate/cartão independente recebe aceite por esta entrega.

Lead deve integrar o diff e os novos hashes no packet/manifest após o encerramento das lanes, registrar revisão da D2 no backlog do produto e preservar coordenação/ledgers compartilhados. Aprovação humana de 0179 e 0180 permanece separada e pendente; BUILD T3 continua proibido. Este Builder não editou packet, manifest, backlog, ledgers ou controllers, nem pediu aprovação ao usuário.

