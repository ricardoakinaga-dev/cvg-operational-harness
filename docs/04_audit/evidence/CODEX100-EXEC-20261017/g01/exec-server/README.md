# G01 — contratos exec-server

Inventário T1 das 32 operações já obrigatórias no catálogo. Tipos, direção e caminhos de fonte são insumos para implementação e comparação futuras; nenhum resultado funcional está qualificado.

## Fluxos

[flows.json](flows.json) liga as constantes às rotas e fontes de envio/recebimento:

| Categoria                          | Quantidade | Observação                                                               |
| ---------------------------------- | ---------: | ------------------------------------------------------------------------ |
| Pedido controlador → executor      |         25 | Parâmetros wire, handler e resultado ligados à fonte.                    |
| Notificação controlador → executor |          1 | `initialized`, sem resposta RPC.                                         |
| Notificação executor → controlador |          5 | Saída, término e fechamento de processo, corpo HTTP e auditoria de rede. |
| Pedido executor → controlador      |          1 | `network/policyRequest`, com resposta distinta do evento de auditoria.   |

O handler HTTP retorna `()` internamente, mas envia `HttpRequestResponse` e só depois inicia o corpo em streaming. O router não deve inventar uma segunda resposta unitária. A camada de parâmetros também preserva compatibilidade com objeto vazio mediante nova tentativa como `null`, quando aplicável ao tipo.

Conversões de filesystem `Wire*` resolvem contexto de sandbox antes do handler. Os guards de inicialização e vínculo da conexão não constituem prova de autorização de tenant no CVG. Eventos `network/policyDecision` são auditoria, não respostas de concessão de autoridade.

## Reprodução

```text
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-server/build_flows.py
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-server/verify_flows.py
```

[Verificação dos fluxos](flow-verification.json) confere fontes, tipos e direção, com doze controles negativos. Eles recusam operação removida, direção reversa trocada, tipo alterado, resposta HTTP unitária inventada, resposta atribuída a evento, vínculo de handler trocado, evidência transplantada de outra rota, remoção de guards de conexão/concorrência, perda do adaptador de resposta adiada ou timeout reverso e qualificação falsa. A [primeira falha](first-extraction-failure.txt) foi uma âncora descritiva divergente da fonte, corrigida antes da publicação do grafo.

O [pacote de tipos](types/README.md) contém 137 definições selecionadas, 403 campos, 51 variantes e 13 pares wire/domínio. A [integração](type-links.json) liga as 32 operações a 78 referências de tipos e 12 conversões de parâmetros, com seis controles negativos em [join-verification.json](join-verification.json). Treze checks do pacote de tipos passaram na execução somente leitura; vinte referências transitivas permanecem explicitamente abertas. A revisão independente do conjunto é registrada separadamente. Detalhes transitivos de codec, efeito, retenção/replay, plataforma, autorização e comparação funcional continuam abertos até provas específicas. G01 e a implementação integral permanecem em andamento.
