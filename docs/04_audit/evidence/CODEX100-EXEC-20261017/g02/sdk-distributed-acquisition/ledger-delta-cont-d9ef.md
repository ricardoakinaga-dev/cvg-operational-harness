# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:ACQUIRE-DISTRIBUTED-PROFILE-0.153.4`, aquisição de dados com T4
autorizado pela [decisão do usuário](../sdk-batch-2b2-binding/user-decision-distributed-profile-20261019.json).
O executor não editou ledgers, coordenação, 0384–0386, catálogo central nem código.
Não houve commit, branch nem worktree. Os links abaixo são relativos a este arquivo. Ao
transcrever para `docs/`, prefixar com
`04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-acquisition/`; para
`docs/03_build/0386_backlog_paridade_codex.md`, com
`../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-acquisition/`.

Fontes: [estado](state.json), [plano](acquisition-plan.json),
[registro](acquisition-ledger.json), [metadados](artifact-metadata.json),
[conferência de digests](digest-verification.json),
[HOW do perfil distribuído](HOW-distributed-profile.md),
[próxima unidade](next-task.json), [revisão](review-r1/review.json) e
[disposição](review-r1/executor-disposition.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:ACQUIRE-DISTRIBUTED-PROFILE-0.153.4
  `COMPLETED_LOCAL_P2_FIXED_AFTER_SINGLE_ROUND`.
  - Uma aquisição com rede, feita depois do plano.
  - 6 de 7 artefatos da release 0.153.4 obtidos, todos com digest conferido e sem
    divergência. O `openai-codex` 0.153.4 não existe no PyPI; não houve substituto.
  - Os binários são idênticos no wheel, no pacote npm de plataforma e no asset da
    release, e diferentes do executável compilado do pin. Isso fica declarado como
    `NO_BUILD_LINK_DECLARED`.
  - Nada foi executado nem instalado. Os artefatos ficam só no cache privado
    `/mnt/dados/cvg-work/cvg-codex100-distributed-cache-20261019`.
- `next_action`: DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS, T1 documental, sem
  rede ([task](next-task.json)).

## Para `docs/20_master_execution_log.md`

- 19/10/2026 — DX100-G02:ACQUIRE-DISTRIBUTED-PROFILE-0.153.4 (Claude Code,
  CONT-20261018-D9EF).
  - [Plano](acquisition-plan.json) escrito antes da rede, com os sete itens, a URL ou a
    regra de URL de cada um, a fonte do digest e o destino no cache.
  - Execução única, com 13 pedidos GET por HTTPS, sem retry e sem credencial: 7 de
    metadados (M2 e M5 deram 404) e 6 artefatos. Resultados:
    - A1 (wheel manylinux): conferido contra o `uv.lock` do pin;
    - A2, A3 (alias `npm:@openai/codex@0.153.4-linux-x64`), A4 e A7: conferidos pelo
      integrity e pelo shasum do npm;
    - A5: conferido pelo digest da release `rust-v0.153.4`;
    - A6: NOT_AVAILABLE.
  - [Conferência independente](digest-verification.json): PASS 18/18.
  - Revisão de rodada única: REVISE, com 1 P2 e 9 P3. O P2 era a URL pré-assinada do
    redirecionamento do A5 no registro. Ela foi redigida depois da rodada, e o registro
    anterior só aparece por sha. Os P3 foram corrigidos, salvo o R1-F03, levado a uma
    aquisição futura.
  - O gitleaks rodou sobre uma cópia, sem achados ([registro](secret-scan.json)).

## Para `docs/30_backlog_master.md`

- Trocar o item da aquisição por "DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS, T1
  documental, sem rede ([task](next-task.json))".

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Release 0.153.4 adquirida como pin próprio do perfil
  distribuído ([conferência](digest-verification.json)): 6 de 7 artefatos com digest
  conferido; `openai-codex` 0.153.4 ausente do PyPI; sem vínculo de build com
  `8d9f6466`. Próximo: SPECIFY keyless de PY19, PY20, PK01–PK09 e do ramo empacotado do
  PY02. 0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.
