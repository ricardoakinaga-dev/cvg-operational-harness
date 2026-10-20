# Revisão independente R1 — DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS

Você é o crítico independente desta unidade T1 documental. Não herdou contexto. Sua
tarefa é revisar a especificação do perfil distribuído keyless do SDK e devolver um
veredito em JSON. Você é **somente leitura** no repositório: não crie, edite, mova nem
apague nada dentro dele. Sondas próprias, se precisar, ficam no seu diretório
temporário e usam só a stdlib (Python com `-I`, ou Node 22 em
`/home/ricardo/.nvm/versions/node/v22.23.2/bin`).

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
- Congelamento: `review-freeze-r1.json` na pasta, sha256
  `140b92f69726d88475d2b1c33555edee46d90ad47d899b3bbce05ead6df6d57b`. Confira o sha
  de cada arquivo listado antes e depois da revisão e registre o resultado.

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
  servidor de loopback para o A5 é permitido como peer sintético, com as condições do
  arquivo. A especificação declara que não o usa e diz por quê.
- Interpretação declarada em `capability-contracts-dp.json#/interpretation`:
  "capability nova" é capability do kernel ou privilégio, no sentido da Q4. Os
  mecanismos CAP-DP-\* são de harness, sem privilégio. **Julgue se essa leitura se
  sustenta** contra o texto da Q4 e contra a regra das especificações anteriores
  ("vocabulário e marcadores são deltas, mecanismo novo é capacidade nova").

## Contexto que você deve ler

- **Aquisição.** Leia em `../sdk-distributed-acquisition/`:
  - `HOW-distributed-profile.md`, `acquisition-ledger.json`, `artifact-metadata.json`
    (membros e sha) e `digest-verification.json`;
  - `review-r1/executor-disposition.json`.
- **Cache, só leitura.**
  - Fica em `/mnt/dados/cvg-work/cvg-codex100-distributed-cache-20261019/artifacts/<A1..A7>/`.
  - Cada `inputs[*]` dos casos traz `cache_archive`, `archive_sha256`, `member` e
    `member_sha256`.
- **Escopo.**
  - `../sdk-batch-2b2-binding/coverage-observed-v5.json`: linhas PY19, PY20, PK01 a
    PK09 e PY02.
  - Contratos G01: `../../g01/sdk-open-contracts/typescript/contracts.json` (braços
    PK) e `../../g01/sdk-open-contracts/python-contracts.json` (PY19, PY20 e PY02).
- **Formato a seguir.**
  - `../sdk-source-batch-2b-spec/**`: casos Python, deltas `freeze-r4-2b-delta.json` e
    `evaluator-r4-2b-delta.json`, CONTROL `2B2-CTRL01`, orçamento e T3.
  - `../sdk-source-continuation-3-spec/**`: especificação mais recente, mesmo formato.
- **Vocabulário admitido dos drivers**, para julgar a viabilidade dos deltas e
  capacidades:
  - TypeScript: `../sdk-batch-2ac-admission/node/ts-driver.mjs` e `fixture-cli.mjs`;
  - Python: `../sdk-batch-2b2-admission/python/python-driver.py`, `harness2b.py` e
    `adapter-python-exec`;
  - carry-over: `../sdk-batch-2b2-admission/state.json#/carry_over_next`.
- **Fontes do pin.**
  - `../sdk-reference-profile/inputs/sdk/python/_runtime_setup.py`, `pyproject.toml`
    e `src/openai_codex/client.py`;
  - `../sdk-reference-profile/inputs/sdk/typescript/src/**` e `package.json`;
  - o inventário G01 em
    `../../g01/component-surfaces/non-rust/inventory.json`, onde estão os sha de
    `release_version.py` e `scripts/update_sdk_artifacts.py`.
- **Governança.** `docs/07_agents/AGENTS.md` (D-12, T3 e T4).

## O que verificar

1. **Valores esperados contra os artefatos.** Em `cases-dp-1.json` (Node) e
   `cases-dp-2.json` (Python), os resultados esperados decorrem dos bytes publicados
   (`dist/index.js` do A7, `bin/codex.js` do A2, `bin/codex-responses-api-proxy.js` do
   A4, `codex_cli_bin/__init__.py` e WHEEL do A1) e da fonte do pin? Isso cobre exit
   codes, sinais, stderr, argv, env, PATH, caminho resolvido, exceções e causas.
   Atenção a:
   - tabela de plataformas e alvos (PK01, PK07);
   - ordem de resolução do `createRequire` e layout (PK02);
   - PATH acrescentado (PK03, PY19);
   - heurística de gerenciador de pacotes (PK05);
   - espelhamento de código e re-emissão de sinal, com o comportamento marcado em
     `version_dependent` (PK06, PK08);
   - argv e cwd do app-server no PY19 e no PY02P;
   - versão anunciada no initialize;
   - tags do WHEEL (PY20).
2. **Discriminação.** Cada braço mirado tem em `arm_discrimination` um passo cujo
   resultado muda se o ramo contrário fosse o real, julgado por predicado de classe
   client? Algum braço é afirmado sem discriminar?
3. **Determinismo.** Algum caso depende de corrida não controlada? Isso inclui sinal
   antes do handler, filho que ainda não instalou handler e saída de stdio. Algum passo
   pode bloquear para sempre, produzir PASS falso ou transformar falha de harness em
   MISMATCH? Confira em especial DP-PK06A, DP-PK08A, DP-REAL01 e DP-PY02P.
4. **Âncoras.** Linha, sha e texto conferem e sustentam o que o caso afirma? Isso vale
   para os membros do cache e para as fontes do pin.
5. **Ligação ao cache.** Todo membro usado está em `artifact-metadata.json` com o sha
   declarado? O staging (`staging`, CAP-DP-STAGE) e as fixtures `copy_of_member` ligam
   cada byte executado ou lido a um sha? Algum caso depende de arquivo que não está no
   cache nem na fonte do pin?
6. **Escopo e fora de escopo.** `coverage-plan-dp.json#/residuals` classifica todo
   resíduo das 12 linhas do escopo?
   - Algum item IN exige, na verdade, rede, credencial, login, turn, modelo, o A6,
     capability do kernel ou instalação?
   - Algum item OUT caberia sem decisão nova?
   - Os destinos (T4, NOT_AVAILABLE, T3, limite de plataforma etc.) estão certos?
   - O motivo para não usar o loopback do A5 se sustenta?
7. **Herança e deltas.** O freeze r4, o delta 2B e o avaliador r4 são herdados sem
   alteração silenciosa? Cada mudança está em `freeze-r4-dp-delta.json` ou em
   `evaluator-r4-dp-delta.json`? Os predicados copiados do 2B mantêm classe e oráculo?
   Os novos têm oráculo implementável?
8. **CONTROL, orçamento e T3.**
   - DP2-CTRL01 é cópia fiel do 2B2-CTRL01;
   - DP1-CTRL01 é de código próprio e falha pelo predicado declarado;
   - 24/12 por sub-lote;
   - as vagas condicionais têm gate verificável;
   - `t3-assessment.json` é coerente: NAO_EXIGE_T3, NAO_EXIGE_T4 e perguntas
     contingentes não feitas.
9. **Limites.**
   - 0 recibos funcionais e 0 crédito de paridade;
   - nada de rede, credencial, login real, dado real ou turn;
   - URLs só sintéticas (`.invalid`);
   - `NO_BUILD_LINK_DECLARED` em todo caso não CONTROL;
   - nenhum binário dentro de `docs/`.
10. **Validador.** `validate-spec-dp.mjs.txt` e `validation.json`: as verificações e os
    controles negativos testam o que dizem?

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS",
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
