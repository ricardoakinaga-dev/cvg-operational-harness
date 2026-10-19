# Delta proposto para os ledgers — C100-Q01-REF-CAPTURE-001 r4 (CONT-20261018-D9EF)

Texto proposto pelo executor; o lead aplica nos ledgers. Esta unidade não editou nenhum ledger, nem `agent_coordination.md`, nem o catálogo central de artefatos vazios. Data: 19/10/2026, 00:15Z.

## 99_runtime_state.md / 20_master_execution_log.md

# CLAUDE100 — SPEC0238 rev.1 executada: TEXT capturado, READ incompatível por inventário de tools — 18–19/10/2026

- **Status de `C100-Q01-REF-CAPTURE-001` (r4):** `COMPLETED_LOCAL_STOPPED_BEFORE_ROOT_INTEGRATION`. [Estado](state.json).
- **Autoridade:** decisão do usuário sobre o delta r4, SPEC revisada `2c25a5c1…` ([decisão](../spec-delta-proposal/user-decision-20261018.json)).
- **Candidata nova:** `/mnt/ia/cvg-claude100-refcapture-r4-20261018` (branch `codex/claude100-refcapture-r4-20261018`, a partir de `cda464ea`), commit `d6f869e5`.
  - A rota `/v1/messages?beta=true` passou a ser admitida.
  - `queryClass` e `expectClass` são fechados, calculados sobre os bytes brutos, e nenhum texto de URL é retido.
  - Qualquer header Expect torna a request não elegível.
  - Envelope, traces e relatório passaram para version3.
  - Testes focais: 508/508.
- **Revisão independente R1:** `APPROVE_CODE`, sem obrigatórios ([parecer](code-review-r1/result.json)). Nenhum retrabalho foi usado.
- **Smoke:** uma smoke só de preflight com Docker real, sem processo Claude ([registro](smoke-preflight.json)).
- **Execução nativa única:** `c100_ref_capture_20261018_run2`, nonce `273ad562…`, terminou em `INCOMPATIBLE_TRANSCRIPT`/1 (report `f3ff8ab2…`).
  - **TEXT: CAPTURED.** O POST `BETA_TRUE`/`NONE` com sentinel recebeu 200, e o cliente terminou com exit 0 e `CVG_CAPTURE_TEXT_OK_V1`.
  - **READ: INCOMPATIBLE.** Com `--tools Read,Write --allowedTools Read --permission-mode dontAsk`, o cliente anunciou só `tools: ['Read']`, e a SPEC exige Read e Write. O coletor respondeu com o 400 fixo, e nenhum Read foi executado.
  - **WRITE_DENIED:** NOT_RUN.
  - **RC:** RC01/02/03/04/07/08/09/11 PASS (RC11 só local), RC05 FAIL, RC06 NOT_RUN, RC10 EXTERNAL_GATE_PENDING.
  - **Containers:** removidos.
- **Pergunta da r1 (query ou Expect):** os brutos do run2 provam `BETA_TRUE`/`NONE` para o run2. Para a r1, a causa segue como inferência, agora fortemente corroborada.
- **Brutos:** a auditoria independente deu `ACCEPT_RAW_EVIDENCE`, e o único obrigatório (registro do run2) foi atendido ([parecer](raw-audit-run2/result.json)).
  - Inferência, não provada: o 2.1.302 anuncia só as ferramentas permitidas sob `dontAsk`. Se for assim, o roteiro WRITE_DENIED é inalcançável com o contrato atual.
- **Gates** (Node 22, PG 55894, API 3404, web 4404): todos PASS exceto format.
  - O format falha só por `docs/08_runtime/agent_coordination.md`, débito do commit base e inalterado pela candidata.
  - O verify falha só por esse gate ([gates](gates/gates-summary.json)).
- **`next_action`:**
  - Lead: integração seletiva dos 28 caminhos ([lista com pré-estados](integration-candidate.json)), da evidência `r4-run/**` e dos 4 registros propostos em [empty-artifact-delta.json](empty-artifact-delta.json).
  - Usuário: decidir se faz uma nova revisão da SPEC0238 (inventário esperado no READ e como provocar a negação nativa de Write), com nova T3. Nenhuma nova execução sem essa decisão.
  - Sem push, produção, M1 ou PAR.

## 30_backlog_master.md / 0383 (entrada C100-Q01)

- `C100-Q01-REF-CAPTURE-001:R4-BUILD-RUN` está concluído localmente: código revisado, execução única run2 `INCOMPATIBLE_TRANSCRIPT`/1, brutos aceitos e gates registrados. Nenhum crédito funcional, M1 ou PAR.
- Nova pendência `C100-Q01-REF-CAPTURE-001:INTEGRATE-ROOT-R4`, que substitui a integração dos 27 caminhos de `cda464ea`:
  - 28 caminhos de `d6f869e5`;
  - pré-estados: SPEC `48b27084` → `2c25a5c1`, `bootstrap.mjs` `6f6a89d9` → `8150fa8f`, `bootstrap.test.js` `fa23f559` → `f3272fd8`; os outros 25 não existem na raiz.
- Nova pendência `C100-Q01-REF-CAPTURE-001:AWAIT-USER-SPEC0238-R2`: revisão do contrato de inventário e do roteiro WRITE_DENIED, só se o usuário decidir.
- Débitos fora desta frente, para triagem:
  - formato de `docs/08_runtime/agent_coordination.md`;
  - `packages/sandbox/dist` não é gerado por nenhum script, e `tests/pare100-compiled-kernel-boundary.test.js` precisa dele.

## agent_coordination.md (claim CONT-20261018-D9EF)

- Frente C100-Q01-REF-CAPTURE-001 r4 encerrada localmente.
  - Candidata e runtime próprios em `/mnt/ia/cvg-claude100-refcapture-r4-*`, mantidos.
  - Nenhum container, rede, processo ou PG ativo; portas 55894/3404/4404 livres ([recibo](resources-release.json)).
  - Evidência em `ref-capture-build/r4-run/**`, ainda não versionada.
