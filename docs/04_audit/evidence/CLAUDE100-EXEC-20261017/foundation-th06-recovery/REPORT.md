# Recuperação TH06 — tentativa encerrada sem aceite

Task `C100-FND-TH06-RECOVERY-001`: **FAILED_SCOPED_RECOVERY**. A candidata b585b214edb03707eba15a5342e839dab17c6da3 permanece congelada e isolada, sem integração. O programa Claude100 continua IN_PROGRESS, com todos os 117 resultados e 17 controles no alvo.

O reparo protegeu os três finalizadores F01, a aquisição e transferência dos pools/HOME e a barreira global de settlement. Os 75 testes focais passaram, com tipagem de sete roots sem diagnóstico, lint e formatação verdes. A comparação independente preservou as 302 chamadas expect, SQL e fixtures por AST, os testes originais e sete inputs protegidos.

A [revisão independente](review-build/REPORT.md) reprovou EC03: nos caminhos síncrono e Promise de instrumentSql, `errorInfo(error)` é avaliado antes da proteção do combinador. Uma primária sintética sem conversão para string provoca TypeError no diagnóstico e desaparece do grafo final de erros. Não se afirma que PostgreSQL real emita esse valor; a contraprova invalida o contrato declarado de tratamento de unknown.

O crítico executou oito sondas: seis PASS e duas FAIL. O Lead verificou os hashes dos 22 artefatos e repetiu os mesmos oito controles em saída própria, confirmando o resultado; [registro](lead-confirmation/command.json). Os 75 verdes não anulam essa falha. O HOW R1/R2, os resultados intermediários e a falha histórica PARE anterior estão preservados.

O orçamento desta unidade foi consumido: uma implementação e um postreview, sem correções pós-revisão autorizadas. Não corrigir nem promover essa candidata sob a mesma unidade, não reiniciar o orçamento. PostgreSQL, E2E, certify e verificador completos permanecem NOT_RUN; o controlador de qualificação foi somente preparado e checado por sintaxe, sem execução. Nenhum contêiner novo foi criado e o crítico foi encerrado.

A lacuna RB-01 permanece aberta. Uma eventual recuperação exige primeiro um HOW novo que delimite a construção falível de diagnósticos, preserve a falha atual e justifique um novo escopo; não é um patch automático adicional desta tentativa. Há trabalho independente de fundação disponível na recomposição dos ajustes já aprovados da SPEC0225. A SPEC0238 continua aguardando resposta à pergunta existente, sem reenvio ou BUILD dependente.

Os ledgers 99/20/30, o estado PAR, o controller histórico e as fontes do checkout compartilhado não foram alterados por esta task. A continuidade está no handoff Claude100 e no backlog0383; nenhum crédito M1, PAR, funcional, produção ou release foi concedido.
