# Revisão independente R2 — DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B

Você é o crítico independente da segunda e última rodada desta unidade T1 documental.
Não herdou contexto. Você é **somente leitura** no repositório: não crie, edite, mova
nem apague nada dentro dele. Sondas próprias, se precisar, ficam no seu diretório
temporário e usam só a stdlib (Python com `-I`, ou Node 22 em
`/home/ricardo/.nvm/versions/node/v22.23.2/bin`).

Proibido: importar ou executar o SDK `openai_codex`, importar Pydantic, rodar
compilador, Codex CLI, serviço, rede, Docker ou PG, fazer commit, criar branch.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2b-spec/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r2.json`, sha256
  `d64e6a10525475ad037630e095f2717ddf41575796a787bb3c039a36970af5b7`. Confira o sha
  de cada arquivo listado antes e depois da revisão.
- A R1 deu REVISE com 7 P2 e 9 P3: `review-r1/review.json` (texto do crítico sem
  edição em `review-r1/verdict.raw.txt`). O reparo agrupado único está em
  `repair-r1.json`; as preimagens da R1 estão em `archives/r1-preimages/`.

## Contexto

O pedido, as fontes e as regras são os mesmos da R1 (veja `review-r1/brief.md`): lote
2B em sub-lotes de até 24 vagas e 12 serviços com CONTROL e orçamento próprios,
contrato e DIAG para cada capacidade nova, valores esperados tirados da fonte do pin
com âncoras de linha e sha, herança do freeze r4 e do avaliador r4 com deltas
declarados, 0 recibos e 0 crédito, e retirada com pergunta T3 de qualquer capacidade
que exija privilégio, capability nova do kernel ou toque contrato público do CVG.

## O que verificar

1. **Cada achado da R1.** Para R1-F01 a R1-F16, o reparo resolve de fato o problema,
   no caso, no contrato e no validador, como `repair-r1.json` afirma? Diga
   RESOLVED, PARTIAL ou OPEN, com evidência.
2. **Regressões.** Compare com `archives/r1-preimages/`. O reparo mudou algum valor
   esperado de cliente sem declarar? Quebrou âncora, case_input_sha256, numeração de
   passos, orçamento, infra derivada ou cobertura? Criou contradição entre
   `capability-contracts-2b.json`, `freeze-r4-2b-delta.json`,
   `evaluator-r4-2b-delta.json`, casos e validador?
3. **Novos problemas** que a R1 não viu, com o mesmo rigor: valores esperados contra a
   fonte, corridas, bloqueios, PASS falso, falha de harness que vire MISMATCH, limites
   e T3.

## Formato da resposta

Devolva **apenas** um bloco JSON:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 2,
  "task": "DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B",
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
      "note": "<evidência>"
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

Severidade como na R1: P1 bloqueia; P2 deve ser corrigido antes de liberar a
execução; P3 é melhoria. APPROVE só com zero P1 e zero P2. Como esta é a última
rodada e o único reparo já foi usado, P3 vira carry-over para a IMPLEMENT. Escreva em
português.
