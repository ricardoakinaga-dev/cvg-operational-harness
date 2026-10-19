# Revisão independente R1 — DX100-G02:BIND-SDK-SOURCE-BATCH-2B-1

Você é o crítico independente desta unidade T1 documental. Não herdou contexto. Você é
**somente leitura** no repositório: não crie, edite, mova nem apague nada dentro dele.
Sondas próprias, se precisar, ficam no seu diretório temporário e usam só a stdlib
(Python com `-I`, ou Node 22 em `/home/ricardo/.nvm/versions/node/v22.23.2/bin`). Não
rode os scripts da unidade dentro do repositório, porque eles escrevem na pasta; se
quiser reproduzi-los, copie a pasta para o seu diretório temporário e ajuste o destino.
`git` só de leitura (`log`, `ls-tree`, `hash-object` sem `-w`, `for-each-ref`).

Proibido: importar ou executar o SDK, rodar compilador, Codex CLI, serviço, rede,
Docker ou PG, fazer commit, criar branch.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b1-binding/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r1.json`, sha256
  `e5fc2405ce18c79a8b78d1bf4e689141f7fc2cda92d68d1a2e5a716cc7c8b7e2`. Confira o sha
  de cada arquivo listado antes e depois da revisão.
- As pastas `g02` estão não rastreadas no checkout da `main`. O passo 0
  (`input-verification.json`) confere por sha e por blob git contra os commits de
  origem e contra o commit do PR documental do Lead (`1353e1bd`), que o Lead definiu
  como âncora durável.

## O pedido

Ligar ao mapa de cobertura as 15 observações do sub-lote 2B-1, em
`../sdk-batch-2b1-admission/` (admissão aprovada na R1):

- Produzir `coverage-observed-v4.json` ao lado do v3
  (`../sdk-batch-2ac-binding/coverage-observed-v3.json`, que não pode ser editado).
- Consumir só os casos de `adjudication-r1.json#/bind_consumes_only`; leitura final,
  atribuição e regra de consumo vêm da adjudicação, nunca dos `acceptance.json`.
- Aplicar a `status_rule` de `inputs/spec-2b/coverage-plan-2b.json` às linhas do 2B-1.
- Aplicar a errata 2AC-BIND/R2-F01 (texto do braço TS07.B03 do 2A-TS07R) e os
  carry-overs 2AC-BIND/R2-F02 (o validador confere conteúdo, não só presença) e
  2AC-BIND/R2-F05 (destino do término do filho no TS12), todos em
  `../sdk-batch-2ac-binding/review-r2/executor-disposition.json`.
- Revisar as seis lacunas (`gaps-review-v4.json`).
- Atualizar a projeção do 2B-2 sobre o v4 (`projection-2b2-on-v4.json`).
- Limites: 0 recibos funcionais, 0 crédito de paridade, nenhuma linha cobrindo o
  requisito inteiro.

Siga o `carry_over` de `../sdk-batch-2b1-admission/next-task.json`: as formas
CLIENT_TERMINATED_SIGTERM e CLIENT_KILLED_SIGKILL são declaradas pelos casos, com
testemunha do SO e do canal; o returncode do Popen é fato do cliente.

## O que verificar

1. **Consumo:** só os 15 casos SDK, com leitura e atribuição da adjudicação, o
   CONTROL fora, as vagas condicionais usadas, e ponteiros e sha certos.
2. **Status por linha:** PY01, PY02, PY11 e PY12 passam a observadas; PY05, PY08 e
   PY10 só ganham observações; as linhas do 2B-2 e as demais ficam como no v3.
   Contagens 29/15.
3. **Braços:** cada braço mirado pelos casos consumidos (`branches_targeted` de
   `inputs/spec-2b/cases-2b-1.json`). Confira se a evidência ligada a cada braço
   (predicado, chaves de probe, passos, tokens, ganchos, consumidores) existe no
   `acceptance.json` e se sustenta o texto do braço. Procure braço que afirme mais do
   que o caso observou. O executor deixou o PY05.B10 aberto como não discriminado e
   restringiu o escopo do PY05.B06; confira contra `py/client.py` do perfil de
   referência (`../sdk-reference-profile/inputs/sdk/python/src/openai_codex/client.py`)
   e o `case_input` do 2B-PY05X. Confira também as qualificações (falha declarada do
   PY02.B08, janela do PY08.B07, ordem forçada do PY10.B04, lançador do PY02.B06, env
   sem ordem).
4. **Herança do v3:** `carried_from_v3` igual à linha do v3, salvo as duas erratas
   declaradas; texto da errata igual ao da disposição; destino novo do TS12.
5. **O que continua aberto:** `remaining_after_2b1` e acréscimos por linha,
   `remaining_open_by_contract`, destinos (`residual_planned_profile_proposal`) e o
   rótulo SOURCE_BATCH_2B_2 nas linhas do 2B-2.
6. **Lacunas:** contagens por lacuna; todas seguem OPEN com justificativa.
7. **Projeção do 2B-2:** coerente com o v4 e com `coverage-plan-2b.json`; conferência
   contra `../sdk-batch-2ac-binding/projection-2b-on-v3.json`.
8. **Próxima unidade:** `next-task.json` coerente com a especificação 2B, com o
   carry-over obrigatório da admissão (`state.json#/carry_over_2b2`) e com o que este
   BIND achou.
9. **Validador e passo 0:** `validate-binding-2b1.mjs.txt`, `validation.json` e
   `input-verification.json` testam o que dizem? Em particular, o validador confere
   conteúdo (2AC-BIND/R2-F02)?

## Formato da resposta

Devolva **apenas** um objeto JSON:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:BIND-SDK-SOURCE-BATCH-2B-1",
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
