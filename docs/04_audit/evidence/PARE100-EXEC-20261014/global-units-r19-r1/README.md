# Verificação global R19 — falha preservada

O script `npm test` original terminou com exit 1, sem exclusões de teste ou
alteração de configuração. Não houve aceite global ou conclusão do PARE100.

| Execução | Passaram | Falharam | Pulados | Escopo |
| --- | ---: | ---: | ---: | --- |
| R1 | 4389 | 61 | 282 | 452 arquivos; suíte global completa |
| R2 | 27 | 1 | 0 | Cinco arquivos afetados pelo verificador |
| R3 | 27 | 1 | 0 | Mesmos cinco arquivos após reparo IPC |
| R4 | 27 | 1 | 0 | Mesmos cinco arquivos após normalização Node |

Além das 61 asserções falhas, o arquivo obrigatório de fence PostgreSQL
falhou durante a carga por falta do recurso dedicado. Os 20 grupos falhos
reportados pelo Vitest incluem grupos aninhados; correspondem a dez arquivos.
Os 1042 arquivos monitorados e os 81 insumos da candidata R19 permaneceram
inalterados nas quatro execuções. Artefatos gerados também ficaram inalterados.

A [classificação de R1](classification.json) conserva 43 falhas de qualificação,
duas de guardas estáticas e 16 associadas ao perfil de rede. Quinze dessas
16 passaram nas repetições focadas. O smoke restante exige `ECONNREFUSED`
de uma porta fechada e recebe o código honesto de bloqueio do verificador.
Esse código não foi falsificado, e nenhum resultado focado substitui R1.

R2 recebeu [REVISE independente](../global-units-r19-r2/review-r1/review.json):
IPC sem registro podia usar uma tupla TCP própria para passar a checagem.
R3 acrescentou a recusa da combinação mista com zero conexões IPC aceitas,
mas recebeu [novo REVISE](../global-units-r19-r3/review-r1/review.json):
`hostname` não representa o host efetivo de `Socket.connect`, e três formas
TCP válidas eram recusadas. R4 usa a normalização do Node22.23.2 pinado.
O Lead reexecutou os dois scripts finais do revisor, sem alterar seus bytes:
22 controles passaram, com zero conexões TCP indevidas e zero chamadas DNS;
os três controles nativos também passaram. Esse reteste é I0 e não constitui
novo aceite independente. [Diagnóstico final R4](../global-units-r19-r4/diagnostic-final.json):
`CORRECTED_RETESTED_I0_REVIEW_PENDING`. Os dois REVISE seguem preservados.
O instrumento cobre apenas TCP/IPC Node herdando o preload; não é atestação
de isolamento do sistema operacional, UDP ou processos nativos.

Fontes e manifestos de produto, lockfile, pins, configurações e contratos
ficaram intactos. A [SPEC0226](../../../../02_spec/0226_pare100_published_complete_context.md)
e seus três suportes seguem congelados, aguardando decisão humana explícita.
A aprovação local da SPEC0224 permanece vigente. Os 36 cartões mantêm
2 DONE_LOCAL e 34 abertos; paridade integral continua NOT_MEASURED.

Evidências: [comando completo](command.json), [resultado bruto](results.json),
[stdout](stdout.log), [stderr](stderr.log), [inventário sem diferenças](source-changes.json),
[manifesto de publicação](publication-manifest.json) e
[reconhecimento das guardas estáticas](static-guard-recon.json).
Cópias de código e relatórios brutos usam o sufixo `.source.txt`; o manifesto
liga cada cópia ao nome original e ao SHA-256. HOME, caches, backups gerados
e streams vazios não foram publicados; omissões vazias são tipadas no manifesto.
