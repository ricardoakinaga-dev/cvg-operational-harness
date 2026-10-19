# G01 — comandos, ferramentas e exports do pin

Unidade T1 da ação `DX100-G01:RESOLVE-ENTRYPOINT-GRAPH`. [Recuperação](recovery.json) e [partição de trabalho](task-graph.json) preservam o objetivo integral e o ownership. Catálogo normativo mantido em 485 obrigações funcionais e 22 controles, sem nova qualificação.

## Entregas

- [CLI](cli/README.md): 30 variantes raiz com dispatch ligado à fonte; 52 variantes aninhadas, 105 tipos, 305 campos e 127 relações. Quatro relações de schema efetivo e a gramática dinâmica de setup Windows continuam abertas. Implementação estática entregue por Zeno; `--check` conferido pelo Lead, com oito checks verdes e sete controles negativos rejeitados. Revisão independente deste recorte é registrada separadamente.
- [Ferramentas](tools/README.md): 39 pontos textuais de registro, incluindo um sob `cfg(test)`, e 36 implementações. São 38 registros textuais sem esse guard de função, sem afirmar alcance de produção. Oito controles negativos verificam integridade das ligações e guards. A [primeira revisão](tools-review-r1.md) exigiu três correções P2; inputs originais preservados.
- [Exports](exports/README.md): o JSON público exclui deliberadamente cinco contratos; 423 schemas do pin e do companheiro são idênticos e 29 diferem estruturalmente. Fonte, dados pré-computados e executável continuam referências distintas.

[Verificador de integração](verify_entrypoints.py) confere contratos, fontes, artefatos e revisões do recorte. Sua [saída](verification.json) não é uma medição de paridade funcional. Os verificadores específicos permanecem nos pacotes de cada frente.

Revisões independentes aceitas: [CLI](cli-review-r1.md), sem achado obrigatório no recorte, e [ferramentas R2](tools-review-r2.md), com os três achados P2 fechados. São aceites dos grafos estáticos dentro de suas limitações; nenhuma das revisões concede G01 completo ou paridade funcional. Writer e críticos encerrados após a entrega e integração.

## Continuidade

G01 não está concluído. Além das relações CLI abertas e alcance de ferramentas externas, a matriz de variantes precisa reconciliar os 29 schemas diferentes com os dados do pin e os tipos Rust. O export pré-computado não prova comportamento funcional nem autentica o build instalado.

Nenhuma task PAR/Claude100 foi apropriada, nenhum BUILD de runtime foi iniciado, e nenhum gate T3/T4 foi concedido nesta unidade. Os ledgers compartilhados recebem deltas no handoff do programa.
