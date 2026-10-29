# F18 — correções da revisão 07 / tarefa14405

Implementação local concluída, pendente de revisão independente 07 ou D9 e integração pelo Claude DF/Opus. Base imutável3dc36726d, branch codex/aud0625-f18-build-20261029. Autoridade: atribuição GBrain14405, ACK14852, revisão07@4ffbda710e, SPEC0280 e recibo11 aprovados anteriormente e inalterados. S1 e S2 anteriores permanecem congelados.

| Item | Correção e evidência |
| --- | --- |
| P2-1 | Uma alegação failed/FAILED ou REJECTED depois de sucesso físico vira threw com unknown_effect explícito e causa preservada. O corpo não se repete; post-hook mantém complete1/fail0/release0 e ledger started→succeeded. Sem aprovação exigida, a resposta e o erro também continuam explicitamente incertos. |
| P2-2 | A transformação que reconstrói uma projeção incompleta é recusada com confirm_failed/unknown_effect, conservando o resultado físico original. Limites de largura, profundidade, classe e cópia serializada cobertos. O marcador privado é identificado por identidade; dados legítimos opaque:true continuam dados. Retorno do próprio outcome permanece válido, inclusive para saída grande. Não há fallback de autoridade/original na projeção. |
| R16/R17/R19/R22/R24/R25/R26 | Sondas propostas da07 adotadas como assertivas ordinárias; testam status inconsistente, falso not_started e uso único, nextduplo em gate, guard/post/end destacados e audit ausente em turno já bloqueado. Os sete mutantes morrem. |
| R23 | Teste com IterativeGovernedRuntime real observa o argumento do beforeDispatch sem substituir pipeline, aprovação, efeito ou callback real. Recebe projeção destacada/congelada, sem grant/reserva/sandbox/executor; um efeito sintético ocorre. Mutante que passa call real morre. |
| P3-1 da S1 | O teste de admissão procura control.approvals pelo nome do plugin, em vez de presumir índice0. |

Resultado final Node22: **783 PASS em 49 arquivos, 0 falhas e 0 skip/pendências**, 37.48s/120s. Tipos, lint dos quatro caminhos alterados e formato PASS. **30/30 mutantes mortos por assertivas**, fonte restaurada SHA idêntica:18 controles anteriores +7lacunas +R23 +4mutações P2. Os catálogos skip/mutation e lockfile não mudaram; pipeline/kernel-runtime só foram mutados temporariamente para prova e estão byteidênticos à base, sem rebind necessário.

Baseline anterior à correção:5RED causais/13PASS, sem it.fails e sem falha de setup. Tentativas posteriores com oráculo inválido de status e fixture sem-aprovação ainda exigindo policy foram conservadas; a primeira campanha foi marcada DIAGNOSTIC_NOT_FINAL_CAUSAL_CREDIT e repetida integralmente só depois de57controles verdes. Os relatórios finais são da fonte atual. Nenhuma morte por timeout ou infraestrutura foi creditada.

Ver [fontes](source-post.json), [preservação](source-preservation.json), [autorrevisão](SELF-REVIEW.md) e [estado](state.json). Brutos .log.json são transporte UTF-8 lossless com SHA; entradas originais da revisão ficam em inputs. Checkout parcial e dependências reutilizadas: esta não é barra clean/integral. Nenhum PG/Docker/fullsuite/E2E/certify/push/PR/merge. Scores0625 não reescritos; X01/K08/F05 global e produção NO_GO permanecem separados.

Próximo: DF receber SHA imutável e encaminhar à07/D9. Implementação e testes não são parecer independente nem aceite de integração. Após o retorno, Codex mantém consultas periódicas a GBrain/claims nesta sessão.
