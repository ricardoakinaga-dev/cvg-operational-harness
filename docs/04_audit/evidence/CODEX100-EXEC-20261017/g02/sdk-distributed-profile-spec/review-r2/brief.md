# Revisão independente R2 — DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS

Você é o crítico independente da segunda e última rodada desta unidade T1 documental.
Não herdou contexto e não é o crítico da R1. Sua tarefa é revisar a especificação do
perfil distribuído keyless do SDK depois do reparo agrupado e devolver um veredito em
JSON. Você é **somente leitura** no repositório: não crie, edite, mova nem apague nada
dentro dele. Sondas próprias, se precisar, ficam no seu diretório temporário e usam só
a stdlib (Python com `-I`, ou Node 22 em `/home/ricardo/.nvm/versions/node/v22.23.2/bin`).

Proibido:

- importar ou executar o SDK `openai_codex`, `@openai/codex-sdk`, os wrappers
  `bin/codex.js` e `bin/codex-responses-api-proxy.js` ou qualquer binário;
- extrair os arquivos compactados do cache para disco ou executar qualquer coisa vinda
  deles. Leia os membros só em memória (`tarfile` e `zipfile` do Python com `-I`, ou
  `zlib` do Node);
- importar Pydantic ou packaging;
- rodar compilador, Codex CLI, serviço, rede, Docker ou PG;
- fazer commit, criar branch ou worktree.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-spec/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Congelamento: `review-freeze-r2.json` na pasta, sha256
  `21a936e008aabfa8f52498d7d9bfa54e9e9ba8404c23621d93c4ae365ff8cc6d`. Confira o sha
  de cada arquivo listado antes e depois da revisão e registre o resultado.
- Histórico:
  - veredito da R1 em `review-r1/review.json` (REVISE, 2 P1, 8 P2, 5 P3);
  - reparo agrupado único em `repair-r1.json`, com a ação de cada achado e o sha antes
    e depois de cada arquivo;
  - preimagens em `archives/r1-preimages/`.
- Não há outro reparo depois desta rodada. Achados P1 ou P2 seus vão para a disposição
  do executor e para o Lead.

## Pedido da unidade

Especificar o perfil distribuído keyless: PY19, PY20, PK01 a PK09 e o ramo empacotado
do PY02.

- Só com os artefatos do cache ligados por sha, em linux-x64 e dentro da contenção
  atual.
- Sem rede, provider, credencial nem capability nova. O staging dos pacotes fica fora
  de `docs/`.
- O pin é 0.153.4, sem vínculo de build: `NO_BUILD_LINK_DECLARED` em todo resultado.
- O que depende do A6 (pacote `openai-codex` 0.153.4, NOT_AVAILABLE), de login real,
  de turn real ou de modelo fica explicitamente fora, com destino (gate T4 ou
  NOT_AVAILABLE).
- Formato igual ao das especificações anteriores:
  - casos congelados com valores e âncoras;
  - um CONTROL por sub-lote;
  - no máximo 24 vagas e 12 serviços de qualificação por sub-lote;
  - deltas declarados sobre o freeze e o avaliador;
  - 0 recibos funcionais e 0 crédito de paridade.

## Decisões em vigor

- Do usuário, em `../sdk-batch-2b2-binding/user-decision-distributed-profile-20261019.json`:
  - Q1: release 0.153.4 como pin separado;
  - Q2: uma aquisição única, já feita;
  - Q3: só keyless;
  - Q4: capability nova negada.
- Do Lead, em `../sdk-distributed-acquisition/lead-decision-loopback-a5.json`: o
  servidor de loopback para o A5 é permitido como peer sintético. A especificação
  declara que não o usa e diz por quê.
- A leitura de "capability nova" no sentido da Q4 está em
  `capability-contracts-dp.json#/interpretation`, marcada para confirmação do Lead. Não
  a reabra como achado se o regime de capacidade do 2B estiver cumprido; aponte só se
  ele não estiver.

## Contexto que você deve ler

- **Aquisição.** Em `../sdk-distributed-acquisition/`: `acquisition-ledger.json`
  (inclui o metadado M7), `artifact-metadata.json`, `digest-verification.json` e
  `HOW-distributed-profile.md`.
- **Cache, só leitura.** Fica em
  `/mnt/dados/cvg-work/cvg-codex100-distributed-cache-20261019/` (`artifacts/<A1..A7>/` e
  `metadata/`). Cada `inputs[*]` dos casos traz `cache_archive` e `member`, ou
  `cache_file`, com o sha.
- **Escopo.**
  - `../sdk-batch-2b2-binding/coverage-observed-v5.json`: linhas PY19, PY20, PK01 a
    PK09 e PY02, e `remaining_open_by_contract`.
  - Contratos G01: `../../g01/sdk-open-contracts/typescript/contracts.json` (braços PK
    e suas condições) e `../../g01/sdk-open-contracts/python-contracts.json`.
- **Formato e vocabulário admitido.**
  - `../sdk-source-batch-2b-spec/**`, em especial `capability-contracts-2b.json`,
    `cases-2b-2.json` (tabela de predicados e 2B2-CTRL01) e os deltas;
  - TypeScript: `../sdk-batch-2ac-admission/node/ts-driver.mjs`,
    `extension-loader.mjs` e `python/supervisor.py`;
  - Python: `../sdk-batch-2b2-admission/python/python-driver.py`, `supervisor.py`,
    `acceptance.py` e `adapter-python-exec`.
- **Fontes do pin.** `../sdk-reference-profile/inputs/sdk/python/**` e
  `../sdk-reference-profile/inputs/sdk/typescript/**`.
- **Governança.** `docs/07_agents/AGENTS.md` (D-12, T3 e T4).

## O que verificar

1. **Resolução da R1.** Para cada achado de `review-r1/review.json`, a ação de
   `repair-r1.json` resolve o problema de fato? Confira em especial:
   - R1-F01: PY19.B05 julgado pela versão derivada (`_runtime_version`), sem expectativa
     de `serverInfo`;
   - R1-F02: predicados de processo do 2B só em casos de um spawn com adapter
     (DP-PY19B e DP-PY19C) e `realcli.*` no DP-PY02P. O oráculo herdado e o
     `expected.process.argv` casam com o que `acceptance.py` e `supervisor.py` do 2B-2
     leem? O passo `realcli.witness` é implementável e sem corrida?
   - R1-F03 e R1-F06: a espera limitada do filho e o envio de sinal depois do
     CHILD_READY e de SigCgt tornam o contrário um MISMATCH, sem bloquear e sem PASS
     falso?
   - R1-F07: o delta do loader (DDP-03) cobre os imports do dist publicado?
   - R1-F08: as capacidades estão no formato do 2B, com DIAG verificáveis e limites de
     serviço coerentes com os supervisores admitidos?
   - R1-F10: `coverage-plan-dp.json#/conditions` cobre cada condição G01 dos braços do
     escopo, por caso que mira o braço ou por resíduo OUT?
2. **Regressões e material novo.** Os valores esperados novos decorrem dos bytes
   publicados e da fonte do pin? Confira:
   - DP-PK02A: raízes nested, nocli, nopkg com vendor local, symok e dangling;
   - DP-PK03A: três execuções (PATH com repetidos e 'Path', sem PATH, PATH vazio);
   - DP-PK04A: oito pares com shim, bindir, legacyonly, dicas pnpm e vite-plus,
     resolvido sem binário com vendor local;
   - DP-PK05A: dezessete execuções, inclusive symlinks léxico e canônico, conflito
     vite/pnpm, metadata # / sem ID / nome diferente / malformada, outro pacote pnpm e
     .bun global;
   - DP-PK06A e DP-PK08A: sinais, códigos espelhados, self-signal, error event;
   - DP-PY02P: argv, CheckoutCapabilities, PATH e versão derivada;
   - DP-PY20A: listagem dos seis assets no M7.
3. **Discriminação, determinismo e âncoras.** Cada braço tem passo que discrimina o
   contrário por predicado client? Alguma corrida, bloqueio ou PASS falso novo? Âncoras
   conferem (linha, sha e texto)?
4. **Escopo, limites e T3.**
   - nada de rede, credencial, login, turn, modelo, A6, capability do kernel ou
     instalação dentro do IN;
   - `NO_BUILD_LINK_DECLARED` em todo caso não CONTROL;
   - 24/12 por sub-lote;
   - CONTROL por cópia fiel (DP2) e por código próprio (DP1);
   - `t3-assessment.json` coerente, com as perguntas contingentes não feitas.
5. **Validador.** `validate-spec-dp.mjs.txt` e `validation.json`: as verificações e os
   23 controles negativos testam o que dizem?

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 2,
  "task": "DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS",
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

Severidade:

- **P1 bloqueia:** valor esperado errado que geraria MISMATCH falso, PASS falso,
  violação de limite (rede, credencial, capability, binário em `docs/`) ou de T3/T4.
- **P2 deve ser corrigido antes de liberar a execução:**
  - ambiguidade que impede implementar;
  - corrida não controlada;
  - âncora que não sustenta a afirmação;
  - braço sem discriminação;
  - item fora de escopo dentro da especificação;
  - orçamento inconsistente.
- **P3 é melhoria.**

APPROVE só com zero P1 e zero P2. Escreva em português.
