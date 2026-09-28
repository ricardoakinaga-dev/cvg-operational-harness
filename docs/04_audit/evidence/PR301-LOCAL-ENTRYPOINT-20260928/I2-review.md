# PR-301 — revisão independente da prova local OIDC — 28/09/2026

- Revisor: subagente independente Noether, somente leitura.
- Alvo: [script](local-entrypoint-proof.mts), [execução](local-run.json),
  [log](local-proof.log), [manifesto](proof.json) e logs de limpeza.
- Veredito I1: `REJECT_LOCAL_PROOF`. Três P1: o logout não reapresentava
  cookie antigo; não havia inventário de limpeza no script; o OTP errado
  não consultava API/PG antes do OTP válido. P2: harness fora do commit e
  console sintético.
- Veredito I2 após correção e nova execução: **`ACCEPT_LOCAL_PROOF`**. O
  revisor conferiu 10/10 SHA-256 do manifesto e o exit code 0 do registro
  de execução. Não reexecutou o teste.

## Evidência verificada na segunda rodada

1. Após OTP inválido: `/v1/session` respondeu 401 e a tabela PostgreSQL
   `operator_sessions` tinha zero linhas.
2. Após OTP válido: callback HTTP 303, `/v1/session` 200 e uma linha de
   sessão encontrada pelo digest do cookie; tenant/papel sintéticos
   correspondiam ao grupo `Supervisor` do Keycloak.
3. O state OIDC consumido deixou zero linhas; replay do callback com cookie
   temporário restaurado respondeu 401.
4. Após logout: o cookie operacional antigo reapresentado respondeu 401 e
   a família da sessão estava revogada no PostgreSQL.
5. O script só emitiu `PASS` depois de contar zero usuários sintéticos,
   roles e schemas. Os logs externos registram remoção dos contêineres,
   zero contêineres próprios e zero portas próprias abertas.

Limite P2 aceito: o script é um harness de auditoria fora do commit de
fonte `7ef74e7` e o destino do console é HTTP sintético. Este parecer cobre
somente Keycloak local, Chromium, API Fastify e PostgreSQL em
desenvolvimento. Não cobre IdP corporativo HTTPS, entrypoint de produção,
console completo, IAM real, CI remoto, staging ou decisão T4; produção
permanece `NO_GO`.
