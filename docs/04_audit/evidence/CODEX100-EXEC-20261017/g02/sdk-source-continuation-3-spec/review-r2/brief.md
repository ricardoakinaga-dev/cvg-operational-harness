# Revisão independente R2 — DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3

Você é o crítico independente da segunda e última rodada desta unidade T1 documental.
Não herdou contexto. Você é **somente leitura** no repositório: não crie, edite, mova
nem apague nada dentro dele. Sondas próprias, se precisar, ficam no seu diretório
temporário e usam só a stdlib (Python com `-I`, ou Node 22 em
`/home/ricardo/.nvm/versions/node/v22.23.2/bin`).

Proibido: importar ou executar o SDK `openai_codex` ou `@openai/codex-sdk`, importar
Pydantic ou packaging, rodar compilador, Codex CLI, serviço, rede, Docker ou PG, fazer
commit, criar branch ou worktree.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r2.json` na pasta, sha256
  `ebc9a90615b68542e2851f043bf150e63020d2a6d64931198561ab30fc7b4e61`. Confira o sha
  de cada arquivo listado antes e depois da revisão e registre o resultado.
- A R1 (`review-r1/review.json`, texto sem edição em `review-r1/verdict.raw.txt`) deu
  REVISE com 2 P2 e 7 P3. O reparo agrupado único está em `repair-r1.json`, com as
  preimagens em `archives/r1-preimages/`. Não há outro reparo depois desta rodada.

## Pedido da unidade (resumo)

Especificar a continuação 3 do perfil de fonte do SDK com o que não exige decisão nova
(escopo do HOW v2 em `../sdk-batch-2b2-binding/HOW-next-profile-v2.md`, com a errata
Q1–Q5 de `../sdk-batch-2b2-binding/review-r2/executor-disposition.json` prevalecendo):
casos congelados com valores da fonte do pin e âncoras, CONTROL por sub-lote, até 24
vagas e 12 serviços por sub-lote, deltas declarados sobre o freeze r4 e o avaliador
r4, 0 recibos e 0 crédito. Nada que exija capacidade nova de harness, rede ou
artefato distribuído; esses itens ficam fora, apontando para Q1–Q5 quando são de
decisão.

## O que verificar

1. **Cada achado da R1.** Para R1-F01 a R1-F09, o reparo resolve o problema
   (RESOLVED), resolve em parte (PARTIAL) ou não resolve (OPEN)? Em especial:
   - R1-F01: com `zero_calls_client_effect_unless_started` (E3-07) e as esperas
     `CLIENT_EFFECT_UNLESS_ALIVE` (D3-05), o known_bad "pular o cleanup" do C3-PY13ER
     termina em MISMATCH sem abrir caminho a MISMATCH falso (cleanup lento, fault com
     contagem errada)?
   - R1-F02: a testemunha por getter do driver (D3-03, `$GETTER` com witness) mostra a
     criação do diretório antes do erro no C3-TS03 e no C3-TS05? O getter é de fato
     lido pelo SDK naquele ponto (ordem do JSON.stringify e do Object.entries na fonte
     do pin)? É extensão de vocabulário, como a unidade afirma, ou mecanismo novo?
2. **Regressões do reparo.** Os casos alterados (C3-TS03, C3-TS04, C3-TS05, C3-TS12,
   C3-PY13ER, C3-PY15A, C3-PY17) seguem corretos contra a fonte do pin, com âncoras,
   discriminação por braço e determinismo? O reparo mudou algo fora do declarado em
   `repair-r1.json`?
3. **Consistência geral.** Casos, plano de cobertura (`coverage-plan-c3.json`),
   deltas (`freeze-r4-c3-delta.json`, `evaluator-r4-c3-delta.json`), CONTROL,
   orçamentos, T3, `state.json` e `next-task.json` estão coerentes entre si e com o
   validador (`validate-spec-c3.mjs.txt`, `validation.json`)?
4. **Limites.** 0 recibos funcionais, 0 crédito de paridade; nada de rede, credencial,
   login real ou dado real.

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 2,
  "task": "DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3",
  "reviewer": "subagente novo, sem contexto herdado; somente leitura",
  "reviewed_at": "<ISO 8601>",
  "subject": "review-freeze-r2.json",
  "subject_sha256": "<sha conferido>",
  "subject_hash_check": { "before": "<ok|lista>", "after": "<ok|lista>" },
  "verdict": "APPROVE | REVISE",
  "summary_counts": "<n P1, n P2, n P3>",
  "mandatory_findings": ["<ids P1/P2>"],
  "r1_findings_status": [
    {
      "id": "R1-F01",
      "status": "RESOLVED | PARTIAL | OPEN",
      "note": "<uma linha>"
    }
  ],
  "findings": [
    {
      "id": "R2-F01",
      "severity": "P1 | P2 | P3",
      "area": "<caso ou documento>",
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

Severidade: P1 bloqueia (valor esperado errado que geraria MISMATCH falso, PASS falso,
violação de limite ou de T3); P2 deve ser corrigido antes de liberar a execução; P3 é
melhoria. APPROVE só com zero P1 e zero P2. Escreva em português.
