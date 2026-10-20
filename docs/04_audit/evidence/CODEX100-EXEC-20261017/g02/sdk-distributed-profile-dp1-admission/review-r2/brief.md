# Revisão independente R2 — DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1

Você é o crítico independente da segunda e última rodada desta unidade de implementação e
admissão. Não herdou contexto e não é o crítico da R1. Você é **somente leitura**: não crie,
edite, mova nem apague nada dentro da candidata nem do checkout principal. Sondas próprias,
se precisar, ficam num diretório temporário seu e usam só a stdlib (Python com `-I`, ou
Node v24.20.0 em `/home/ricardo/.nvm/versions/node/v24.20.0/bin/node`).

Proibido:

- rodar serviço (systemd-run), bwrap, o supervisor em qualquer modo que escreva
  (`run`, `selftest-sandbox`, `freeze`, `freeze-identities`, `diag-admission`,
  `init-ledgers`, `stage`, `fixtures` ou `plan`);
- rodar os autotestes ou ferramentas que escrevem na pasta;
- importar ou executar o SDK publicado, os wrappers publicados ou qualquer arquivo do cache;
- rede, Docker, PG, compilador, Codex CLI, commit, branch ou worktree.

Pode rodar, só para conferir: `python3 -I -B dplane/acceptance.py reevaluate <pasta-do-caso>`
e leituras de arquivos.

## Assunto

- Unidade: `/mnt/dados/cvg-work/cvg-codex100-dp1-20261019/docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp1-admission/`.
- Congelamento: `review-freeze-r2.json` na pasta, sha256
  `b661a8f6c2b0b43085a440c33abb709d6f7236ad308a5168ad1639843e9256b9`. Confira os sha antes
  e depois e registre.
- Histórico:
  - R1 em `review-r1/review.json` (REVISE, 0 P1, 3 P2, 6 P3);
  - reparo agrupado único em `repair-r1.json`;
  - preimagens em `archives/r1-preimages/`.
  - Não há outro reparo depois desta rodada. Achados P1 ou P2 seus vão para a disposição
    do executor e para o Lead.
- Os serviços já rodaram antes da R1. O reparo não rodou serviço novo, não usou vaga e
  não mudou nenhum arquivo do source freeze nem do identity freeze.

## Pedido da unidade (resumo)

Implementar e admitir o sub-lote DP-1 do perfil distribuído keyless
(`inputs/spec-dp/cases-dp-1.json`, `inputs/spec-dp/next-task.json`).

- Errata R2-F01 obrigatória antes do source freeze: topologia declarada, delta do
  observador e autotestes.
- Carry-overs.
- Só artefatos do cache conferidos por sha. Sem binário em `docs/`.
- Sem PG, porta, rede, capability ou privilégio novo.
- Orçamento: 12 vagas (CONTROL primeiro, com MISMATCH), 12 serviços e 0 retries.

## O que verificar

1. **Resolução da R1.** Para cada achado de `review-r1/review.json`, a ação de
   `repair-r1.json` resolve o problema, ou o registra corretamente?
   - R1-F01: adendo `freeze-addendum-dp1.json` (DDP-12, EDP-09, DDP-13, herança
     corrigida, ligações por sha) e checagem por caso em `tools/post_review_checks.py` e
     `post-review-checks-dp1.json`.
   - R1-F02: autotestes de capacidade em `selftests/selftest_dp1_caps.py`,
     `selftests/selftest_dp1_caps_driver.mjs` e `selftests/selftest-caps-results.json`.
     Eles testam o que dizem? Algum é vácuo?
   - R1-F03: desvio DV3 e checagem das propriedades.
   - De R1-F04 a R1-F09: leituras, carry-overs e correções.
2. **Regressões.**
   - Algum arquivo congelado mudou? Recalcule `source-freeze-dp1.json`.
   - O reparo alterou algum desfecho?
   - `state.json`, `next-task.json`, `adjudication-dp1.json` e `case-results.json` estão
     coerentes entre si e com os `acceptance.json`?
3. **Registro honesto.**
   - Os desvios DV1 a DV4 estão bem descritos e marcados com aceite do Lead pendente?
   - O INVALID_CAPTURE do DP-PK07A segue adjudicado corretamente?
   - O status de fechamento é coerente com o resultado?
4. **Contenção e limites.**
   - Nada de rede, credencial ou capability.
   - Nenhum binário ELF, gzip ou zip em `docs/`.
   - 0 recibos funcionais e 0 crédito de paridade.

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 2,
  "task": "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1",
  "reviewer": "subagente novo, sem contexto herdado; somente leitura",
  "reviewed_at": "<ISO 8601>",
  "subject": "review-freeze-r2.json",
  "subject_sha256": "<sha conferido>",
  "subject_hash_check": { "before": "<ok|lista>", "after": "<ok|lista>" },
  "verdict": "APPROVE | REVISE",
  "summary_counts": "<n P1, n P2, n P3>",
  "r1_resolution": { "R1-F01": "<RESOLVED|PARTIAL|NOT_RESOLVED: motivo>" },
  "mandatory_findings": ["<ids P1/P2>"],
  "findings": [
    {
      "id": "R2-F01",
      "severity": "P1 | P2 | P3",
      "area": "<arquivo ou caso>",
      "title": "<uma linha>",
      "evidence": ["<arquivo:linha ou ponteiro JSON>"],
      "detail": "<o problema>",
      "required_action": "<o que corrigir>"
    }
  ],
  "checks_run": ["<o que você conferiu>"],
  "limits": "<o que não foi possível conferir>",
  "functional_receipts": 0,
  "parity_credit": 0
}
```

Severidade:

- **P1:** resultado falso, quebra de freeze, de orçamento, de contenção, de T3 ou de T4.
- **P2:** oráculo vácuo, registro incoerente que impede o BIND, errata obrigatória não
  aplicada.
- **P3:** melhoria.

APPROVE só com zero P1 e zero P2. Escreva em português.
