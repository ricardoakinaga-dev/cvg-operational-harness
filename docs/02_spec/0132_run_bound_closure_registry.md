# 0132 — SPEC: closure registry vinculado à execução

- ID: `SPEC-CERT-001`
- Estado: `SPEC_DRAFT_FOR_REVIEW`
- Origem: AUD53, [0575](../04_audit/0575_aud53_closure_rebind_decision_packet.md)
  (Opção A aprovada pelo usuário em 2026-09-25), itens RA25-09 e RA25-05 de
  [0351](../03_build/0351_audit0573_backlog.md).
- Alvo: `scripts/lib/finding-governance.mjs`, `scripts/phase10-certify.mjs`,
  `scripts/lib/certification-rules.mjs`, `.gitignore` e `tests/rem21-findings.test.js`.

## Problema

`npm run certify` era estruturalmente incapaz de passar em CI. O registry de
fechamento era lido de um caminho constante
(`finding-governance.mjs:7-8`), tinha de carregar o `runId` da execução
(`:225`) e expirava em 24h (`:229`), mas `CI_RUN_ID` é fixado uma vez por job
(`.github/workflows/verify.yml:22-23`) e nenhum script ou passo de CI escrevia
o registry. O certificado de 2026-09-22 só passou porque o operador exportou
`CI_RUN_ID=run-rem21-019-final-3` e rodou dentro da janela de 24h.

## Regras normativas

1. **R1 — adjudicação imutável.** Os 26 pares `status`/`rationale`/`evidence` de
   `A21-F01`–`A21-F26` permanecem em
   `docs/04_audit/evidence/AUD-20260921/REM21-019/finding-closure.json`,
   byte-idênticos, travados por `sha256sums.txt`. Nenhum status, rationale ou
   referência de evidência é reescrito.
2. **R2 — vínculo gerado.** `issueClosureRegistry(root, candidateId, runId)`
   lê a adjudicação e emite `certification/finding-closure.json` com o
   `candidateId` e o `runId` correntes, `generatedAt` corrente, `source`
   (relatório autoritativo + SHA-256) e `adjudication` (caminho + SHA-256) da
   fonte. O `runId` deixa de ser um valor pré-computado.
3. **R3 — fail-closed na emissão.** A emissão falha se a adjudicação não for
   `schemaVersion 1` + `kind: a21-closure-registry`, se o `source.path`/`source.sha256`
   dela não casar com o relatório autoritativo, ou se `entries` não for array.
   O arquivo é validado por `loadClosureRegistry` logo após a escrita; uma
   emissão inválida não deixa registry aceitável em disco.
4. **R4 — artefato gerado, fora do candidato.** `certification/finding-closure.json`
   entra em `CANDIDATE_EXCLUDED_FILES` e em `.gitignore`. O candidato não muda
   quando o registry é emitido, e o arquivo continua sendo registrado em
   `certification/manifest.json` por `CLOSURE_REGISTRY_PATH`.
5. **R5 — vínculo compartilhado entre certify e verify.** `certify` emite com o
   `candidateId`/`runId` que grava em `phase10-result.json`; `certification:verify`
   verifica com `result.candidate.candidateId` e `result.runId`. Nenhum processo
   inventa um `runId` independente.
6. **R6 — validade preservada.** A janela de 24h e as checagens de
   `candidate_id`/`run_id` continuam valendo sem afrouxamento. O que muda é
   quem produz o valor vinculado, não a força do vínculo.

## Fixtures obrigatórias

- Emissão a partir da adjudicação real num root temporário (fonte autoritativa,
  adjudicação e os 26 arquivos de evidência copiados) → 26 entries, `source`
  íntegro, `adjudication.sha256` correto, `computeCurrentFindings` com
  `requireClosureRegistry: true` sem lançar.
- Negativa: adjudicação com `source.sha256` divergente → falha
  `adjudication_source_hash_mismatch` e **nenhum** registry escrito.
- Hermeticidade: o teste não pode escrever no `certification/` do repositório.

## Critério de pronto

- `npm run certify` → 16 gates `PASS` com `CI_RUN_ID` fixado.
- `npm run certification:verify` → exit 0, incluindo `findings are current and
candidate-bound` e a verificação dos 37 hashes de artefato.
- `typecheck`, `lint`, `format:check` → `PASS`; testes de REM21 verdes.

## Autorização e gates

- Task registrada: AUD53 / RA25-11 em `docs/03_build/0351_audit0573_backlog.md`.
- Aprovação do usuário: “vamos de opção A”, 2026-09-25, sobre o packet
  [0575](../04_audit/0575_aud53_closure_rebind_decision_packet.md)
  (SHA-256 `ca2ae0001b4807f94131f9bedf68bdd8ad06eb16b49eae5bae852ddcc43a9743`).
  O usuário não citou o hash literalmente; a aprovação é por instrução direta
  registrada verbatim, e o escopo aprovado é o do packet.
- Revisão independente / humana desta SPEC: `NOT_RUN` — este registro não é
  aprovação. Produção permanece `NO_GO`.
