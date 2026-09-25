# SPEC — AUD19-001 — Restaurar higiene do gate sem mudança semântica

- programa: `AUD-20260919-REMEDIATION`; onda: `W0`; gate de entrada: `G0`
  (aprovação humana concedida pelo prompt de 2026-09-19 que autoriza
  `AUD19-001`–`AUD19-016` em ambiente local/sintético/descartável).
- aprovação técnica: registrada por este prompt; nenhuma decisão externa
  adicional foi necessária (escopo mecânico, local, reversível, fail-closed
  preservado).

## O que / onde / como

- O quê: aplicar Prettier travado somente nos 9 arquivos reportados por
  `npm run format:check`; provar ausência de mudança semântica.
- Onde (congelado): `docs/AAA-41-CRITIC-CLOSURE.md`,
  `docs/phase4/evidence/CRITIC_ONLY_ATTEMPTS.md`,
  `docs/phase4/evidence/CRITIC_ONLY_CANDIDATE.json`,
  `docs/phase4/evidence/CRITIC_ONLY_CLOSURE_CHAIN.json`,
  `docs/phase4/evidence/CRITIC_ONLY_RESULT.json`,
  `docs/phase4/evidence/CRITIC_ONLY_SENTINEL.json`,
  `docs/phase4/evidence/critic-only/attempt-01-raw.md`,
  `docs/phase4a/evidence/EVIDENCE_GRAPH.json`,
  `docs/phase4a/GATE_VALIDATION.md`.
- Como: `npx prettier --write` (versão travada `3.8.3`) exatamente nesses
  paths; nenhum outro arquivo tocado por esta task.

## Critérios de aceite (congelados)

1. `npm run format:check` → PASS (`All matched files use Prettier code style!`).
2. `git diff --check` → PASS.
3. JSON (5 arquivos): igualdade de `json.loads(old) == json.loads(new)`
   contra `git show HEAD:<path>`.
4. Markdown (4 arquivos): diff restrito a formatação determinística do
   Prettier (escape `\*\*`, normalização `__x__`→`**x**` com render
   idêntico, padding de tabelas, linhas em branco); nenhum token de
   conteúdo (hashes, digests, veredictos, datas, identidades) alterado.

## Dependências e comandos

- Dependência: aprovação do plano (`G0`) — concedida.
- Comandos: `npm run format:check`, `git diff --check`,
  `sha256sum` antes/depois, comparação JSON via `git show HEAD`.

## Impactos conhecidos e registrados (sem mascaramento)

- `attempt-01-raw.md`: SHA `59dde900…` (citado em `CRITIC_ONLY_ATTEMPTS.md`,
  execution log e runtime state históricos) → `d92f69f0…`. Conteúdo
  parse/render-equivalente; a citação histórica permanece válida como
  "hash na época do fechamento"; mapeamento de supersessão em
  `HASH_TRANSITION.md` desta evidência. A reconciliação narrativa pertence
  a `AUD19-012`; nenhum texto de citação foi alterado aqui.
- 3 arquivos são candidate-scoped (`AAA-41-CRITIC-CLOSURE.md`,
  `GATE_VALIDATION.md`, `EVIDENCE_GRAPH.json`); 6 estão em
  `docs/phase4/evidence/` (excluído do candidato por
  `CANDIDATE_EXCLUDED_PREFIXES`). Nenhum dos 9 é artefato manifesto
  (29 hashes verificados separadamente em `AUD19-002`/`AUD19-016`).
- `certification:verify` já reportava `CANDIDATE_DRIFT` antes desta task;
  a nova identidade canônica será congelada em `AUD19-002`.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-001/`
