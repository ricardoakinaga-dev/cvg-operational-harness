# Reconciliação dos 54 eixos sem casos e dos oráculos reais

Unidade T1 `DX100-G01:RECONCILE-UNCOVERED-AXES-AND-REAL-ORACLES`.
[Contrato](contract.json), [54 entradas históricas](axes.json),
[triagem do scout](scout/triage.json), [conferência mecânica Lead](Lead-scout-verification.json)
e [corpus real complementar](../../g02/keyless-reference-oracles/README.md).
A revisão semântica independente ainda precisa concluir; a triagem não é aceite.

Foram preservados os 54 eixos, distribuídos por 32 requisitos e 15 responsáveis.
A classificação de fonte propõe 15 eixos com contrato literal localizado,
26 compostos que exigem decomposição, oito de governança CVG separada e cinco
com fonte ou acesso ainda desconhecidos. As 49 citações foram reconferidas por
bytes e os 37 arquivos upstream contra os objetos do commit pinado. Essa
conferência prova origem e integridade; não prova comportamento executado.

As distinções afetam o escopo dos futuros casos:

- `Interrupted` é estado de turno; `Paused` pertence ao contrato de goal. Uma
  pausa retomável de turno não é inferida desses dois enums.
- Contadores de tokens e tempo do goal não estabelecem uma API de orçamento
  monetário. O eixo de custo mantém seu responsável e exige contrato literal
  específico ou regra CVG aprovada separadamente.
- Um goal armazenado por thread não comprova a regra de um único goal ativo
  global. A validação e os estados de cada operação ainda precisam de captura.
- Interseção de grants, tenant e autoridade CVG não são provadas por um
  `threadId`, por um pedido de approval ou pela existência de um selector.
- Chaves de configuração, métodos, tipos e unions exigem conjuntos de casos
  por membro, linguagem e variante. Os 103 nomes de configuração e os 274
  métodos/declaracões dos quatro envelopes continuam retidos para expansão.
- Um callback cancelável não estabelece timeout universal ou revogação de
  grant. Recursos MCP também não comprovam prompts ou acesso a runtime hosted.

O scout não escreveu cenários nem fechou eixos. **Todos os 54 continuam OPEN**;
as 360 propostas anteriores, as demais obrigações, os seis gaps SDK e as
correlações TUI continuam válidos dentro de suas limitações. O catálogo487+22
e a SPEC0231 congelada permanecem intactos. A pergunta humana0231 continua
pendente, sem reenvio ou inferência de aprovação.

Em paralelo, o corpus complementar vincula nove observações já capturadas e
registra a projeção antiga `result.capabilities` ausente no initialize real.
O parser anuncia 175 discriminantes iguais à fonte; isso não executa os 175
handlers. O complemento não modifica os pacotes históricos, não aprova regras
de normalização e não concede recibo de paridade ao CVG.

Próximo passo desta unidade: concluir a revisão independente dentro do limite
de duas rodadas, conservar eventuais achados e integrar somente o resultado
delimitado. Depois, decompor os conjuntos pendentes e preparar capturas reais
nas unidades autorizadas. A jornada CQ01–14 e o programa integral continuam
obrigatórios, sem BUILD nativo ou release concedido por esta reconciliação.
