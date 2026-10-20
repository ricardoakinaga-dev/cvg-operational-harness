# Revisão independente R1 — DX100-G02:BIND-SDK-SOURCE-BATCH-2B-2

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

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b2-binding/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r1.json`, sha256
  `aec231c3d05c450ff9d782666929da7c0f09cee094da89038ab4bbbc7a6229b1`. Confira o sha
  de cada arquivo listado antes e depois da revisão.
- As pastas `g02` estão não rastreadas no checkout da `main`. O passo 0
  (`input-verification.json`) confere por sha e por blob git contra os commits de
  origem e contra o commit `7e1da11a` do PR documental #7 do Lead, que está na ref
  `origin/candidate/d9ef-docs-20261019`.

## O pedido

Ligar ao mapa de cobertura as 17 observações do sub-lote 2B-2, em
`../sdk-batch-2b2-admission/` (admissão aprovada na R1):

- Produzir `coverage-observed-v5.json` ao lado do v4
  (`../sdk-batch-2b1-binding/coverage-observed-v4.json`, que não pode ser editado).
- Consumir só os casos de `adjudication-r1.json#/bind_consumes_only` e, em cada caso,
  só as partes distinguidas segundo `discrimination-check-2b2.json`: o PY13.B06 não é
  distinguido e os 8 braços PARTIAL_SCOPE entram só na parte observada.
- Aplicar a decisão do Lead `lead-decision-f01.json`: o 2B-PY13E não ganha crédito
  pela discriminação do known_bad "pular o cleanup".
- Aplicar os carry-overs do BIND do 2B-1
  (`../sdk-batch-2b1-binding/review-r2/executor-disposition.json`): R2-F01 (ligação
  do PY12.B03), R2-F02 (redação do PY02.B02 e do PY02.B07) e R2-F03 (validador: todo
  não observado nos acréscimos do resto, com rótulo no destino; sha das bases de fonte
  contra a identity freeze).
- Revisar as seis lacunas (`gaps-review-v5.json`).
- Escrever `HOW-next-profile-v2.md`: o que resta depois do perfil de fonte; para o
  perfil distribuído (PY19, PY20, PK01–PK09 e o ramo empacotado do PY02), as decisões
  do usuário que ele exige (identidade dos artefatos frente ao pin, aquisição com
  rede, recorte keyless), cada uma como pergunta T3/T4 pronta em uma frase simples; e
  os resíduos de fonte que cabem sem decisão nova.
- Limites: 0 recibos funcionais, 0 crédito de paridade, nenhuma linha cobrindo o
  requisito inteiro.

## O que verificar

1. **Consumo:** só os 17 casos SDK, com leitura e atribuição da adjudicação, o
   CONTROL fora, e ponteiros e sha certos.
2. **Status por linha:** PY09, PY13, PY17 e PY18 passam a observadas; PY14 só ganha
   observações; as demais ficam como no v4. Contagens 33/11.
3. **Braços:** cada braço segue a tabela de discriminação (68 DISCRIMINATED, 8
   PARTIAL_SCOPE, 1 NOT_DISCRIMINATED). Confira se a evidência ligada a cada braço
   existe no `acceptance.json` e sustenta o texto do braço; se algum braço DISCRIMINATED
   da tabela afirma mais do que o caso distingue (aplique os padrões listados em
   `discrimination-check-2b2.json#/patterns_checked`); se os escopos parciais saíram
   fiéis do texto da tabela; e se as qualificações (decisão F01, falhas injetadas,
   relógio controlado, ordem forçada, PY17.B04) estão certas.
4. **Herança do v4:** `carried_from_v4` igual à linha do v4, salvo as erratas
   declaradas.
5. **O que continua aberto:** acréscimos, `remaining_open_by_contract` e destinos.
6. **Lacunas** e a conferência da projeção do v4.
7. **HOW v2:** os fatos citados (versões, pin, binário atestado, contratos) batem com
   as fontes? As perguntas são simples, cada uma em uma frase, com nível T3/T4
   coerente com `docs/07_agents/AGENTS.md`? A lista do que cabe sem decisão nova está
   completa e não inclui item que precise de decisão?
8. **Próxima unidade, validador e passo 0:** `next-task.json`,
   `validate-binding-2b2.mjs.txt`, `validation.json` e `input-verification.json`
   testam o que dizem?

## Formato da resposta

Devolva **apenas** um objeto JSON:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:BIND-SDK-SOURCE-BATCH-2B-2",
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
inconsistente, afirmação além da observação, pergunta errada ou incompleta); P3 é
melhoria. APPROVE só com zero P1 e zero P2. Escreva em português.
