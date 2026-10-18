# G01 — parsing da CLI

Unidade T1 `DX100-G01:RESOLVE-CLI-PARSER-SEMANTICS`, fonte oficial pinada em
`8d9f6466ff0294785d56f55b1fe363d132fe4133`. Catálogo487+22 preservado,
zero recibos funcionais. Este pacote vincula regras e variantes de fonte;
G01 e a incorporação nativa integral continuam em andamento.

Os **305 campos históricos e quatro adicionais de Windows** têm disposição
explícita. São preservados 105 tipos do grafo de comandos, 82 variantes,
quatro adapters e 12 superfícies manuais/arg0. Os wrappers, campos skip e
campos de dados não viram argumentos por inferência.

A [frente de escalares](scalars/README.md) liga imports/reexports a 18
definições, 34 variantes e 46 impls, mantendo std/bibliotecas externas como
fronteiras OPEN. As [regras explícitas](rules/README.md) ligam 14 seleções a
dez expressões e 39 corpos de função/helper, incluindo config, validações
pós-parse e TypedValueParser completo. Parser explícito mantém precedência;
nenhuma variante ValueEnum é promovida silenciosamente ao parser efetivo.

[integration.json](integration.json) vincula os 309 campos ao requisito CLI
existente/dono, parser/tipo, propriedades, contexto e fonte. Conserva grupos
com argumentos completos, aliases, defaults, cfg, mutações manuais e a
gramática Windows. Registra **1.459 famílias de aceites futuros**, todas
NOT_RUN: presença/ausência, erros, defaults, aliases, relações, repetição,
variantes de escalares, plataforma e contextos manuais. Elas não são exemplos
executados, testes aprovados ou novos recibos de paridade.

Regras que precisam chegar aos futuros oráculos e implementação:

- Caminhos e sockets podem ser relativos ao cwd; env KEY=VALUE remove espaços
  do nome, preserva o valor e divide no primeiro `=`.
- Config `-c` usa TOML com fallback para string e ordem raiz/subcomando;
  dotted keys são texto nesse parser e têm aplicação posterior pelo loader.
- Ranges, erros, aliases e conversões são distintos dos tipos declarados.
  Clones de estrutura/schema não comprovam aceitação de input.
- Endpoints/auth, worktree, feature flags e strict-config têm regras
  pós-parse. Config/approval/bypass aceitos pelo Codex não ampliam grant CVG.
- cfg e condições herdadas de módulos/flatten/aliases ficam simbólicas.
  Nenhum branch de plataforma ou gramática externa foi executado.

Reprodução offline a partir da raiz:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-parser-semantics/rules/reader.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-parser-semantics/scalars/reader.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-parser-semantics/integrate.py --check
```

Os leitores usam stdlib/Git e helpers de auditoria anteriores autenticados;
nenhum código do alvo é importado, compilado ou executado. Sessenta controles
negativos verificam os leitores/integração. São conferidos 69 blobs Git e
3.146 ocorrências de spans, preservando 313 arquivos dos sete recortes
anteriores. Atestação de bytes não equivale a inspeção semântica manual integral.

Contratos: [pai](contract.json) e [escalares](scalars-contract.json).
Campos, impls e candidatos de parser são evidência de fonte; seleção efetiva
Clap, gramática, cfg/macros, env/cwd, TUI, plataformas e efeitos continuam
sujeitos a oráculos funcionais. Permanecem obrigatórias seis lacunas SDK/
Python/TS/RPC/distribuição, cinco limites externos anteriores e G02/G03/G04.
Nenhum BUILD de runtime ou fechamento geral de G01 é concedido por este pacote.
