# 0575 — AUD53: packet de decisão hash-bound para o closure registry

- Ciclo: AUD53 (continuação de AUD-0573). Estado: `PENDING_HUMAN_HASH_BOUND_DECISION`.
- Nada foi aplicado: este documento é proposta. Nenhum código, evidência ou
  registry foi alterado por ele.
- Origem: RA25-05 / RA25-09 de [0351](../03_build/0351_audit0573_backlog.md) e
  o bloqueio registrado em [0574](0574_aud0573_execution_evidence_2026-09-25.md).

## Achado estrutural

`npm run certify` não falha apenas por drift de candidato. O gate é
**estruturalmente incapaz de passar em CI** com o registry commitado:

| Fato                                                          | Evidência                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| O registry é carregado de um caminho constante, sem override  | `scripts/lib/finding-governance.mjs:7-8` (`CLOSURE_REGISTRY_PATH`)                    |
| O `runId` do registry tem de ser idêntico ao da execução      | `scripts/lib/finding-governance.mjs:225` (`run_id_mismatch`)                          |
| O `candidateId` do registry tem de ser o candidato atual      | `scripts/lib/finding-governance.mjs:222` (`candidate_id_mismatch`)                    |
| O registry expira em 24h                                      | `scripts/lib/finding-governance.mjs:229` (`registry_stale`), `:16`                    |
| `certify` deriva o `runId` do ambiente ou de `Date.now()`     | `scripts/phase10-certify.mjs:249-250`                                                 |
| Em CI o `runId` é sempre novo e definido uma única vez no job | `.github/workflows/verify.yml:22-23`                                                  |
| Nenhum script ou passo de CI escreve o registry               | só há leitura em `finding-governance.mjs`; nenhuma ocorrência em `.github/workflows/` |

Consequência: o registry commitado declara `run-rem21-019-final-3`
(`docs/04_audit/evidence/AUD-20260921/REM21-019/finding-closure.json`) e o
certify de 2026-09-22 só passou porque o operador exportou
`CI_RUN_ID=run-rem21-019-final-3` e rodou ~1h após o `generatedAt` do registry
(`certification/phase10-result.json` → `runId: run-rem21-019-final-3`). Em CI
esse mesmo valor nunca se repete, então `gate certify` e, por consequência,
`gate certification-verify` ficam vermelhos em toda execução, independentemente
do mérito do código.

**O registry não é evidência imutável: é uma atestação por execução**, com prazo
de 24h e vínculo ao `runId`. O que é adjudicação humana são os 26 pares
`status`/`rationale`/`evidence` de `A21-F01`–`A21-F26`.

## Opções

### Opção A — registry gerado por execução (recomendada)

Separar adjudicação de vínculo:

- A adjudicação continua commitada e imutável onde está hoje —
  `docs/04_audit/evidence/AUD-20260921/REM21-019/finding-closure.json`,
  byte-idêntico e travado por `sha256sums.txt` (linha 8).
- Um gerador novo (`scripts/finding-closure-issue.mjs`) lê essa adjudicação e
  emite `certification/finding-closure.json` com o `candidateId` corrente, o
  `runId` corrente e `generatedAt: now()`.
- `CLOSURE_REGISTRY_PATH` passa a apontar para o artefato gerado, que fica
  **fora do candidato** (mesma classe de `certification/load-report.json`).
- `certify` chama o gerador antes de `computeCurrentFindings`; em CI o passo
  passa a funcionar sem intervenção manual e sem valor pré-computado.

Δ exato: `scripts/lib/finding-governance.mjs:7-8` (constante) +
`scripts/phase10-certify.mjs` (uma chamada de geração) +
`scripts/lib/certification-rules.mjs` (`CANDIDATE_EXCLUDED_FILES` ganha
`certification/finding-closure.json`) + script novo + testes.

Custo: SPEC própria, revisão de contrato de gate, novo item de backlog.
Ganho: único caminho que deixa `certify`/`certification:verify` verdes de forma
durável, em CI e local, sem reescrever evidência auditada.

### Opção B — reemissão pontual

Emitir à mão um registry com o candidato atual, um `runId` escolhido e
`generatedAt` fresco, e rodar `certify` com `CI_RUN_ID` igual.

Ganho: certificado local verde por 24h. Custo: nenhum código. Limite: **não
resolve CI** — o `run_id_mismatch` volta na execução seguinte, e a cada 24h o
`registry_stale` volta mesmo localmente. Trata o sintoma, não a causa.

### Opção C — declarar dívida estrutural

Registrar o achado como item novo de backlog (`RA25-11`) e manter os dois gates
vermelhos até a Opção A ser autorizada e executada.

## Decisão pedida

Aprovação por hash da Opção A, com o escopo declarado:

1. autorizar a SPEC e o BUILD do gerador e da mudança de constante;
2. autorizar que `certification/finding-closure.json` seja artefato gerado e
   excluído do candidato;
3. autorizar o item de backlog novo, mantendo RA25-05 (`BLOCKED_BY_C1M`) como
   está — a Opção A não adjudica findings, apenas reemite o vínculo.

O que **não** está pedido: reescrever `finding-closure.json` de REM21-019, mudar
status/rationale dos 26 findings, afrouxar `run_id_mismatch` ou a janela de 24h,
ou tocar `sha256sums.txt`.

## Hash deste packet

O SHA-256 da revisão commitada é reportado no `docs/20_master_execution_log.md`
e na resposta ao usuário. A aprovação deve citar esse hash, e ele se refere ao
arquivo commitado — não a uma revisão posterior. Este documento não contém o
próprio hash para não criar auto-referência.
