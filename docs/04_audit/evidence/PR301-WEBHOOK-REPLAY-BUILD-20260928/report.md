# PR-301 webhook replay BUILD — 28/09/2026

## Resultado

O BUILD sintético da SPEC 0160 e do delta de migration da SPEC 0161 fechou os gates locais executados: 341 arquivos e 2.592 testes passaram sem skips; PostgreSQL 16 com migrations reais, cobertura global e gate crítico, build web/harness, lint, formato, links e E2E 12/12 passaram. O PostgreSQL descartável foi removido e a porta 55498 ficou livre.

O resultado não libera produção. A aceitação da SPEC 0160 permanece incompleta por dois bloqueadores P1 de contrato: falta o marcador durável de maior instante do relógio PostgreSQL e falta o reconciliador interno de eventos pendentes após a expiração da assinatura. A SPEC 0161 autorizou somente o inbox e seu delta de schema; não autoriza acrescentar essas capacidades à migration 0027. Retenção D-06 e idempotência/reconciliação do provider também seguem sem prova.

## Código e proveniência

- Branch isolado: `codex/pr301-webhook-replay-20260928`.
- Base: `7ef74e7f4fd2b1141e416b85c7337f119e1333ab`.
- Commit do BUILD: `737e9c17b5246ab623ff9e7bdcf33a16f9ba0844`.
- Tree: `3ea151e69645bfd4974550f5f68517f0e0271258`.
- Bundle web: digest SHA-256 `ca34c1d4e6fa16f89f0a8378e7492f09c4a9b81add628aa81670facd769b5ef8`, 10 arquivos.
- O branch ainda não está integrado ao candidato root atual; nenhum CI remoto, atestação ou staging foi executado nesta rodada.

## Escopo verificado

O inbox tenant-scoped cifra o payload bruto com AES-256-GCM, vincula o ciphertext a tenant/evento/mensagem, mantém lease generation e token sob RLS, exige confirmação por transação única de mensagem/outbox/auditoria/receipt e recusa takeover fora do prazo do PostgreSQL. A saúde do relógio lê arquivo root-owned sem seguir symlink, mede contra PostgreSQL e faz a própria reserva falhar se a decisão ultrapassar o orçamento temporal. Os testes integram duas instâncias Fastify com PostgreSQL real e esperam a expiração real do lease.

Os testes exercitaram replay e fronteiras de timestamp, identidade divergente, isolamento de tenant, ciphertext, leases e transições SQL, fail-closed de relógio e de persistence. Não houve canal, IdP, segredo ou dado real.

## Cobertura e revisão

A cobertura global foi 92,06% statements, 93,04% lines, 95% functions e 87,51% branches, acima dos pisos globais. O gate crítico passou; o grupo RLS obteve 96,09% de branches frente ao piso de 95%. O módulo `webhook-event-inbox.ts` ficou em 72,79% de branches e ainda não faz parte do manifest crítico.

Não houve crítica independente de código nesta rodada porque o limite de threads de agentes já estava atingido. Portanto, o relatório registra os testes e limites medidos; não atribui selo Triple-A nem aprovação independente.

## Bloqueios para produção

1. Submeter a um gate T3 separado o marcador durável que impede regressão do relógio e o contrato de recuperação tenant-scoped de pendências após expirar a assinatura.
2. Aprovar retenção D-06 e exclusão auditada; até lá, a migration bloqueia DELETE.
3. Demonstrar idempotência/reconciliação dos efeitos externos, ou manter o canal real vedado.
4. Integrar ao SHA root após PR-L04 e repetir todos os gates, obter CI remoto/atestação e fazer staging autorizado com issuer/provider controlados.
5. Aumentar a cobertura de branches do inbox e obter crítica independente do diff.

**Veredito:** `SYNTHETIC_BUILD_GATES_PASS_WITH_OPEN_P1_SPEC_GAPS`; produção `NO_GO`.
