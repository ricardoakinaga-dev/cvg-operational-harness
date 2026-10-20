# Revisão independente R1 — DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R

Você é o crítico independente da única rodada de revisão desta mini-unidade de implementação e admissão. Você não herdou contexto.

Você é **somente leitura**: não crie, edite, mova nem apague nada dentro da candidata nem do checkout principal. Se precisar de
sondas próprias, use um diretório temporário seu e só a stdlib (Python com `-I`, ou Node v24.20.0 em
`/home/ricardo/.nvm/versions/node/v24.20.0/bin/node`).

Proibido:

- rodar serviço (systemd-run), bwrap ou o supervisor em qualquer modo que escreva (`run`, `selftest-sandbox`, `freeze`,
  `freeze-identities`, `diag-admission`, `init-ledgers`, `stage`, `fixtures` ou `plan`);
- rodar os autotestes, o validador, o preflight ou as ferramentas que escrevem na pasta;
- importar ou executar o SDK publicado, o wrapper publicado do proxy ou qualquer arquivo do cache;
- rede, Docker, PG, compilador, Codex CLI, commit, branch ou worktree.

Pode rodar, só para conferir:

- `python3 -I -B dplane/acceptance.py reevaluate <pasta-do-caso>`;
- `python3 -I -B tools/build_cases_dp1r.py check` (recalcula a errata e compara os bytes; não escreve);
- leituras de arquivos.

## Assunto

- Unidade: `/mnt/dados/cvg-work/cvg-codex100-dp1r-20261020/docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp1r-admission/`.
- Congelamento: `review-freeze-r1.json` na pasta, sha256
  `a46045f87b044529e8b342cc370dfe5fd0ebf8872ae75b2b573623972c24686e`. Confira os sha antes e depois e registre.
- Histórico: há 1 reparo agrupado disponível depois desta rodada e nenhuma outra revisão. Achados P1 ou P2 vão para o reparo
  (sem serviço novo nem vaga) ou para o Lead.

## Pedido da unidade (resumo da mensagem do coordenador)

O DP-1 foi aceito e o Lead aceitou DV1 a DV4. O PK07 foi decidido em `inputs/dp1/lead-decision-dv1-dv4.json`: caso novo numa
mini-unidade depois do DP-2, sem retry. O caso novo é o DP-PK07B, que substitui a observação perdida do DP-PK07A.

- **Errata T1 da fixture antes do freeze.** O filho sintético não pode ficar no escopo `"type": "module"` do A4. Use um local ou uma
  extensão que o Node aceite, preservando o que o PK07 quer observar dos ramos win32 e do caminho do proxy, e registre a errata como
  delta declarado. Se observar os ramos win32 exigir Windows real, diga isso e marque o braço como limite de plataforma em vez de
  forçar.
- **Orçamento:** 2 vagas (o CONTROL primeiro, que precisa dar MISMATCH, mais o DP-PK07B), no máximo 4 serviços, 1 revisão,
  1 reparo e 0 retries.
- **Ambiente:**
  - candidata destacada em `c9b9650bf`;
  - runtime em `/mnt/dados/cvg-work/cvg-codex100-dp1r-runtime-20261020`;
  - units `cvg-dx100-dp1r-*`.
- **Restrições:**
  - sem PG, porta, rede, capability ou privilégio;
  - artefatos só do cache, conferidos por sha;
  - load conferido antes dos serviços.

## Contexto que você precisa saber

- No DP-1, os passos 7 e 8 do DP-PK07A pararam em `ERR_UNKNOWN_FILE_EXTENSION` (`inputs/dp1/pk07a/`). O executor manteve o local
  e a extensão do arquivo executado, porque eles são a observação (`child.executed_path_exact`). Em vez disso, declarou um
  `package.json` `{"type":"commonjs"}` nas duas folhas win32 (`erratum-dp1r.json`, `cases-dp-1r.json`,
  `tools/build_cases_dp1r.py`). Julgue se essa leitura do pedido "local ou extensão" é legítima.
- Os deltas de código sobre o DP-1 admitido (commit 3ca3fd3b0, na pasta irmã `../sdk-distributed-profile-dp1-admission`) e a
  disposição dos carry-overs estão em `freeze-deltas-dp1r.json`.
- Os serviços contam como DIAG de qualificação, como no DP-1: 3 de 4. As vagas rodam em units próprias: 5 units no total.

## O que verificar

1. **Errata.**
   - A EDP1R-01 resolve o defeito sem mudar o que o PK07 observa?
   - `cases-dp-1r.json` recalcula a partir de `cases-dp-1.json`?
   - O DP-PK07B difere do DP-PK07A só nos campos declarados?
   - O CONTROL tem os mesmos bytes do DP1-CTRL01?
   - A leitura de limite de plataforma está correta?
   - A leitura dos contrários (`contrary_still_visible`) é honesta?
2. **Freeze e ordem.**
   - O source freeze foi feito antes do primeiro serviço e segue íntegro?
   - A identity freeze, os dry runs antes do freeze (escopo DV2) e os gates DDP1R-09 estão em ordem?
   - A ordem foi DIAG, admissão, CONTROL e DP-PK07B?
3. **Desfechos.**
   - O CONTROL dá MISMATCH pela regra 6, só por `wrap.exit_mirror_exact`?
   - O DP-PK07B dá PASS_CLIENT_OBSERVATION pela regra 7, com os registros win32 `.exe`?
   - A reavaliação offline dá igual?
   - Algum oráculo é vácuo?
4. **Carry-overs.** Os que dizem respeito ao driver Node (DP1-ADM/R2-F02, R1-F07, R1-F04, R2-F04, R2-F05 e PK07A) foram aplicados de
   verdade? Algum autoteste é vácuo, por exemplo o do mutante do marcador, o do prazo injetável ou o do LEFTOVER?
5. **Contenção, orçamento e registro.**
   - Nada de rede, credencial ou capability.
   - Nenhum binário em `docs/`.
   - Propriedades de serviço iguais às do DP-1.
   - Orçamento respeitado.
   - `state.json`, `next-task.json`, `adjudication-dp1r.json`, `case-results.json` e `empty-artifact-delta.json` coerentes.
   - 0 recibos funcionais e 0 crédito de paridade.

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R",
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
      "area": "<arquivo ou caso>",
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

## Severidade

- **P1:** resultado falso, quebra de freeze, de orçamento, de contenção, de T3 ou de T4.
- **P2:** oráculo vácuo, registro incoerente que impede o BIND, errata obrigatória não aplicada.
- **P3:** melhoria.

APPROVE só com zero P1 e zero P2. Escreva em português.
