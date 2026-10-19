# Grafo estático de ferramentas — G01

Este recorte liga os 39 pontos de registro de `core/src/tools/spec_plan.rs` a 36 implementações de `ToolExecutor`, com métodos `tool_name`, `spec` e `handle`, fontes das factories locais e guardas de registro/exposição. Não constitui execução funcional ou fechamento de todas as ferramentas do Codex.

O [grafo](tool-graph.json) conserva 34 nomes de base estáticos e duas famílias cujo nome vem de dados de runtime: ferramentas dinâmicas e adapters de extensões. Subagentes V2 podem receber namespace e schema do catálogo; seu nome de base não representa automaticamente o nome efetivo no wire.

As regras globais do registry são distintas das regras de exposição: policy pode impedir registro; ferramentas externas podem ser recusadas por nome reservado ou colisão; Code Mode e discovery podem mudar acesso e visibilidade depois do registro. O grafo inclui fontes dessas etapas e dos limites de dispatch.

## Reprodução e verificação

```text
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/entrypoints/tools/build_tool_graph.py
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/entrypoints/tools/verify_tool_graph.py
```

[Gerador](build_tool_graph.py): lê a fonte pinada como texto, sem compilar ou executar o alvo. Um lexer limitado mascara strings e comentários para preservar delimitadores. Alteração inesperada de família de registro ou handler sem ligação provoca falha, sem inventar uma implementação.

[Verificador](verify_tool_graph.py): confere os 53 arquivos e 280 excertos referenciados, vínculos, namespaces e pontos de registro. Seus quatro controles negativos adulteram cópias em memória e exigem recusa de remoção de registro, remoção de executor, perda de namespace e qualificação inventada. Um probe lexical verifica strings/comentários com registros falsos. [Resultado](verification.json): controles rejeitados e probe verde; nenhuma qualificação funcional.

A [primeira falha](first-extraction-failure.txt) identificou um cálculo incorreto da raiz no gerador; nenhum grafo foi publicado nessa tentativa.

## Limites

- O recorte fecha a enumeração dos pontos diretos de registro em `spec_plan.rs`, sem afirmar que sejam todas as ferramentas possíveis do sistema.
- Relações com requisitos são propostas de superfície de apoio. Uma implementação de ferramenta não satisfaz sozinha o requisito associado.
- MCP, contributors, ferramentas dinâmicas, hosted tools e catálogos têm conjuntos definidos em runtime; suas factories e variantes concretas ainda exigem expansão.
- Campos, defaults, erros, grants, hooks, cancelamento, plataformas e efeitos delegados ainda precisam de oráculos e provas por variante.
- Registro, exposição, descoberta e acesso efetivo não são tratados como equivalentes.
