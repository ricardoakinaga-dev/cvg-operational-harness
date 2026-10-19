# Revisão independente R1 — DX100-G02:BIND-SDK-SOURCE-BATCH-2A-CONTINUATION

Você é o crítico independente desta unidade T1 documental. Não herdou contexto. Você é
**somente leitura** no repositório: não crie, edite, mova nem apague nada dentro dele.
Sondas próprias, se precisar, ficam no seu diretório temporário e usam só a stdlib
(Python com `-I`, ou Node 22 em `/home/ricardo/.nvm/versions/node/v22.23.2/bin`). Não
rode os scripts da unidade dentro do repositório, porque eles escrevem na pasta; se
quiser reproduzi-los, copie a pasta para o seu diretório temporário e ajuste o destino.

Proibido: importar ou executar o SDK, rodar compilador, Codex CLI, serviço, rede,
Docker ou PG, fazer commit, criar branch.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2ac-binding/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r1.json`, sha256
  `ca6510d4ee0c0ecec09bd01807f49e704be45fa82b76a38875d87eaef8e13d7f`. Confira o sha
  de cada arquivo listado antes e depois da revisão.
- As pastas `g02` estão não rastreadas no checkout da `main`; o passo 0
  (`input-verification.json`) confere por sha e por blob git contra os commits de
  origem.

## O pedido

Ligar ao mapa de cobertura as observações da continuação 2A, em
`../sdk-batch-2ac-admission/` (admissão aprovada na R2):

- Produzir `coverage-observed-v3.json` ao lado do v2
  (`../sdk-batch-2a-binding/coverage-observed-v2.json`, que não pode ser editado).
- Consumir só os 8 casos de `adjudication-r1.json#/bind_consumes_only`.
- Aplicar a `replacement_rule` de
  `inputs/spec-2ac/coverage-plan-2a-cont.json`.
- Fechar os braços OPEN que esses casos cobrem (TS03, TS05, TS06, TS07, TS12.B01,
  TS10.B04 e os ramos de TS06X, TS07X e TS08X) e registrar o que continua aberto.
- Revisar as seis lacunas (`gaps-review-v3.json`).
- Atualizar a projeção do 2B-1 e do 2B-2 sobre o v3 (`projection-2b-on-v3.json`).
- Limites: 0 recibos funcionais, 0 crédito de paridade, nenhuma linha cobrindo o
  requisito inteiro.

A proposta da unidade está em `../sdk-batch-2ac-admission/next-task.json`. Siga em
especial o `carry_over`: a leitura final vem da adjudicação; a errata E7 é
registrada; o 2A-TS12 segue não consumido; a origem do EPIPE no TS10.B04 é inferida.

## O que verificar

1. **Consumo:** só os 8 casos, com leitura e atribuição tiradas da adjudicação, o
   CONTROL fora, e ponteiros e sha certos para os `acceptance.json`.
2. **Status por linha:** a `replacement_rule` aplicada como o plano manda. As linhas
   TS03, TS05, TS06 e TS07 passam a observadas e as demais ficam como no v2.
   Contagens 25/19.
3. **Braços:** cada um dos 14 braços OPEN do v2 fechado com caso e tipo de casamento
   corretos (exato ou mesmo identificador). Confira contra os `branches_targeted` de
   `cases-2a-cont.json` e o que de fato foi observado nos `acceptance.json`. Veja se
   algum fechamento afirma mais do que o caso observou (TS12.B01: término do filho
   NOT_WITNESSED; TS10.B04: injeção de falha e origem inferida).
4. **O que continua aberto:** `remaining_after_continuation` por linha, resíduos das
   linhas fora do plano e o 2A-TS12 não consumido.
5. **Lacunas:** contagens por lacuna; todas seguem OPEN com justificativa.
6. **Projeção do 2B:** coerente com o v3 e com `coverage-plan-2b.json`, incluindo a
   variante sem o DIAG-PY-PROCWITNESS.
7. **Próxima unidade:** `next-task.json` coerente com o 2B, com a decisão do Lead
   sobre o R2-F01 (`../sdk-source-batch-2b-spec/lead-decision-r2-f01.json`) e com o
   carry-over da admissão.
8. **Validador e passo 0:** `validate-binding-2ac.mjs.txt`, `validation.json` e
   `input-verification.json` testam o que dizem?

## Formato da resposta

Devolva **apenas** um bloco JSON:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:BIND-SDK-SOURCE-BATCH-2A-CONTINUATION",
  "reviewer": "subagente novo, sem contexto herdado; somente leitura",
  "reviewed_at": "<ISO 8601>",
  "subject": "review-freeze-r1.json",
  "subject_sha256": "<sha conferido>",
  "subject_hash_check": { "before": "<ok|lista>", "after": "<ok|lista>" },
  "verdict": "APPROVE | REVISE",
  "summary_counts": "<n P1, n P2, n P3>",
  "mandatory_findings": ["<ids P1/P2>"],
  "findings": [
    {
      "id": "R1-F01",
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

Severidade: P1 bloqueia (crédito indevido, status ou braço errado, violação de
limite); P2 deve ser corrigido antes de fechar (ponteiro ou sha errado, contagem
inconsistente, afirmação além da observação); P3 é melhoria. APPROVE só com zero P1
e zero P2. Escreva em português.
