# Diagnóstico do domínio dos IDs — observações parciais

Tentativa `lossless-ef193bc016`: exit0,23processos,69writes conferidas,scopeinativo/cgroupREMOVED,ELF intacto. Isso conclui o experimento de entrada/EOF descrito no HOW; **não fecha o domínio i64**. A revisão runtime R2 aceitou somente o diagnóstico delimitado, com oito casos de fonte inconclusivos; a prova de oráculos i64 permanece INCOMPLETE.

Foram observados quatro echoes exatos entre os12IDs declarados. Os outros oito ficaram sem resposta-alvo até o EOF; não houve echo com valor numérico incorreto observado. Os11tokens de borda também ficaram sem resposta-alvo nessa janela. A barreira não é fence de conclusão das operações anteriores.

| Caso                  | Token enviado          | Categoria     | Respostas-alvo até EOF | Resultado limitado                                     |
| --------------------- | ---------------------- | ------------- | ---------------------: | ------------------------------------------------------ |
| i64-min               | `-9223372036854775808` | SOURCE_I64    |                      0 | INCONCLUSIVO: sem echo antes do EOF                    |
| minus-2p53-minus1     | `-9007199254740993`    | SOURCE_I64    |                      0 | INCONCLUSIVO: sem echo antes do EOF                    |
| minus-2p53            | `-9007199254740992`    | SOURCE_I64    |                      1 | echo tipado exato observado                            |
| minus-one             | `-1`                   | SOURCE_I64    |                      1 | echo tipado exato observado                            |
| zero                  | `0`                    | SOURCE_I64    |                      0 | INCONCLUSIVO: sem echo antes do EOF                    |
| one                   | `1`                    | SOURCE_I64    |                      0 | INCONCLUSIVO: sem echo antes do EOF                    |
| 2p53-minus1           | `9007199254740991`     | SOURCE_I64    |                      0 | INCONCLUSIVO: sem echo antes do EOF                    |
| 2p53                  | `9007199254740992`     | SOURCE_I64    |                      1 | echo tipado exato observado                            |
| 2p53-plus1            | `9007199254740993`     | SOURCE_I64    |                      1 | echo tipado exato observado                            |
| i64-max               | `9223372036854775807`  | SOURCE_I64    |                      0 | INCONCLUSIVO: sem echo antes do EOF                    |
| string-large          | `"9007199254740993"`   | SOURCE_STRING |                      0 | INCONCLUSIVO: sem echo antes do EOF                    |
| string-empty          | `""`                   | SOURCE_STRING |                      0 | INCONCLUSIVO: sem echo antes do EOF                    |
| below-i64             | `-9223372036854775809` | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| above-i64             | `9223372036854775808`  | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| decimal-seven         | `7.0`                  | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| exponent-seven        | `7e0`                  | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| negative-zero         | `-0`                   | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| negative-zero-decimal | `-0.0`                 | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| zero-exponent         | `0e0`                  | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| null-id               | `null`                 | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| bool-id               | `true`                 | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| object-id             | `{}`                   | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |
| array-id              | `[]`                   | EDGE_OBSERVE  |                      0 | ausência observada só até EOF; gramática não concluída |

[Dados recomputados](recomputed-observations.json), [capturas originais](lossless-ef193bc016/terminal.json), [contrato congelado](contract.json), [HOW](HOW.md) e [fonte de EOF](EOF-source-corroboration.json).

O campo técnico source_echo_mismatches=8 significa oito echoes esperados pela declaração de fonte não observados nesta fixture, não oito valores errados nem oito rejeições comprovadas. Os dados parseados continuam diagnósticos; os arquivos requests.ndjson/stdout/stderr são a autoridade. O valor9007199254740993 apareceu exatamente em uma resposta bruta, sem demonstrar todos os campos i64 ou a correlação concorrente na mesma conexão.

A fonte pinada permite dispatch assíncrono e remoção da conexão em EOF antes de toda escrita de resposta. Isso corrobora um fator de confusão de lifecycle, sem provar a causa individual de cada ausência. Um novo desenho deve esperar a resposta dos IDs declarados válidos antes de barreira/EOF, e tratar a observação das bordas separadamente.

Orçamento runtime gasto1de1,zero retries automáticos. Não alterar este driver ou repetir a tentativa para obter outro resultado. Qualquer nova prova exige unidade/contrato/HOW e revisão próprios, com o resultado atual preservado e causa material explicitada.

Nenhum código CVG/SDK/modelo/tool/login/provider foi executado. Nenhum recibo funcional, normalização ou gate humano0231 foi concedido. O programa22famílias49cartões487+22 e jornadaCQ01–14 continua obrigatório e aberto.

[Revisão final R2](review-r2/review.json) e [aceite Lead](Lead-runtime-acceptance.json):166inputs reconferidos,zero achados obrigatórios sobre a fidelidade do diagnóstico,crítico encerrado,2reviews/1experimento usados e zero restantes. Esse aceite não muda os oito casos inconclusivos nem concede crédito funcional.
