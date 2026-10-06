# Escopo e autorização humana — PR301 webhook replay fix

As aprovações abaixo foram dadas explicitamente pelo usuário nesta conversa:

- SPEC 0160: `Aprovo a SPEC 0160` (T3 para replay/recovery do webhook).
- SPEC 0161: `Aprovo BUILD sintético da SPEC 0161` (migration 0027, inbox tenant-scoped, RLS/preflight e testes em PostgreSQL descartável, somente dados sintéticos).

O candidato usa PostgreSQL 16.15 descartável em `127.0.0.1:55499`, porta/container próprios. O escopo não inclui migration 0028/SPEC 0162, `apps/api/src/server.ts` protegido pela PR-L04, banco/dado/segredo/provider real, push, deploy ou produção. Produção permanece `NO_GO`.
