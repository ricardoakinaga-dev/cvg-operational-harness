# Revisão independente — Hume — AUD0599

Revisor `01a11227-c793-7082-82ef-260a9e609d45`, somente leitura; contexto técnico e critérios da SPEC 0181, sem racional do builder. Node 22.23.2. Doze cenários próprios; adaptador e máquina de aprovação reais em memória. Hashes finais em `reviewer/results.json`; fonte do runner e loader arquivadas como texto.

Veredito `REJECT_SCOPE_TWO_P2`: R01/R02 e R03 atendem aos cenários reproduzidos; R04 e o fechamento da etapa retomada permanecem incompletos.

- P2: single-pass após reserva, guarda nega e tool/result falha; INSUFFICIENT_EVIDENCE e body zero, mas resposta perde o motivo da negação. KernelRuntime substitui a resposta por pipeline.logFailure.response. Controle anterior à reserva preserva o motivo.
- P2: negação de política durante aprovação pendente com falha de log deixa etapa WAITING; aprovação expirada depois de pausa deixa etapa RUNNING. Checkpoint termina INSUFFICIENT_EVIDENCE, body zero. Com log saudável, controles fecham a mesma etapa como FAILED. closeNotStarted cria um KernelStop sem a causa original e o caller não fecha a etapa.

R01/R02: pausa após reserva e checkpoint, maxToolCalls=1, retomada COMPLETED, body um, aprovação EXECUTED, replay recusado. R03: checkpoint e recordStep rejeitados, inclusive com log indisponível; uma tentativa not_started, sem reserva nem efeito.

Limites: nenhum PostgreSQL, suite global, rede, descendente ou escrita no repositório pelo revisor. Não julga a barra 0373 nem concede produção. Lead reexecutou os mesmos doze cenários em runner/output próprios; mesmos dois P2 confirmados. Agente encerrado após receber o parecer.
