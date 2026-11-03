## Incorporação dos achados do núcleo Codex de 01 de novembro de 2026

O usuário solicitou incorporar as melhorias da comparação e implementar todas elas. O [plano de execução](codex_runtime_incorporation_2026-11-01.md) vincula os18recortesKR ao backlog0386 e aos reusosPAR; preserva a meta inteira, os12grupos de comandosCLI propostos e os critérios positivos/negativos. O [relatório de comparação](../comparacao_nucleo_cvg_codex_2026-11-01.md) e suas evidências são a origem deste complemento. Este bloco acrescenta requisitos de execução; não redefine os estados dos cartões.

A referência canônica continua8d9f6466. O fork inspecionado a0981298 é uma nova observação de fonte, e a CLI instalada0.166.0 tem identidade separada. A ampliação já registrada no catálogo para487obrigações funcionais e22controles não é alterada por este complemento. Os379requisitos mencionados na abertura são o inventário inicial, não o denominador corrente. Nenhum resultado estático ou helpCLI acrescenta recibo de paridade.

| Recorte | Incorporação requerida                        | Cartões canônicos e reuso                                  | Verificação que falta                                                      |
| ------- | --------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| KR01    | Kernel compartilhado e composição entre hosts | DX100-K01, PAR-K01                                         | Positivo e negativo de KR01 no plano; integração e prova atuais pendentes. |
| KR02    | Loop de decisão e ferramentas nativas         | DX100-K01, DX100-M01, PAR-M01                              | Positivo e negativo de KR02 no plano; integração e prova atuais pendentes. |
| KR03    | Pedido efetivo e autoridade capturados        | DX100-K01, DX100-M01, PAR-M02, PAR-K05                     | Positivo e negativo de KR03 no plano; integração e prova atuais pendentes. |
| KR04    | Streaming do provider até o cliente           | DX100-M01, DX100-A03, DX100-D01, PAR-M01                   | Positivo e negativo de KR04 no plano; integração e prova atuais pendentes. |
| KR05    | Sessão, retomada e fork                       | DX100-S01, DX100-S02, PAR-S01, PAR-S04, PAR-K03            | Positivo e negativo de KR05 no plano; integração e prova atuais pendentes. |
| KR06    | Agente vivo, steering e cancelamento          | DX100-K01, DX100-O02, PAR-K06                              | Positivo e negativo de KR06 no plano; integração e prova atuais pendentes. |
| KR07    | Supervisor e árvore de subagentes             | DX100-O01, PAR-O01, PAR-O02                                | Positivo e negativo de KR07 no plano; integração e prova atuais pendentes. |
| KR08    | Budget e capacidade por árvore                | DX100-O01, DX100-K01, PAR-O01                              | Positivo e negativo de KR08 no plano; integração e prova atuais pendentes. |
| KR09    | Ferramentas paralelas e exclusivas            | DX100-K01, PAR-K07                                         | Positivo e negativo de KR09 no plano; integração e prova atuais pendentes. |
| KR10    | Processos persistentes e terminal             | DX100-X01, DX100-R02, PAR-X01                              | Positivo e negativo de KR10 no plano; integração e prova atuais pendentes. |
| KR11    | Política de efeito e sandbox aplicado         | DX100-X02, DX100-X03, PAR-X02, PAR-X03, PAR-X04            | Positivo e negativo de KR11 no plano; integração e prova atuais pendentes. |
| KR12    | Aprovação, efeito incerto e handoff           | DX100-X03, PAR-K03, PAR-X04                                | Positivo e negativo de KR12 no plano; integração e prova atuais pendentes. |
| KR13    | Encerramento com relatório de falhas          | DX100-K01, DX100-O01, DX100-X01, PAR-K04, PAR-X01          | Positivo e negativo de KR13 no plano; integração e prova atuais pendentes. |
| KR14    | Contexto, compactação e saídas grandes        | DX100-C01, DX100-S02, PAR-C01, PAR-C02, PAR-C03, PAR-K03   | Positivo e negativo de KR14 no plano; integração e prova atuais pendentes. |
| KR15    | RPC, eventos e requests do servidor           | DX100-A01, DX100-A03, DX100-D01                            | Positivo e negativo de KR15 no plano; integração e prova atuais pendentes. |
| KR16    | CLI e configuração operacional                | DX100-H01, DX100-H02, DX100-D02, PAR-H01, PAR-H02          | Positivo e negativo de KR16 no plano; integração e prova atuais pendentes. |
| KR17    | MCP, hooks e extensões sob controle           | DX100-P01, DX100-E01, DX100-F01, PAR-P01, PAR-K04, PAR-K09 | Positivo e negativo de KR17 no plano; integração e prova atuais pendentes. |
| KR18    | Medição de paridade e mudança de referência   | DX100-G01, DX100-G02, DX100-G03, DX100-Q01, DX100-Q02      | Positivo e negativo de KR18 no plano; integração e prova atuais pendentes. |

Ordem de execução: reconciliar candidata/recibos/claims; fechar a jornadaCQ01–14 com os mecanismos existentes; completar lifecycle/supervisor/budget; ligar protocolo eCLI às mesmas portas; ampliar concorrência/extensões e qualificar o escopo inteiro. As dependências dos pais continuam nas carteiras canônicas. Não criar kernel, supervisor, store ou fila paralelos para contornar dependência.

Os módulos de sessão, fork, cache, compactação, spill e subprocessos observados na onda8 são reuso a integrar/qualificar, não lacunas de código presumidas. K06/0302 e jobs0306 mantêm seus autores. O contrato de encerramentoKR13 deve produzir resultado verificável de cleanup sem mascarar a causa primária, declarar efeito incerto como sucesso ou confundir timeout do observador com quiescência.

Execução local segue a trilha aplicável de cada unidade. A instrução de implementar é o objetivo autorizado; uma SPEC pública nova ou alterada precisa do gateT3 definido na constituição. Aprovações existentes são consumidas pelo recibo e escopo exatos, sem perguntar novamente pela mesma decisão. Release/push/produção e dados reais não foram concedidos. O pacote de rastreabilidade e o saldo implementável ficam no plano vinculado;0386 continua único dono dos estadosDX100.
