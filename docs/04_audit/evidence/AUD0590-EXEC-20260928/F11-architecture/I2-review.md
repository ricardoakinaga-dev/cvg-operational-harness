# F11 I2 — segunda crítica do guia

**Crítico:** Peirce (`01a0eb46-e731-7eb2-a62e-a9f44504b73d`), contexto
novo e somente leitura. **Veredito:** `REVISE` (0 P0, 0 P1, 3 P2). Os 24
hashes e tamanhos do manifesto continuam correspondendo ao commit
`54257e3`; os dois P1 e três dos quatro P2 da I1 foram resolvidos.

| P2 | Resposta no guia |
| --- | --- |
| Fingerprint opcional e chamadas distintas de factory/execute | Declarar fingerprint opcional; `createOperationalHarness` recebe composição e `harness.execute` recebe `executionId`, fingerprint quando presente e vínculo de retomada. |
| Step store condicional ao perfil | Declarar que o worker só cria step store no perfil `iterative`; `single_pass` usa `null`. |
| Tenant confiável | Declarar tenant vindo do escopo autenticado; `tenantId` no corpo é opcional e deve coincidir se enviado. |

As três correções foram feitas no
[guia](../../../../architecture/CURRENT_IMPLEMENTATION_2026-09-29.md),
com a qualificação adicional de journal/checkpoint na seção de persistência.
Nova crítica da revisão é requerida para encerrar a fatia documental local;
F11/F12 e produção permanecem abertos.
