# Revisão independente R1 — DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3

Você é o crítico independente desta unidade T1 documental. Não herdou contexto. Sua
tarefa é revisar a especificação da continuação 3 do perfil de fonte do SDK e devolver
um veredito em JSON. Você é **somente leitura** no repositório: não crie, edite, mova
nem apague nada dentro dele. Sondas próprias, se precisar, ficam no seu diretório
temporário e usam só a stdlib (Python com `-I`, ou Node 22 em
`/home/ricardo/.nvm/versions/node/v22.23.2/bin`).

Proibido: importar ou executar o SDK `openai_codex` ou `@openai/codex-sdk`, importar
Pydantic ou packaging, rodar compilador, Codex CLI, serviço, rede, Docker ou PG, fazer
commit, criar branch ou worktree.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r1.json` na pasta, sha256
  `6caeaec5ce07f5d5faa3da153fdb286c26c55287258d6967604b24a6ba5c01f1`. Confira o sha
  de cada arquivo listado antes e depois da revisão e registre o resultado.

## Pedido da unidade

Especificar a continuação 3 do perfil de fonte, com o escopo do HOW v2: a segunda
continuação 2A (TS01 a TS15, PY03, PY04, PY15, PY16) e a continuação do 2B (PY02, PY05,
PY08, PY10, PY12, PY13, PY14, PY17, PY18), **só com o que não exige decisão nova**. A
errata das perguntas Q1–Q5 do BIND do 2B-2 prevalece sobre o HOW. Formato e regras
iguais aos da especificação 2B:

- casos congelados com valores da fonte do pin e âncoras de linha, sha e texto;
- um CONTROL por sub-lote;
- no máximo 24 vagas e 12 serviços de qualificação por sub-lote;
- mudanças sobre o freeze r4 e o avaliador r4 só como deltas declarados;
- 0 recibos funcionais e 0 crédito de paridade.

Nada que exija capacidade nova de harness, rede ou artefato distribuído: esses itens
ficam explicitamente fora, apontando para as perguntas Q1–Q5 quando são de decisão.

## Contexto que você deve ler

- Escopo e perguntas: `../sdk-batch-2b2-binding/HOW-next-profile-v2.md` (seção "O que
  cabe sem decisão nova"), `../sdk-batch-2b2-binding/coverage-observed-v5.json`
  (`remaining_open_by_contract`, `arms_open_explicit_v5` e `rows[*].residual_planned_profile_proposal`)
  e `../sdk-batch-2b2-binding/review-r2/executor-disposition.json` (`items[id=R2-F01]`:
  `erratum_questions` e `erratum_table`).
- Formato a seguir: `../sdk-source-batch-2b-spec/**` (casos Python, deltas
  `freeze-r4-2b-delta.json` e `evaluator-r4-2b-delta.json`, CONTROL, orçamento, T3) e
  `../sdk-source-batch-2a-spec/cases-2a.json` mais
  `../sdk-source-batch-2a-continuation-spec/**` (casos TypeScript, freeze r4 e avaliador r4).
- Vocabulário admitido dos drivers (para viabilidade dos deltas):
  `../sdk-batch-2ac-admission/node/ts-driver.mjs` e `fixture-cli.mjs` (TypeScript) e
  `../sdk-batch-2b2-admission/python/python-driver.py` e `harness2b.py` (Python);
  carry-over e decisão: `../sdk-batch-2b2-admission/state.json#/carry_over_next` e
  `../sdk-batch-2b2-admission/lead-decision-f01.json`.
- Fontes do SDK no pin: `../sdk-reference-profile/inputs/sdk/typescript/src/**` e
  `../sdk-reference-profile/inputs/sdk/python/src/openai_codex/**`. packaging preparado:
  `/mnt/dados/cvg-work/cvg-codex100-batch2b2-runtime-20261019/python-deps/packaging/version.py`
  (ligado por `../sdk-batch-2a-admission/identity-freeze-r3.json`). Stdlib do perfil:
  `/usr/lib/python3.12/**`.
- Contratos G01: `../../g01/sdk-open-contracts/typescript/contracts.json` (braços TS) e
  `../../g01/sdk-open-contracts/python-contracts.json`.
- Governança: `docs/07_agents/AGENTS.md` (D-12).

## O que verificar

1. **Valores esperados contra a fonte.** Em `cases-c3-1.json` (TypeScript) e
   `cases-c3-2.json` (Python), os resultados, erros, argv, env, sondas, sequência de fio
   e ordens esperados decorrem do código do pin? Atenção a: mensagens exatas do V8 e do
   Node (marcadas em `version_dependent`), bytes do argv com caracteres de controle,
   ordem das flags, leitura preguiçosa das opções, Object.entries com getter e chave não
   enumerável, AbortError do child_process, cursores de turn e poda, prioridade do
   interrupt, duração lógica do goal, roteamento de login, defaults dos modelos gerados,
   normalização de versão.
2. **Discriminação.** Cada braço mirado tem em `arm_discrimination` um passo cujo
   resultado muda se o ramo contrário fosse o real, julgado por predicado de classe
   client? Algum braço é afirmado sem discriminar (como PY05.B10 e PY13.B06 no 2B)?
3. **Determinismo.** Algum caso depende de corrida não controlada? Algum passo pode
   bloquear para sempre, produzir PASS falso ou transformar falha de harness em
   MISMATCH? Confira em especial C3-TS04, C3-TS12, C3-PY08, C3-PY12 e C3-PY13ER.
4. **Âncoras.** Linha, sha e texto conferem e sustentam o que o caso afirma?
5. **Escopo e fora de escopo.** `coverage-plan-c3.json#/residuals` classifica todo
   resíduo do escopo? Algum item IN exige, na verdade, capacidade nova de harness, rede
   ou artefato distribuído? Algum item OUT caberia sem decisão nova? Os OUT de decisão
   apontam para as perguntas certas da errata?
6. **Herança e deltas.** O freeze r4, o delta 2B e o avaliador r4 são herdados sem
   alteração silenciosa? Cada mudança está em `freeze-r4-c3-delta.json` ou
   `evaluator-r4-c3-delta.json`? A interpretação "vocabulário e marcadores são deltas,
   mecanismo novo é capacidade nova" se sustenta para cada D3?
7. **CONTROL, orçamento e T3.** CONTROL por cópia fiel, 24/12 por sub-lote, vagas
   condicionais com gate verificável, `t3-assessment.json` coerente.
8. **Réplicas.** C3-PY13F e C3-PY13ER mudam só o declarado em `replay_of.changed_fields`?
   A errata T1 das esperas do C3-PY13ER faz o known_bad "pular o cleanup" virar
   MISMATCH sem abrir caminho a MISMATCH falso?
9. **Limites.** 0 recibos funcionais, 0 crédito de paridade; nada de rede, credencial,
   login real ou dado real; URLs sintéticas.
10. **Validador.** `validate-spec-c3.mjs.txt` e `validation.json`: os controles
    negativos testam o que dizem?

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3",
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
afirmação, braço sem discriminação, item fora de escopo dentro da especificação,
orçamento inconsistente); P3 é melhoria. APPROVE só com zero P1 e zero P2. Escreva em
português.
