# Revisão independente R2 — DX100-G02:BIND-SDK-SOURCE-BATCH-2B-1

Você é o crítico independente da segunda e última rodada desta unidade T1 documental.
Não herdou contexto. Você é **somente leitura** no repositório: não crie, edite, mova
nem apague nada dentro dele. Sondas próprias, se precisar, ficam no seu diretório
temporário e usam só a stdlib (Python com `-I`, ou Node 22 em
`/home/ricardo/.nvm/versions/node/v22.23.2/bin`). Não rode os scripts da unidade
dentro do repositório, porque eles escrevem na pasta; para reproduzi-los, copie para o
seu diretório temporário. `git` só de leitura.

Proibido: importar ou executar o SDK, rodar compilador, Codex CLI, serviço, rede,
Docker ou PG, fazer commit, criar branch.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b1-binding/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r2.json`, sha256
  `2c5d4b2fab8393cea7ab1687e503e844d12c7c8d9ca55341070c92aa0bef1e6e`. Confira o sha
  de cada arquivo listado antes e depois da revisão.
- A R1 deu REVISE com 3 P2 e 6 P3. O veredito está em `review-r1/review.json`, e o
  texto do crítico, sem edição, em `review-r1/verdict.raw.txt`. O reparo agrupado
  único está em `repair-r1.json`, e as preimagens em `archives/r1-preimages/`.

## Contexto

O pedido e as fontes são os mesmos da R1 (veja `review-r1/brief.md`):

- ligar as 15 observações do 2B-1 num `coverage-observed-v4.json`, ao lado do v3,
  que fica intocado;
- aplicar a errata 2AC-BIND/R2-F01 e os carry-overs 2AC-BIND/R2-F02 e R2-F05;
- revisar as seis lacunas;
- projetar o 2B-2 sobre o v4;
- não criar recibo funcional nem crédito de paridade.

## O que verificar

1. **Cada achado da R1:** para R1-F01 a R1-F09, diga se o reparo resolve de fato, no
   mapa, nas lacunas, na projeção, no validador e no fechamento, como
   `repair-r1.json` afirma. Responda RESOLVED, PARTIAL ou OPEN, com evidência.
2. **Regressões:** compare com `archives/r1-preimages/`. Confira se status,
   contagens, braços, lacunas ou números da projeção mudaram sem declaração, e se o
   reparo criou contradição entre os documentos.
3. **Problemas novos:** procure com o mesmo rigor, em especial braço ou escopo que
   afirme mais do que os `acceptance.json` e a fonte do SDK permitem, e bases de
   escopo (`not_observed_basis`, `basis`) que não sustentem o que dizem.

## Formato da resposta

Devolva **apenas** um objeto JSON:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 2,
  "task": "DX100-G02:BIND-SDK-SOURCE-BATCH-2B-1",
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
      "area": "<linha ou documento>",
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

As severidades são as mesmas da R1. Só dê APPROVE com zero P1 e zero P2. Esta é a
última rodada e o único reparo já foi usado, então P3 vira carry-over. Escreva em
português.
