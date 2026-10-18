# Delta proposto para os ledgers — C100-Q01-REF-CAPTURE-001 (CONT-20261018-D9EF)

Texto proposto pelo executor. O lead aplica nos ledgers; esta unidade não editou nenhum ledger. Versão final de 18/10/2026 22:35Z. Substitui o rascunho pré-execução.

## 99_runtime_state.md / 20_master_execution_log.md

# CLAUDE100 — BUILD0238 executado localmente: INCOMPATIBLE_TRANSCRIPT honesto; delta da SPEC pronto para T3 — 18/10/2026

- **Status:** `C100-Q01-REF-CAPTURE-001` está `COMPLETED_LOCAL_STOPPED_BEFORE_ROOT_INTEGRATION`.
  - BUILD local aprovado pelo usuário (SPEC0238 SHA `48b270842ec83b422ecafeff2a4e802abd2194838ad3669becd2ebf825c464e6`).
  - Candidata `/mnt/ia/cvg-claude100-refcapture-20261018`, branch `codex/claude100-refcapture-20261018`, base `6cb965ff`.
  - Commits: `8872b34a` (R1 REVISE), `53fd7bd1` (R2 REVISE) e `cda464ea` (R3 `APPROVE_CODE`).
  - [Estado](state.json).
- **Execução nativa única:** `c100_ref_capture_20261018_r1`, contida, com chave sintética e endpoint local.
  - Resultado: `INCOMPATIBLE_TRANSCRIPT`/1, report `c544351d…`.
  - **TEXT:** INCOMPATIBLE. A q01, POST `/v1/messages` com sentinel, foi recusada como `UNSUPPORTED_ROUTE` com o 400 fixo. O cliente terminou com exit 1 (`is_error` true, `subtype` "success").
  - **READ e WRITE_DENIED:** NOT_RUN.
  - **RC:** RC01/02/03/07/08/09/11 PASS, RC04 FAIL, RC05/06 NOT_RUN (NOT_REACHED), RC10 NOT_RUN (EXTERNAL_GATE_PENDING).
  - **Contenção:** containers removidos.
- **Brutos:** a auditoria independente deu `ACCEPT_RAW_EVIDENCE`, e o único obrigatório (state STALE) foi corrigido.
  - Os brutos não distinguem query não vazia de header Expect.
  - `?beta=true` é inferência, não observação.
- **Gates** (Node 22, PG/portas próprios): no run final, todos PASS exceto format.
  - O format falha só por `docs/08_runtime/agent_coordination.md`, já sem formatação no base `6cb965ff` e inalterado pela candidata.
  - Os runs anteriores registram duas armadilhas ambientais:
    - `packages/*/dist` ausentes numa candidata nova;
    - `packages/sandbox/dist`, que nenhum script do repositório constrói.
  - [Gates](gates/gates-summary.json).
- **Delta documental da SPEC0238:** `spec-delta-proposal/delta-r4.json`, com SPEC materializada `r4/0238-revised-r4.txt` sha `2c25a5c1…`.
  - Admite exatamente `/v1/messages?beta=true` e introduz os enums `queryClass`/`expectClass`, sem reter texto.
  - Passa wire, traces e relatório para version3 e preserva r1.
  - Revisão independente: r1 → r4, terminando em `APPROVE_DELTA_FOR_T3`.
  - Nada foi executado sob o delta.
- **`next_action`:**
  - Lead: integração seletiva dos 27 caminhos por `integration-candidate.json`, com pré-estados conferidos.
  - Usuário: decisão T3 sobre a SPEC0238 revisada (sha `2c25a5c1…`) para nova candidata e uma nova execução com runId e nonce novos.
  - Sem push, deploy, produção, M1 ou PAR.

## 30_backlog_master.md / 0383 (entrada C100-Q01)

- `C100-Q01-REF-CAPTURE-001:BUILD-LOCAL` está concluído localmente: código revisado (R3 `APPROVE_CODE`), execução única `INCOMPATIBLE_TRANSCRIPT`/1, brutos aceitos e gates registrados. Nenhum crédito funcional, M1 ou PAR; os contadores 117+17 ficam inalterados.
- Nova pendência `C100-Q01-REF-CAPTURE-001:INTEGRATE-ROOT`: integração seletiva de 25 caminhos novos mais `tests/claude100/reference-port/bootstrap.mjs` (pré-estado `6f6a89d9…`) e `bootstrap.test.js` (pré-estado `fa23f559…`).
- Nova pendência `C100-Q01-REF-CAPTURE-001:AWAIT-HUMAN-T3-SPEC0238-R1` sobre a SPEC revisada sha `2c25a5c15788bb12c3853101e7eca33bef8450ad355f1d6fb1a59c807fbf1e18`. Antes do pedido, versionar `ref-capture-build/spec-delta-proposal/**`.
- Débitos fora desta frente, para triagem do lead:
  - formato de `docs/08_runtime/agent_coordination.md`;
  - `tests/pare100-compiled-kernel-boundary.test.js` depende de `packages/sandbox/dist`, que nenhum script de build gera.

## agent_coordination.md (claim CONT-20261018-D9EF)

- Frente C100-Q01-REF-CAPTURE-001 encerrada localmente.
  - Candidata e runtime próprios em `/mnt/ia/cvg-claude100-refcapture-*`, mantidos.
  - Nenhum container, rede, processo ou PG ativo; portas 55891/3401/4401 livres; marcadores vazios ([recibo](resources-release.json)).
  - Evidência em `ref-capture-build/**`, ainda não versionada na raiz.
