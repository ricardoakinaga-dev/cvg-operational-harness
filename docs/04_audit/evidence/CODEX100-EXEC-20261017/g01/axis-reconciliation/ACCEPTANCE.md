# Aceite limitado da reconciliação de fonte e corpus

Estado atual: **ACCEPT_BOUNDED_SOURCE_AXIS_AND_ORACLE_RECONCILIATION**.
[Revisão R1](review-r1/review.json), [revisão final R2](review-r2/review.json)
e [aceite Lead](Lead-acceptance.json). O README registra o estado de preparação
anterior à revisão; este documento registra seu resultado.

R1 aceitou o corpus bruto de nove observações: oito critérios, 18 verificações
estáticas e zero achados. R2 aceitou a reconciliação de fonte: 12 critérios e
zero achados; os 20 inputs congelados foram reconferidos pelo Lead. Scout Godel
e crítico Cicero estão encerrados. Duas rodadas usadas, nenhuma restante.

Os 54 eixos foram preservados: 15 com contrato literal localizado, 26 compostos,
oito de governança CVG separada e cinco desconhecidos. As 49 citações e os 37
arquivos pinados foram conferidos. **Todos os 54 eixos continuam OPEN**; a
triagem não escreveu cenários nem alterou seus responsáveis ou o catálogo.

O [corpus real](../../g02/keyless-reference-oracles/README.md) vincula os nove
registros à captura aceita. Os 175 discriminantes anunciados pelo parser
coincidem com o inventário fonte, sem comprovar execução dos 175 handlers.
O complemento identifica o campo `result.capabilities` ausente no initialize
real, preservando a diferença para futura regra explícita de comparação.

O [follow-up de versão SDK](SDK-version-source-followup.json) é **não revisado**
e não integra o aceite R1/R2. Ele documenta um ramo de fonte para investigação
futura; não houve import ou execução do SDK, instalação ou prova de suas
dependências.

O aceite não aprova normalização, equivalência governada, recibo funcional,
fechamento G01, jornada CQ01–14 ou BUILD nativo. As 487 obrigações funcionais,
22 controles e 49 cartões permanecem obrigatórios. A SPEC0231 continua no
mesmo hash, aguardando resposta à pergunta humana existente; ela não será
reenviada nem considerada aprovada por ausência de resposta.

Próximo trabalho independente proposto: preparar uma unidade contida de
referência para os limites i64 e envelopes, hoje não provados pelo ID7. Essa
unidade exige contrato, fixture, guardas e revisão próprios antes de executar
o mesmo binário pinado. O BUILD0231 só pode começar após sua decisão humana e
registro do gate, conforme a constituição do repositório.
