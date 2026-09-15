# Agente 1 — AAA-07: cobertura crítica do approval-engine

C6-F01/F02 foram aprovados independentemente e fechados. Execute exclusivamente a cobertura comportamental crítica do AAA-07 antes de avançar AAA-09. Leia AGENTS, runtime/log/backlog, AAA-03 rev2/adendo, barra AAA-04 congelada e REVIEW.md adjacente.

## Escopo e aceite

- Autorizados somente testes em `packages/approval-engine/src/__tests__/` e evidências próprias em `docs/04_audit/evidence/AAA/AAA-07/coverage-hardening/`. Preserve código do produto nos hashes do manifest-fencing-c6.json e o store/exports atuais. Não altere runtime, SQL/migrations, package/lockfile/config, contratos congelados ou registros compartilhados.
- Capture baseline do subset approval-engine com todos os src e relatório em destino privado. Identifique branches não cobertos e a invariante que cada teste precisa demonstrar. Não cubra só contagem de chamadas: confirme estado, token/geração, payload imutável, eventos e contadores, erro e ausência de efeitos.
- Meta congelada: ≥90 statements/lines/functions, ≥85 branches gerais e ≥95 branches críticos, incluindo engine.ts. Nenhuma compensação por arquivo crítico nem exclusão/remoção de código para subir percentual. Preserve os 48 testes existentes e probes C6; exercite transições terminais, prova ausente/inválida, TTL/relógio, replay, fencing, recuperação, histórico de tokens e falhas de CAS com controles positivos.
- Código não alcançável deve ser justificado com evidência, sem exclusão artificial. Se surgir defeito, preserve RED e entregue diagnóstico/proposta ao coordenador antes de ampliar correção. Não reabra C6 sem contraexemplo novo.
- Rode subset, regressões próximas e gates disponíveis adequados. Logs/coverage JSON em destino privado, sem escrever em certificação compartilhada ou usar banco de outra frente. Não reivindique mutação100%, durabilidade ou G_QUALITY sem prova específica.

Entregue IMPLEMENTED_PENDING_INDEPENDENT_REVIEW (ou BLOCKED com causa objetiva), manifesto de testes, hashes de produto antes/depois, mapa cenário→invariante→assertion→branch, baseline→resultado por arquivo, comandos/exit codes e limitações. Sem AAA-09, outra task, DONE, commit/push/deploy. Coordenador revisa e define o próximo passo.
