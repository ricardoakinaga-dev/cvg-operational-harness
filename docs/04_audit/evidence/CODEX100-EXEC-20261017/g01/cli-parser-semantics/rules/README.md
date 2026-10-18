# CLI — regras declaradas e parsers explícitos

Inventário T1 da fonte `8d9f6466ff0294785d56f55b1fe363d132fe4133`.
Preserva os 305 objetos de campo históricos: 227 argumentos, 33 flatten,
16 subcommand, 21 skip e oito campos de wrappers manuais. Não transforma
campos de dados em argumentos efetivos.

O leitor reconstitui as propriedades dos campos pelos bytes de origem e
conserva metadata de 105 tipos e 82 variantes (30 raiz e 52 aninhadas).
Propriedades como alias, default, ArgAction, num_args, delimitadores, grupos,
requires/conflicts/global e cfg ficam explícitas. A projeção histórica de
chaves é preservada; `lossless_property_syntax` também guarda o argumento
completo de expressões como `group(ArgGroup::new(...))`, além do código bruto.

As 14 seleções explícitas de parser correspondem a dez expressões distintas.
Há 39 corpos de funções/helpers, o impl TypedValueParser completo e sua
declaração; quatro campos adicionais de Windows e as quatro adaptações
manuais conservam seus vínculos e mutações. A gramática Windows mantém
grupo obrigatório, cfg, seletor e validação pós-parse de `--elevated`.

Diferenças que os futuros oráculos precisam observar:

- Parsers de caminho e socket resolvem caminhos relativos pelo cwd; nome de
  tipo AbsolutePathBuf não significa rejeição automática de entrada relativa.
- KEY=VALUE divide no primeiro `=`, remove espaços do nome e preserva o valor,
  inclusive vazio ou com outros `=`. Nome vazio e separador ausente falham.
- Tentativas usam usize e intervalo inclusivo 1–4; limite usa i64 e 1–20;
  erros de parse e de intervalo são distintos. O parser u64 de throughput
  declara range com mínimo um, sem expansão de macro aqui.
- O host code-mode exige UTF-8 e URL http/https com host, sem credenciais,
  fragmento, query ou path diferente de `/`. O impl de erro/redação é fonte,
  sem prova de comportamento por biblioteca nesta rodada.
- UUID de ThreadId não impõe v7 na entrada; StringValueParser mapeado para
  RedactedString e NonEmptyStringValueParser permanecem fronteiras explícitas
  de Clap. Não se presume que non-empty remova ou rejeite whitespace.
- Overrides `-c` tentam TOML por tabela sentinela e fazem fallback para string;
  normalizam chave legada e conservam ordem de precedência raiz/subcomando.
  Dotted keys ainda são strings nesse parser; aplicação pelo config loader
  é uma fronteira posterior.
- Flags remotas, autenticação, worktree e strict-config também têm rejeições
  pós-parse. Conhecimento de feature usa registry canônico e aliases legados.
  Aceitar uma flag Codex de bypass não concede grant no harness CVG.

Reprodução offline a partir da raiz:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-parser-semantics/rules/reader.py --check
```

Sem `--check`, grava apenas inventory.json e verification.json desta lane.
O leitor importa somente o parser de auditoria local anteriormente revisado,
validando seu hash; não importa ou executa código do alvo. As fontes regulares
são comparadas ao blob Git pinado. Os controles negativos incluem remoção de
campos, skip, parser, default, relação, alias, cfg, grupo, impl tipado e
qualificação falsa. Mutações somente em memória de range, trim, alias de config
e alias de argumento precisam alterar conteúdo extraído ou falhar pelo parse
da propriedade, além de mudar um digest.

Funções auxiliares seguem apenas chamadas livres com nome único no mesmo
arquivo; corpos e referências externas ficam como evidência. Não é callgraph
completo, schema Clap expandido, avaliação de cfg ou execução de gramáticas.
Defaults são expressões lexicais; nulabilidade, requiredness e erros exatos
de bibliotecas/plataformas precisam de referência executável. Zero recibos
funcionais, G01 e objetivo integral permanecem abertos.
