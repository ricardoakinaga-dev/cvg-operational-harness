# SPEC0225 — ajustes aprovados recompostos

Status: **COMPLETED_T1_APPROVED_ADJUSTMENTS**. A [cópia ajustada](adjusted-spec-proposal.md), SHA-256 `f26ccead3ad43d55d480ba08533e55bc9792a299608667570850668b0d12b315`, recebeu [APPROVE_APPROVED_ADJUSTMENTS](review-r2/REPORT.md), sem obrigatórios. O Lead conferiu os22inputs atuais,17pares de fonte/snapshot e os artefatos vinculados pelo manifesto. A SPEC original e sua decisão humana permanecem intactas.

A cópia aplica somente os cinco ajustes já aprovados: corte exclusivo com parada, journal reduzido para1MiB, J14 e drill completo J15 adiados, migration0030 após0029 e limite explícito do que a0225 resolve. Checkpoint e capture continuam8MiB, contexto32KiB. J13/J16 e os testes sequenciais de retomada continuam obrigatórios. J12 distingue encode do output de1MiB e capture de todo ToolResult de8MiB. O guard de nós foi mantido, com prova de componente separada da fronteira pública quantitativamente dominante de bytes.

R1 pediu uma correção documental agrupada; ela foi aplicada uma vez e aceita emR2 pelo mesmo crítico. Originais e R1 preservados. O ator está encerrado. Nenhum aplicativo, conta, modelo, Claude, PostgreSQL, teste ou BUILD foi executado nesta unidade.

**BUILD_ENTRY_READY=false.** Falta integrar0029 pelo PAR-G01 e qualificar o suporte de testes TH06, cuja recuperação também encerrou sem aceite. A aprovação documental não supera essas dependências, não altera PAR/M1 e não concede crédito aos117resultados/17controles. Não há novo pedido humano para reaplicar os ajustes já decididos; ampliação de escopo continua com gate próprio.

O próximo trabalho seguro é fechar o HOW privado de ownership de diagnósticos, em preparação separada. Os ledgers compartilhados99/20/30 e o estado canônico PAR seguem somente leitura nesta frente; a continuidade está no handoff Claude100 e no backlog0383.
