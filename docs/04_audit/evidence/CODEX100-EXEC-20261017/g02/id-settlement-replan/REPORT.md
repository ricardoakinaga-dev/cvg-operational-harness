# Respostas de IDs declarados — resultado da referência

Tentativa `settled-2d6eb85f17`: exit0/0.295s,um processo e uma conexão stdio,14escritas e14respostas,12positivos exigidos observados. O leitor reconstruiu os limites inferiores por mensagens/bytes de cada escrita e os limites superiores de próxima escrita/EOF. Scopeinativo,cgroupREMOVED,ELF5cce7264intacto.

**Revisão independente do HOW:** R1 encontrou o P1 de respostas futuras em cache; o único reparo agrupado foi aprovado emR2/zero achados obrigatórios. A reconstrução deste runtime foi feita pelo Lead com o leitor revisado. Não houve terceira revisão nem crítico independente pós-runtime; os dois reviews foram usados no HOW.

| Caso              | Token do ID            | Tipo declarado | Resultado                                       |
| ----------------- | ---------------------- | -------------- | ----------------------------------------------- |
| i64-min           | `-9223372036854775808` | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| minus-2p53-minus1 | `-9007199254740993`    | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| minus-2p53        | `-9007199254740992`    | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| minus-one         | `-1`                   | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| zero              | `0`                    | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| one               | `1`                    | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| 2p53-minus1       | `9007199254740991`     | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| 2p53              | `9007199254740992`     | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| 2p53-plus1        | `9007199254740993`     | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| i64-max           | `9223372036854775807`  | SOURCE_I64     | echo exato/tipado antes da próxima escrita eEOF |
| string-large      | `"9007199254740993"`   | SOURCE_STRING  | echo exato/tipado antes da próxima escrita eEOF |
| string-empty      | `""`                   | SOURCE_STRING  | echo exato/tipado antes da próxima escrita eEOF |

[Dados recomputados](recomputed-observations.json), [terminal](settled-2d6eb85f17/terminal.json), [aceite Lead](Lead-runtime-acceptance.json), [HOW final](review-r2/review.json) e [replan](replan.json).

Os extremos signed64 e os valores adjacentes a2^53 foram devolvidos exatamente na mesma conexão. Número9007199254740993 e string"9007199254740993" conservaram tipos distintos; string vazia e0 foram recebidos corretamente. A fonte suporta esses12casos; isso não prova todos os valores/campos numéricos, transportes, plataformas ou gramática deID.

Todos os23casos históricos continuam no [plano](cases.json). Os11edges permanecemOPEN e não foram executados nesta lane. O [diagnóstico anterior](../lossless-wire-probe/REPORT.md) continua selado e com seu resultado original4echoes/8source/11edgeinconclusivosatéEOF; esta prova não reescreve suas causas ou budget.

Um snapshot sintético de logs da tentativa anterior foi lido somente numa cópia, e tinha0rows; [recon](log-source-recon.json). Isso não prova ausência de erro interno nem explica a causa de cada caso. Esse apêndice não fez parte dos inputs HOWR2.

Uma execução nova consumida,zero retries e zero reviews/retrabalhos restantes. Nenhum modelo/tool/login/provider/SDK/CVGengine ou dado institucional foi usado. Sem recibo funcional, normalização aprovada, fechamentoG01/G02/paridade ou concessão de BUILD0231. O catálogo487+22,49cartões,22famílias e jornadaCQ01–14 seguem obrigatórios.
