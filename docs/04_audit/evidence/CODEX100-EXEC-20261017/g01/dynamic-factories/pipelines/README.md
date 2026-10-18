# Factories e exposição de ferramentas — fonte

Inventário T1 sob o [contrato](../contract.json), no commit oficial
`8d9f6466ff0294785d56f55b1fe363d132fe4133`. Não implementa nem executa
ferramentas no CVG. [inventory.json](inventory.json) distingue quatro famílias:
executores de extensão, MCP externo, callbacks dinâmicos de cliente e specs
hospedadas pelo provider.

O router preserva a ordem MCP → exposição MCP → extensões → dinâmicas →
hospedadas → finalização. Fontes completas e corpos selecionados registram
filtros de policy, nomes reservados, colisões, seis variantes de exposição,
overrides de namespace e modo estrito de terceiros. A presença de um executor
ou a descoberta de um nome não concede autorização CVG.

MCP conserva cache de metadata imutável e uma preparação de chamada separada
contra catálogo/configuração/client atuais. Apps passam por filtros próprios
de conector/policy. Budgets de plugin e de compaction são constantes de fonte,
não limites de sandbox do harness. Namespaces, output schemas, erros de
construção e fronteiras da chamada estão retidos.

A projeção de schemas para o modelo pode preencher properties ausente/null,
reescrever schemas booleanos e compactar ou substituir parâmetros grandes.
Ela não é um validador de execução. O inventário mantém os helpers e essas
diferenças; nenhuma equivalência de segurança é presumida.

Dinâmicas preservam formatos canônico/legado, namespaces, defaults de deferral,
rejeição de mistura de formatos, registro de resposta pendente e cancelamento.
Hospedadas preservam precedência de web standalone, omissão em ResponsesLite,
capabilities do provider, modos Cached/Indexed/Live/Disabled e tipos de conteúdo.
O adapter de extensão conserva payload, ambientes, histórico e emissão de itens.

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/dynamic-factories/pipelines/generate.py --check
```

O comando somente leitura reconstrói o inventário duas vezes, autentica os
arquivos contra objetos Git e verifica o manifesto e treze adulterações.
Sem `--check`, grava apenas inventory, verification e manifest nesta pasta.
Leitor Python da biblioteca padrão; duas funções de lexer local são carregadas
por AST, sem avaliar o módulo inteiro ou importar código do alvo.

Os controles por igualdade com regeneração provam consistência e vínculo de
fonte; revisão independente de conteúdo continua necessária. Texto de módulo
completo preserva marcadores de teste/cfg sem afirmar que todas as declarações
são públicas ou alcançáveis. A projeção não resolve Rust, macros, cfg ou tipos
externos rmcp/serde. Hooks, transportes, efeitos, provider, plataformas e
qualificação por execução continuam pendentes. Zero recibos funcionais; G01
e o objetivo integral permanecem abertos.
