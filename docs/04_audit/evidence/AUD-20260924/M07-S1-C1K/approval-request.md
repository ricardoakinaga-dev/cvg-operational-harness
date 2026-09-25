# Pedido de decisão humana — M07-S1-R1-C1K

**Estado:** `WAITING_HUMAN_APPROVAL`  
**Task:** `A24-03-C1K-REVIEW`  
**M07-S1:** `FAIL / OPEN`  
**Produção:** `NO_GO`

## Decisão solicitada

Autorizar exclusivamente duas revisões fresh-context, independentes e read-only do candidate C1J já congelado: um reviewer I1 e um Final Critic separado, ambos sobre o fingerprint `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b` (977 inputs). Os reviewers receberão os briefs congelados e os artefatos C1J identificados por SHA-256 em `source-evidence.json`.

Para aprovar, responda **“Aprovo M07-S1-R1-C1K”** depois de conferir o SHA-256 integral deste pedido. A frase genérica “aprovo este gate” que chegou antes da apresentação deste packet não está vinculada a C1K. A aprovação contextual anterior foi consumida por C1J, cuja execução terminou `FAIL / OPEN`; C1J não será repetida.

## Escopo exato

Permitido, e somente após aprovação vinculada ao hash deste pedido:

1. Uma tentativa de criar reviewer I1 em contexto novo (`fork_turns=none`), estritamente read-only, usando `reviewer-brief-i1.md`.
2. Uma tentativa separada de criar Final Critic em contexto novo (`fork_turns=none`), estritamente read-only, usando `reviewer-brief-final-critic.md`. O Final Critic não receberá o relatório I1 antes de concluir seu próprio parecer.
3. O lead registra as respostas e metadados de tentativa somente em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1K/`.

Os únicos outputs permitidos são `decision-record.json`, `review-ledger.json`, `i1-review.md`, `final-critic-review.md` e `final-disposition.md` no diretório C1K. Não há comandos ou checks de produto autorizados.

Depois da tentativa, o lead também atualizará os registros de governança exigidos pelo `docs/07_agents/AGENTS.md` — backlog 0344, execution log e runtime state, além de ponteiros correntes que precisem mudar — somente para registrar a decisão, o resultado desta tentativa, os bloqueios preservados e a próxima ação. Essas atualizações não ampliam a autoridade C1K. Reviewers não escrevem nesses registros.

## Evidência congelada

O candidate, sua decisão C1J, critérios, resultados e arquivos de proveniência estão vinculados pelos hashes de `source-evidence.json`. Os arquivos de escopo deste C1K também são congelados pelos hashes abaixo. Os dois JSONs de decisão/ledger começam em estado pendente e só podem ser atualizados para registrar a decisão ou as tentativas C1K.

| Arquivo C1K | SHA-256 |
| --- | --- |
| `scope-manifest.json` | `29f7f2fb94f61b90376a174415459deee3798c32167eaed949ea2bdf485e808e` |
| `source-evidence.json` | `045c9ea0e712cd15953d9f56dee9b81af117f8e6429a33dc16e11dd55a50b72c` |
| `review-scope.md` | `c4ccc0e187d9705625ca0959d87e4088964fcd2e859764e65c93d49280c31159` |
| `reviewer-brief-i1.md` | `ac285005c9dd57fd5c945018e75d452af1dcee077254077612021ef4cc76c510` |
| `reviewer-brief-final-critic.md` | `4abc6e8141fcefbf41557c2fa0f43bed1302e174be5a0756b5a485ab89252844` |
| `decision-record.json` (initial) | `72d7a52eff50e2ae9f3ae19319074d4e36e8ae74d12bf25c72aafe8f726067cc` |
| `review-ledger.json` (initial) | `ebf2739f8525494ea17afae22b973b2fe6a9321e7c175f36b9d286ef05490fad` |

The final packet validation and this request are evidence in C1K; the request's own SHA-256 is stated in the decision prompt and current CVG ledgers, avoiding a self-referential hash.

## Exclusions and stop rules

This gate does **not** authorize edits to product, tests, configuration, manifests, historical evidence, the C1J result, or any path outside the C1K evidence directory. It does not authorize running tests, builds, typecheck, lint, coverage, scanners, candidate freeze, C1J commands, external network/services, database, real data, sensitive actions, or production work. It does not accept M07-S1 or unlock M07-S2/S3/S4 or M05.

Each reviewer role gets one creation attempt. A refused or unavailable reviewer is recorded `UNAVAILABLE`; no substitute or retry is allowed. Any unavailable/rejecting reviewer or material unresolved finding leaves M07-S1 `FAIL / OPEN`. Even if both reviews accept, C1J's historical result remains immutable; a later audit must record any disposition separately.

## Packet state

`decision-record.json` is `WAITING_HUMAN_APPROVAL`; `review-ledger.json` is `NOT_STARTED`. No reviewer has been created under C1K. No review, product edit, check, test, or command has been performed under this gate.
