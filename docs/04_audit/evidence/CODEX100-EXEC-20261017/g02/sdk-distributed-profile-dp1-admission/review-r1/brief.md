# Revisão independente R1 — DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1

Você é o crítico independente desta unidade de implementação e admissão. Não herdou
contexto. Sua tarefa é revisar o código, os freezes, os serviços executados e os
resultados, e devolver um veredito em JSON. Você é **somente leitura**: não crie, edite,
mova nem apague nada dentro da candidata nem do checkout principal. Sondas próprias, se
precisar, ficam num diretório temporário seu e usam só a stdlib (Python com `-I`, ou Node
v24.20.0 em `/home/ricardo/.nvm/versions/node/v24.20.0/bin/node`).

Proibido:

- rodar serviço (systemd-run), bwrap, o supervisor em modo `run`, `selftest-sandbox`,
  `freeze`, `freeze-identities`, `diag-admission`, `init-ledgers` ou `stage`;
- importar ou executar o SDK publicado, os wrappers publicados ou qualquer arquivo do cache;
- rede, Docker, PG, compilador, Codex CLI, commit, branch ou worktree.

Pode rodar, só para conferir: `python3 -I -B dplane/acceptance.py reevaluate <pasta-do-caso>`,
`python3 -I -B tools/validate_unit.py` em uma cópia sua da pasta (ele escreve
`validation-unit.json` na pasta onde roda) e leituras de arquivos.

## Assunto

- Unidade: `/mnt/dados/cvg-work/cvg-codex100-dp1-20261019/docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp1-admission/`
  (candidata destacada em `76c047257`, sem commit desta unidade ainda).
- Congelamento: `review-freeze-r1.json` na pasta, sha256
  `ad4714a1047780d337512e22950e033cd13d124a95ff378c924325432d7b1a8b`. Confira os sha antes
  e depois e registre.
- Runtime privado (fora de `docs/`): `/mnt/dados/cvg-work/cvg-codex100-dp1-runtime-20261019`
  (`/dist` montado só-leitura nos serviços; `attempts/`).

## Pedido da unidade

Implementar e admitir o sub-lote DP-1 do perfil distribuído keyless, conforme
`inputs/spec-dp/cases-dp-1.json` e `inputs/spec-dp/next-task.json`.

- A errata do R2-F01 (`inputs/spec-dp/review-r2/executor-disposition.json`) é obrigatória antes do source freeze:
  - topologia declarada;
  - delta do observador;
  - autotestes.
- Carry-overs da `next-task.json`.
- Só artefatos do cache conferidos por sha. Nenhum binário em `docs/`.
- Sem PG, porta, rede, capability ou privilégio novo.
- Orçamento rígido:
  - 12 vagas, com o CONTROL primeiro e exigindo MISMATCH;
  - 12 serviços;
  - 0 retries;
  - load até 12.
- Confirmação do Lead em `inputs/spec-dp/lead-confirmation-20261019.json`.

## O que verificar

1. **Conformidade com a especificação.** Confira se o código implementa o que os casos e
   os deltas congelados pedem:
   - `node/dp-driver.mjs`, `node/dp-loader.mjs`, `node/dp-channel.cjs`,
     `node/dp-synth-child.mjs`, `node/dp-control-wrapper.mjs` e `node/dp-platform-shim.mjs`;
   - `dplane/supervisor.py`, `dplane/observer.py`, `dplane/acceptance.py` e
     `dplane/stage.py`;
   - os deltas são DDP-01..11 e EDP-01..08, em `inputs/spec-dp/freeze-r4-dp-delta.json`,
     `evaluator-r4-dp-delta.json` e `capability-contracts-dp.json`;
   - a base derivada é o C3-1 em `../sdk-continuation-3-1-admission/` desta candidata.
2. **Oráculos.** Cada predicado em `dplane/acceptance.py` segue o oráculo da tabela de
   `cases-dp-1.json`, com a classe certa? Algum predicado é vácuo, ou pode passar sem
   observar o que diz? O mapeamento de forma da errata (`capture_form`) e a composição
   estão certos?
3. **Errata R2-F01.**
   - A topologia driver_only é declarada e exigida.
   - O observador recusa quadro de adapter ou peer.
   - Os autotestes obrigatórios existem e testam o que dizem:
     - `selftests/selftest_dp1.py`;
     - `selftests/selftest-results.json`.
4. **Disciplina de freeze e orçamento.**
   - Confira a ordem: autotestes, validador e preflight, depois `source-freeze-dp1.json`,
     depois `identity-freeze-dp1.json`, depois os DIAG em `diagnostics/`, depois
     `diag-admission-dp1.json`, depois o CONTROL e por fim os slots.
   - Nenhuma fonte mudou depois do freeze? Para conferir, recalcule o sha de cada arquivo
     de `source-freeze-dp1.json`.
   - `budget.json` e `case-ledger.json` estão coerentes: 5 serviços, 12 vagas e nenhuma
     repetição?
   - O modo `selftest-sandbox` (desvio DV2) ficou dentro do que diz `state.json`?
5. **Resultados.**
   - O CONTROL deu MISMATCH só por wrap.exit_mirror_exact?
   - Os 10 PASS_CLIENT_OBSERVATION são sustentados pelos quadros preservados? Confira os
     `events-driver.jsonl`, os BLOBs `blob-*.txt` e os `acceptance.json`.
   - O INVALID_CAPTURE do DP-PK07A e a adjudicação em `adjudication-dp1.json` estão
     corretos? A causa é de fixture da especificação e não do cliente? A regra 4 era a
     certa?
   - A reavaliação (`reevaluation-dp1.json`) bate?
6. **Contenção e limites.**
   - Serviços com 1 GiB e 256 tarefas, só no DP-1.
   - Rede só com lo.
   - Sem credencial. A entrada do driver é só a lista fechada.
   - `/dist`, `/fixture` e `/profile` só-leitura.
   - Nenhum arquivo do cache executado fora do serviço.
   - Nenhum binário ELF, gzip ou zip em `docs/`.
   - 0 recibos funcionais e 0 crédito de paridade.
   - `NO_BUILD_LINK_DECLARED` nos acceptance não CONTROL.
7. **Carry-overs.**
   - R2-F02 a R2-F06, do DP-SPEC.
   - 2B2-ADM, aplicado ou corretamente adiado.
   - `next-task.json` coerente.
8. **Registros.**
   - `state.json`, `case-results.json`, `resource-receipt-final.json`,
     `empty-artifact-delta.json` (112 vazios esperados), `preflight.json` e
     `validation-unit.json`.

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1",
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

Severidade:

- **P1:** resultado falso (PASS ou MISMATCH sem sustentação), quebra de freeze, de
  orçamento, de contenção, de T3 ou de T4.
- **P2:** oráculo vácuo ou divergente da tabela, registro incoerente que impede o BIND,
  errata obrigatória não aplicada.
- **P3:** melhoria.

APPROVE só com zero P1 e zero P2. Escreva em português.
