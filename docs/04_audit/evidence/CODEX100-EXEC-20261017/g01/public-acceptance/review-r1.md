# R1 — revisão exigiu dois estímulos MCP independentes

Averroes: **REVISE**, um achado obrigatório P2.
[Retorno original](review-r1.raw.txt), [freeze](review-r1-inputs.json) e
[arquivo exato dos 25 inputs anteriores](review-r1-archive.json).

No requisito CDX100-13-04, os eixos timeout e tool error apontavam para uma
fixture que só solicitava cancelamento. O texto do estímulo não configurava
deadline expirado nem resposta de erro de ferramenta. Assim, uma implementação
com cancelamento correto e esses dois caminhos defeituosos não era distinguível.

O crítico executou os checks e onze controles documentais por lane e o check
do índice. Os 25 inputs locais e dois raiz permaneceram byte-exatos. Não
executou cenário ou código do alvo. Confirmou a disposição do arquivo original
de interfaces e a correção do rótulo 313 payloads versus 309 campos CLI.

O [reparo R2](rework-r2.json) acrescenta duas fixtures independentes, com
projeções, falsificações e bindings G02 pendentes próprios. A
[regressão documental](mcp-r2-regression.json) rejeita o input R1 real e seis
mutantes adicionais. Isso verifica a correção do desenho; não executa MCP nem
concede paridade. Aceite final depende da revisão R2.
