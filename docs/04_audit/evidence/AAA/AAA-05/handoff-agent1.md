# Handoff AAA-05 → coordenador (agent-1)

- Task: `AAA-05` — contrato de dados, migrações, APIs e ownership. Status: **IMPLEMENTED_PENDING_INDEPENDENT_REVIEW** (`PROPOSED_NOT_FROZEN`).
- Artefato: `docs/02_spec/aaa_data_api_contract.md`, sha256 `8db1541f3f0428b64b47d5235c406cc4450b19ecc85eee75290837229dbf17e5` (hash pré-reconciliação preservado no `manifest.json`).
- Reconciliação: §3.1 mapeia `operationKey ↔ idempotencyKey`, estados AAA-03 ↔ AAA-05, `proposalHash ↔ payloadHash` e o código canônico `idempotency_key_reuse`; base `AAA-03` sha256 `db75899f...`.
- Review pedido: crítico fresco e read-only, walkthrough adversarial dos sete casos da auditoria; congelamento somente após aprovação.
- Decisões pendentes: reserva da migration 0012; ownership do adapter SQL; retenção/TTL; idempotência de provider.
- Limite declarado: adapter SQL não implementado; nenhum path de `packages/persistence/`, export ou migration foi tocado.

## Adendo agent-2 (rodada 2, sem alterar o contrato pinado)

- Artefato: `docs/04_audit/evidence/AAA/AAA-05/addendum-agent2-bindings-namespaces-sql.md`.
- Resolve os pedidos do coordenador: (A1) `proposalHash` × `payloadHash` com campos canônicos e vínculo verificável — hashes não são iguais; gap de canonicalização documentado para correção futura; (A2) namespaces de outbox/eventos com R-ID-5 prevalecendo; (A3) retry após falha sem efeito (`release → PENDING`) vs replay de `FAILED` terminal; (A4) AAA-03 rev2 `9df1a05f…` como contraparte vigente; (A5) plano da migration 0012 + paths/atribuição dos adapters SQL, sem código; (A6) plano de cobertura crítica e casos adversariais (processos distintos, restart real, canonicalizador, FAILED); (A7) mapa de obsolescência documental.
- O contrato pinado `8db1541f…` **não foi editado**; se o adendo for incorporado, o hash muda e as referências documentais precisam de re-pin. Candidatos de código permanecem `33aa2807…`/`a122ae51…`.

## Revisão 2 (pós-parecer `AAA05-R3-F01..F04`)

- O parecer independente `REJECT` para congelar a v1 chegou; as correções exigidas foram aplicadas em uma v2 do contrato: `docs/02_spec/aaa_data_api_contract.md` sha256 `2e8738e62926e67ea455f6930003bb836ce224ab95f0f878d6b4424c4a323568`.
- v1 preservada em `docs/04_audit/evidence/AAA/AAA-05/v1/` (hash conferido); pedido de revisão v2 em `docs/04_audit/evidence/AAA/AAA-05/review-request-v2.md` com mapa finding → correção.
- Nenhum código, migration, export ou registro compartilhado foi alterado; manifestos recebidos permanecem intactos.
