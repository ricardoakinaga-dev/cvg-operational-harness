# Manifesto de adjudicacao — AUD19-016

- task: `AUD19-016`; onda: `W4`;
  status: `CONDITIONAL_GO_CONTROLLED`.
- candidato: `d7f5d06a6bbf67ca410e5619674d313a74af690479bf5a5b7c5f67aeea331454`;
- run: `run-d7f5d06a6bbf-mu9kwo8c`;
- certificacao: `AAA_CONTROLLED`; decisao: `CONDITIONAL_GO`;
- escopo: local/sintetico/descartavel; producao: `NO_GO`.

## Provas

| Prova                             | Resultado                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run certify`                 | 16/16 gates locais `PASS` no mesmo run; PostgreSQL descartavel executado no gate dedicado |
| `npm run certification:verify`    | schema, manifesto, 29 hashes, decisao e candidato atuais `PASS`                           |
| `npm run verify:phase4a:identity` | `PASS`; ancora historica e candidato atual coerentes                                      |
| `npm run certification:self-test` | `PASS`; N1-N10 e C0-C27 rejeitaram adulteracao, drift e skips ocultos                     |
| critica independente              | fresh/read-only; nenhum P0/P1; nenhuma mutacao observada                                  |
| sentinel pos-critica              | candidato, run e 30 artefatos certificados inalterados                                    |
| `git diff --check`                | `PASS`                                                                                    |

## Adjudicacao

O pacote mecanico e a critica independente sustentam `CONDITIONAL_GO` somente
para o escopo controlado. O primeiro veredito da critica foi
`BLOCKED_FOR_FINAL_CLOSURE` pela ausencia do sentinel; o sentinel foi executado
depois e confirmou `mutationObserved=false`. A decisao final permanece
condicional, sem promover o resultado a `GO`.

## Findings e limites

- `P0=[]` e `P1=[]`; os cinco limites externos permanecem como P2 aceitos.
- `P2-06`: eval de tarefa `53/56 = 94,642857%`, abaixo da meta contratual de
  `97%`; os cenarios `EV-016`, `EV-021` e `EV-031` continuam explicitamente
  falhos.
- Providers, canais reais, identidade externa e signoff humano permanecem
  `NOT_VALIDATED`/`PENDING`.
- `negative-validation.json` é um self-test independente; seu conteúdo não
  precisa repetir o candidateId, mas o hash atual está vinculado no manifesto
  Phase 10 e o self-test passou N1-N10/C0-C27.
- RPO/RTO de producao nao foram medidos; restore, rollback e Docker sao provas
  controladas de `AUD19-015`, nao evidencias de infraestrutura produtiva.
- Chromium e o browser qualificado; Firefox/WebKit nao foram alegados.

## Arquivos de evidencia

- `SPEC.md`
- `critic-final.md`
- `critic-pre-adjudication-5f028e.md` (historico)
- `attempts-index.md`
- `pre-critic-snapshot-final.json`
- `post-critic-sentinel-final.json`
- `certify-run-final-freeze.txt`
- `certification-verify-final-freeze.txt`
- `certification-self-test-final.txt`
- `verify-phase4a-identity-final-freeze.txt`
- `../AUD19-014/` e `../AUD19-015/`
- pacote atual em `certification/`
