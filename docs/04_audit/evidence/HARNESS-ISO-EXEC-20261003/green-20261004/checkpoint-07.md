# Checkpoint 07 — integração e controles operacionais

Status: `IN_PROGRESS`; aceite global e produção `NO_GO`. Zero chamadas externas OpenAI.

Foram integrados somente 17 arquivos operacionais, com hashes de origem e destino conferidos. A crítica independente do consumidor passou nos 413 testes / 16 arquivos e no bundle/restart, mas manteve PARTIAL por permissões de diretório e procedimento T2 obsoleto. Ambos estão em correção local; a fonte final ainda exige revisão e gates.

Restore integrado: 21 testes verdes, projeções exatas e envio incerto sem repetição. A prova posterior da fila aceitou 1.000 recibos, recusou o seguinte, expirou apenas projeções sem associação após 24 horas e reabriu na sequência 2.007, preservando o prefixo original do journal. Callback continua simulador, provider real NOT_QUALIFIED.

Supervisor externo: três testes verdes; processo Node bloqueado no adapter de sync foi contido por SIGKILL em 10,0 segundos. Parada explicitamente forçada, lock residual/documentos intactos, cópia reaberta sob hold. Não é prova de kernel ininterruptível, storage físico ou energia.

D011 R2 terminou REJECT: cancelamento de probe antigo liberava probe novo e havia corrida no limite do cooldown. Lead introduziu identidade opaca do probe e controle após admissão; 405 testes / 39 arquivos passaram localmente. Nova crítica de 448 inputs está em andamento. A observação adjacente do default INTERNAL no contrato público anterior foi preservada; não se confunde com a recusa clínica do consumidor e não foi alterada silenciosamente.

Infraestrutura prepara pacote concreto e prova do filtro forwarded sem aplicar regras globais. Os gates finais e o pacote T4 de execução permanecem pendentes; nenhuma qualificação humana, piloto ou release concedida.
