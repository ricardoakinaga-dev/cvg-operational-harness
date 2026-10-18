# SPEC0239 — reparo executado; revisão final exige duas correções

O único reparo agrupado foi executado e a [revisão finalR2](review-r2/report.md) terminou **REVISE, doisP1**. A unidade terminou **FAILED_QUALITY_BAR**. O desenho não recebeu aceite técnico nem gate de BUILD; o programa integral continua IN_PROGRESS.

A [SPEC0239](../../../../../02_spec/0239_codex_native_journey.md) vincula por hash oito anexos, incluindo os contratos de [modelo](contracts/model-bridge.md), [dados/histórico](contracts/native-data.md) e [qualificação](contracts/qualification-rules.md).57fontes e45trechos próprios conferidos, além das32fontes/60ranges do scout preservados. O reparo materializou a costura de modelo e seus limites, dados/accounting, overlay19EA e cinco cenários de quota entre execuções. Sete checksT1 passaram; não são testes nativos.

Halley executou18verificações: R1-01/03/05 foram resolvidos no desenho; R1-02/04 permanecem parciais:

- **R2-01:** a relocação dos tipos removeu o schema comum NativeEventV1 e o formato de erro governado. SPEC/anexo se referem circularmente ao envelope ausente. Falta fixar campos/presença, ordinal/timestamp/origem, domínio do digest e persistência/releitura sem recriar fatos.
- **R2-02:** QR05 compara o frame opaco inteiro via RAW_STDOUT, mas exige preservar o stdout completo no mesmo role único. O setup pode diferir e o frame-alvo ser igual. Falta um contrato de derivação/role compatível com o core sem perder o bruto, com positivo discriminante e negativos de frame/ID errado.

Lead confirmou os dois achados nas fontes, autenticou oito payloads do crítico e seu manifesto externo,134inputs/first-last134 e105R1 reconstruídos. [Aceite do parecer, não do desenho](Lead-review-acceptance-r2.json); [disposição atual](acceptance-status-r2.json). Halley foi encerrado; as versões julgadas ficam readonly. A SPEC atual tem SHA `24a2ea104b782c8690d02468e5f6f492168d65eb8ab35bbf257d83daf333349f`.

O orçamento desta unidade terminou em2reviews/1reparo agrupado, zero restante. [Próxima task](next-replan-task.json): somente replanejar a rota após a falha; não iniciar outro reparo semântico, terceira revisão, novo crítico ou reset automático. O [plano de BUILD](build-plan.md) continua condicionado; a [entrada observada atual](build-entry/readiness-r2.json) continua falsa, separando os achados técnicos das dependências dos owners e da decisãoT3 futura. Não solicitar aprovação de contrato ainda incompleto;0231/0221/0225 permanecem resolvidos.

Todos14CQ,30NJ,19EA e509registros continuam NOT_RUN/nullreceipt. O mapa de fragmentos não cobre função inteira nem SSE/WebSocket. Nenhum runtime/código/SQL/PG/provider/gate amplo/produção/push/deploy nesta unidade.39vazios históricos jácatalogados/nenhum novo, centralreadonly.99/20/30/0190 alheiosdirty permanecem readonly; deltas nohandoff próprio.
