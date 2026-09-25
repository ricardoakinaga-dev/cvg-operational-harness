# REM21-009 — Decision packet de qualificação externa

## Estado da decisão

- packet: `rem21-009-fixture-base`
- task: `REM21-009`
- achado: `A21-F06`
- escopo atual: `G21-1 / local-synthetic / local-disposable`
- `synthetic`: `true`
- `externalExecution`: `false`
- decisão atual: `PENDING`
- qualificação externa: `BLOCKED_BY_G21-5`
- produção: `NO_GO`
- `candidate`: `NOT_APPLICABLE_OFFLINE_DOCUMENTS`
- `run`: `run-rem21-009-offline-20260922`

Este pacote solicita revisão de autoridade para um futuro plano, mas não
solicita acesso, segredo, rede, dado real, piloto, cutover, dispatch ou ação
sensível. Nenhum owner ou approver foi inventado.

## Fatos observados

- Há contratos locais para envelope de canal, provider/model gateway, identidade
  confiável, catálogo de fonte institucional, egress guard e handoff.
- O runtime controlado usa fixtures fake/deterministic e não prova uma
  instância externa.
- A preparação offline pode verificar shape, boundary, redaction, idempotency,
  stop conditions e cadeia de evidência.
- Não há qualificação de IdP/provider/canal real, DPIA externa, owner externo,
  secret manager, endpoint aprovado, receipt externo, RPO/RTO produtivo ou
  rollback produtivo.

## Pedido único de autoridade futura

Quando G21-5 estiver aberto por decisão explícita, a autoridade deverá decidir
se o pacote pode entrar em uma janela isolada de homologação, preenchendo os
slots abaixo de forma independente. A resposta permitida agora é somente
`PENDING`.

| Decisão | Estado | Evidência necessária |
| --- | --- | --- |
| identidade, issuer, audience, claims e tenant | `PENDING` | contrato e owner de identidade |
| provider, capability, dados, timeout, rate limit e custo | `PENDING` | contrato e owner de provider |
| canal, dedup, receipt, handoff e dispatch-stop | `PENDING` | contrato e owner de canal |
| fonte institucional, versão, validade e revogação | `PENDING` | catálogo aprovado e owner de fonte |
| allowlist, DNS, certificados, proxy e observabilidade | `PENDING` | política de egress e owner |
| finalidade, minimização, retenção, residência e recipients | `PENDING` | aprovação de privacidade |
| abort, kill switch, reconciliação e rollback | `PENDING` | plano hashado e autoridade de rollback |

## Gate de decisão

Só pode haver transição para `WAITING_HUMAN_APPROVAL` quando o BUILD offline
passar e os hashes deste pacote estiverem registrados. Só pode haver
`QUALIFICATION_AUTHORIZED` depois de G21-5, owners, ambiente, dados,
privacidade e rollback aprovados. Mesmo então, a decisão não autoriza
produção, ação clínica/financeira, prontuário, ou confirmação/cancelamento/
reagendamento de consulta.

Qualquer slot ausente, expirado, divergente ou sem evidência mantém
`BLOCKED_BY_G21-5`. A ausência de falha em fixture não é aprovação externa.

## Artefatos e hashes

Os hashes abaixo devem ser preenchidos pelo `OFFLINE-BUILD-AUDIT.md` após a
validação local; `PENDING` não representa aprovação:

| Artefato | SHA-256 |
| --- | --- |
| `external-qualification-contract.schema.json` | `873542824b9eaa3f1163031a614dd5ac001548f42d40974e86e30f766769e005` |
| `external-qualification-fixtures.json` | `3ec9f1b7b68a1488c7037002c378aadda9892ed8b739d8ac14148606e6fb044b` |
| `authority-matrix.json` | `3cf01003bf53fc84ea677bf09b7dbd8147d1cb181bb01222cc0de8a8f97e1b19` |
| `THREAT-MODEL-ADDENDUM.md` | `3f417a5391cd4fa8e09a2dfc6f4e848ab62f0223d84de0ded4395844ea49fe35` |
| `QUALIFICATION-RUNBOOK.md` | `a2dbdba998f614ea5d3b1e6c326dfefee1d3a1f8071d14deccf7cb85b7f0404b` |
| `ROLLBACK-ABORT-RUNBOOK.md` | `c98b4635107e4ffeb8c0fa5a126255ca15c5f2b927a99440438d49fc5af2451f` |
| `DECISION-PACKET.md` | `listed in OFFLINE-BUILD-AUDIT.md after final write` |
