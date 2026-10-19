# G01 — variantes vinculadas ao commit fixado

Este recorte reconcilia os 29 schemas diferentes entre o pin e o companheiro instalado e cria uma matriz apoiada nos dados do pin. Preserva o catálogo de 485 obrigações funcionais e 22 controles, a matriz anterior do companheiro e seus pareceres. Não qualifica comportamento ou identidade de build.

## Reconciliação

As 215 diferenças estruturais são ocorrências em schemas, incluindo descrições e representações repetidas. Elas se ligam a quatro grupos em [families.json](families.json):

| Grupo              | Ocorrências | Contrato observado na fonte                                                                                                                                                              |
| ------------------ | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imagens            |         192 | Referência por `fileId` ou resultado inline, entradas observadas e migração. A ordem do enum Rust decide precedência; `anyOf` sozinho não decide.                                        |
| Metadados do turno |          16 | Substituição seguida de patch, filtragem de chaves reservadas e preservação de continuação revisada. Não transportar limites de validação de configuração para essa rota por inferência. |
| Sessão de voz      |           4 | `voiceSessionId` separado de `realtimeSessionId`, encaminhado ao header próprio quando válido.                                                                                           |
| Metadados MCP      |           3 | `_meta` da primeira página do catálogo, conservado no snapshot e exposto por servidor.                                                                                                   |

Cada grupo conserva tipos, excertos com hash e casos futuros. O [scout de imagens](image-scout.raw.txt) é insumo atribuído, sem resultados executados. Campos e escolhas adicionais dos tipos Rust continuam sujeitos à reconciliação mais ampla de G01.

## Matriz

[matrix.json](matrix.json) usa nós JSON endereçados por conteúdo para reconstruir todos os 452 schemas públicos pinados, o schema de configuração e dois schemas de payload raw excluídos do JSON público. A compactação preserva todo o JSON, inclusive palavras-chave não interpretadas pelos casos sintáticos; não normaliza ou remove constraints/defaults. O arquivo é JSON canônico compacto gerado, com [resumo](matrix-summary.json) separado para leitura.

- 274 contratos: 269 casos dos envelopes públicos e cinco exclusões deliberadas mantidas como obrigações de fonte.
- 186 obrigações de resposta, com emissor e documentos candidatos. Três respostas legadas continuam sem export JSON público.
- 103 chaves principais de configuração; referências locais representadas como arestas sem expansão recursiva infinita.
- Casos de presença, tipo e combinadores são obrigações sintáticas. Serialização Rust, estado, transporte, plataforma, erro e efeito precisam de provas próprias.

## Reprodução e verificação

```text
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/pinned-variants/build_matrix.py
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/pinned-variants/reconcile_families.py
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/pinned-variants/verify_matrix.py
```

[Verificação](verification.json) reconstrói os 455 documentos a partir dos nós e confere cada schema/constraint contra os dados originais. Oito controles negativos devem recusar contrato/diferença/resposta removidos, grupo trocado, nó adulterado, referência ou keyword omitida e qualificação inventada. [Determinismo](determinism.json) confere duas gerações completas com seeds diferentes. [Inputs protegidos](protected-inputs.json) conservam os hashes do catálogo e das evidências anteriores.

A [primeira falha de extração](first-extraction-failure.txt) registrou um cálculo de raiz incorreto, corrigido antes de publicar a matriz.

## Escopo ainda aberto

Nenhuma execução funcional, aprovação de BUILD ou conclusão de G01 decorre desta matriz. Continuam abertos os payloads/dispatch exec-server, relações CLI de schema efetivo, gramática Windows/arg0, factories de ferramentas externas, tipos Rust além dos quatro grupos, demais variantes e a referência executável de G02.
