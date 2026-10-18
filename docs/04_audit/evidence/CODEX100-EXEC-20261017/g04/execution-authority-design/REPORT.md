# Contrato de autoridade de execução preparado

Concluída a preparação T1 de CP04/CP09 para a SPEC nativa completa. O [contrato](SPEC.md) liga standalone, worker e composição bound a um coordenador comum sobre persistência existente: epoch, lease, admissão transacional, perda de autoridade, cancelamento e terminal. Efeitos já admitidos podem continuar depois da perda da lease; resultado incerto exige reconciliação qualificada, sem repetição automática.

A [revisão independente R1](review-r1/report.md) aprovou o desenho delimitado: 14 verificações, zero correções obrigatórias. O Lead autenticou os seis outputs do parecer, 32 arquivos congelados e as duas leituras de 24 fontes. A nota P3 N01 foi [corrigida por complemento](citation-corrections.json), preservando os arquivos revisados. O crítico foi encerrado; uma rodada usada e nenhum reparo semântico.

As [oito checagens T1](verification-r1.json) passaram. Há 24 fontes, 24 ranges originais e duas substituições precisas de citação. O [plano de provas](test-plan.json) contém 19 casos finitos, todos NOT_RUN; o [mapa de integração](full-journey-integration.json) mantém CQ01–14. Nenhum teste nativo de concorrência foi executado nem recibo funcional concedido.

Próxima ação: `DX100-G04:SPECIFY-FULL-NATIVE-JOURNEY`. Completar DDL, exports/ports, composição/owners, loop, stream incremental, wire, cursor, ACK, pressão e limites; integrar todas as provas CQ01–14 e preparar o gate concreto correspondente. A decisão desta unidade não é SPEC completa pronta para BUILD. Aprovações0231/0221/0225 permanecem resolvidas em seus escopos.

Programa G04/Q01 IN_PROGRESS, catálogo487+22 permanece NOT_RUN/nullreceipt. Fontes de runtime e pacotes anteriores preservados. Ledgers99/20/30/0190 alheios dirty permanecem readonly; deltas no handoff próprio. Sem recursos PG, processo de aplicação ou job próprio aberto.
