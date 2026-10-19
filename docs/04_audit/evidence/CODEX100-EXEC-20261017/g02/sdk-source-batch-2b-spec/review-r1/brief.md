# Revisão independente R1 — DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B

Você é o crítico independente desta unidade T1 documental. Não herdou contexto. Sua
tarefa é revisar a especificação do lote 2B e devolver um veredito em JSON. Você é
**somente leitura** no repositório: não crie, edite, mova nem apague nada dentro dele.
Sondas próprias, se precisar, ficam no seu diretório temporário e usam só a stdlib
(Python com `-I`, ou Node 22 em `/home/ricardo/.nvm/versions/node/v22.23.2/bin`).

Proibido: importar ou executar o SDK `openai_codex`, importar Pydantic, rodar
compilador, Codex CLI, serviço, rede, Docker ou PG, fazer commit, criar branch.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2b-spec/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r1.json` na pasta, sha256
  `ac30ad232074b6583be9d9e975cecf3a7768789938a3f6228159ad763f041913`. Confira o sha
  de cada arquivo listado antes e depois da revisão e registre o resultado.

## Contexto que você deve ler

- Pedido da unidade: especificar o lote 2B (PY01, PY02 só nos ramos não empacotados,
  PY09, PY11, PY12, PY13, PY17, PY18 e os resíduos de fonte de PY05, PY10, PY14 e
  PY08), dividido em sub-lotes de até 24 vagas e 12 serviços de qualificação, cada um
  com CONTROL e orçamento; contrato e DIAG de qualificação para cada capacidade nova de
  harness; valores esperados tirados da fonte do pin com âncoras de linha e sha; tudo
  herda o freeze r4 e o avaliador r4, com mudanças como deltas declarados; 0 recibos e
  0 crédito.
- Proposta de origem: `../sdk-source-batch-2a-continuation-spec/batch-2b-fit-assessment.json`
  e `next-task.json`; base de execução: `freeze-r4-contract.json`,
  `evaluator-r4-contract.json` e `control-slot-contract.json` da mesma pasta.
- Mapa de cobertura: `../sdk-batch-2a-binding/coverage-observed-v2.json`,
  `gaps-review-v2.json` e `HOW-next-step.md`.
- Formato a seguir: `../sdk-source-batch-2a-spec/**` (casos, peer v2, captura,
  avaliador r3, CONTROL, orçamento) e `../sdk-source-batch-2a-continuation-spec/**`.
- Contratos G01 autoritativos: `../../g01/sdk-open-contracts/python-contracts.json`,
  `payload-and-goal-facts.json` e `generated-boundaries.json`.
- Fontes do SDK no pin: `../sdk-reference-profile/inputs/sdk/python/src/openai_codex/**`
  (ligadas por `source-inputs.json`). Pydantic preparada:
  `/mnt/dados/cvg-work/cvg-codex100-batch2a-runtime-20261019/python-deps/**` (ligada
  por `../sdk-batch-2a-admission/identity-freeze-r3.json`, `trees/python-deps`).
  Stdlib do perfil: `/usr/lib/python3.12/**`.
- Harness atual (para viabilidade): `../sdk-batch-2a-admission/python/*.py`.
- Governança: `docs/07_agents/AGENTS.md` (D-12) e
  `docs/03_build/0384_plano_executivo_paridade_codex.md`.

## O que verificar

1. **Valores esperados contra a fonte.** Para cada caso de `cases-2b-1.json` e
   `cases-2b-2.json`, os resultados, erros, sondas, sequência de fio e ordens
   esperados decorrem do código do pin (e, onde declarado, da Pydantic preparada e da
   stdlib)? Procure em especial: mensagens exatas, ordem de chaves e bytes emitidos,
   prioridade de IDs, poda de cursores, quem acorda em cada fila, thread em que cada
   callback roda, aritmética de ponto flutuante do retry, defaults da Pydantic.
2. **Determinismo.** Algum caso depende de corrida não controlada pelas barreiras,
   sondas ou ganchos declarados? Algum passo pode bloquear para sempre (fora do
   watchdog), produzir PASS falso ou transformar falha de harness em MISMATCH?
3. **Âncoras.** Linha, sha e texto conferem e sustentam o que o caso afirma?
4. **Herança e deltas.** O freeze r4 e o avaliador r4 são herdados sem alteração
   silenciosa? Cada mudança está em `freeze-r4-2b-delta.json` ou
   `evaluator-r4-2b-delta.json`? A tabela de predicados e as classes evitam que falha
   de captura, barreira, shim ou fault vire MISMATCH?
5. **Capacidades novas.** As oito capacidades de `capability-contracts-2b.json`
   correspondem ao `batch-2b-fit-assessment.json`, têm contrato implementável e DIAG
   de qualificação adequado, e o DIAG está no orçamento de cada sub-lote que as usa?
   Alguma exige privilégio, capability nova do kernel ou toca contrato público do CVG
   (D-12)? Nesse caso, ela deveria ter sido retirada com uma pergunta T3.
6. **Orçamento e mínimos.** Até 24 vagas e 12 serviços por sub-lote, 1 CONTROL cada,
   mínimos por contrato do fit, vagas condicionais com gate verificável.
7. **Cobertura.** `coverage-plan-2b.json` liga cada caso às linhas certas, a projeção
   é coerente com o mapa v2 e nenhum requisito é dado como coberto por inteiro.
8. **Limites.** 0 recibos funcionais, 0 crédito de paridade, nada de rede, credencial,
   login real ou dado real; URLs sintéticas.
9. **Validador.** `validate-spec-2b.mjs.txt` e `validation.json`: os controles
   negativos testam o que dizem?

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B",
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
violação de limite ou de T3); P2 deve ser corrigido antes de liberar a execução
(ambiguidade que impede implementar, corrida não controlada, âncora que não sustenta a
afirmação, orçamento inconsistente); P3 é melhoria. APPROVE só com zero P1 e zero P2.
Escreva em português.
