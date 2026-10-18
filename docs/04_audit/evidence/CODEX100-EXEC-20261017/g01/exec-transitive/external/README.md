# DX100-G01 — contratos externos de exec-server

`IMPLEMENTED`, revisão independente pendente. Evidência T1 de fonte; zero recibos
funcionais. Os três contratos têm source autenticado e runtime explicitamente
`OPEN`. Nenhum aceite de G01, paridade, produção ou autoridade CVG é concedido.

O contrato vigente é [external-contract.json](../external-contract.json), SHA256
`c2912831cd59136cb76dfd3c37443e80d5059fb18abc62ea8ea884a0ae29fcfb`.
O [contrato pai](../contract.json) tem SHA256
`d3f493fcd507a405533994692ef2cd235bd5d31dabb351afb9ea6e3bb15d4288`.
O pin Git é `8d9f6466ff0294785d56f55b1fe363d132fe4133` e o Cargo.lock tem
SHA256 `6f63e126b80490d838f618f48a209ccaabe202d8dfd8c27d4ca692c7be4d6bfd`.

| ID estável em `inventory.json.crates[]` | Versão  | Owners históricos | Checksum do archive                                                |
| --------------------------------------- | ------- | ----------------- | ------------------------------------------------------------------ |
| `external:serde_json::Value`            | 1.0.149 | 4                 | `83fc039473c5595ace860d8c4fafa220ff474b3fc6bfdb4293327f1a37e94d86` |
| `external:url::Url`                     | 2.5.8   | 1                 | `ff67a8a4397373c3ef660812acab3268222035010ab8680ec4215f38ba3d0eed` |
| `external:uuid::Uuid`                   | 1.20.0  | 1                 | `ee48d38b119b0cd71fe4141b30f5ba9c7c5d9f4e7a3a8b4a674e4b6ef789976f` |

## Conteúdo e join

[inventory.json](inventory.json) contém `crates[]`, `local_sites[]`,
`local_feature_declarations[]`, `sources{}`, `lexical_index[]` e `limits[]`.
Cada contrato tem `id`, `symbol` histórico, `original_owners`, `binding`,
`source_status`, `codec_contract` e `selected_members`. `binding` preserva o
registro congelado, inclusive sua qualificação histórica anterior ao download.
A qualificação atual da fonte está em `source_status`, sempre
`AUTHENTICATED_SELECTED_SOURCE_BOUND_RUNTIME_OPEN`; `qualified_runtime=false`.
O campo `id` é a chave recomendada para joins aditivos do Lead. Novos owners,
inclusive `initialized.params`, podem referenciar o ID de Value sem alterar os
seis registros históricos. Operações e tipos internos pertencem à lane do Lead.

Cada source conserva texto integral do arquivo selecionado, SHA256, tamanho e
span UTF-8 com offsets em bytes, final exclusivo e linhas base 1. Proveniência
Git inclui pin/path/blob SHA1; proveniência de crate inclui URL, checksum do
archive e member exato com prefixo versionado. O inventário dos 137 membros
regulares dos archives é de integridade; somente 24 membros foram selecionados
para os contratos. Os arquivos de terceiros são dados, nunca imports ou comandos.

Os 141 arquivos-fonte incluem os 24 membros, três codecs locais e 114 manifests
com declarações relevantes. O scan de 163 Cargo.toml do recorte `codex-rs/`
produziu 246 declarações locais, com contexto workspace/target/dev/build,
aliases, optional, defaults e features declaradas. O índice lexical contém
2.503 spans; a conferência completa verifica 2.677 spans UTF-8. Isso não é
parser semântico Rust, expansão de macro, avaliação de cfg ou resolução Cargo.

## Fronteiras preservadas

- `Value`: seis variantes, default Null, serde Serialize/Deserialize e
  alternativas Number/RawValue. Number preserva as representações com e sem
  `arbitrary_precision`, finiteza e private token; Map preserva BTreeMap versus
  IndexMap. O manifesto de exec-server-protocol declara `arbitrary_precision`
  e `raw_value`; TUI declara `preserve_order`, sem inferir sua ativação neste
  build. O codec local de `rpc.rs` usa budget de 256\*1024 nós, wrappers privados,
  reparse/end de raw e rejeição de chaves duplicadas; os deserializadores
  derivados diretos dos envelopes não são equiparados ao wrapper limitado.
- `Url`: serde próprio é condicional à feature `serde` e emite/recebe string.
  O `PathUri` local usa codec próprio: String -> parse -> Url -> TryFrom,
  validação de scheme file, metadados e NUL, normalização localhost/drive.
  Não depende de ativar o trait serde de Url. Parser/host/IDNA são ligados por
  fonte; conversões e comportamento nativo continuam abertos.
- `Uuid`: serde genérico tem branches human-readable/string e binary/bytes,
  gated em `src/external.rs`. Parse suporta simple, hyphenated, braced e URN;
  Display usa lowercase/hyphenated. `ThreadId` usa `collect_str` e
  String -> parse_str, sem impor v7 na entrada. Seu default/new usa now_v7,
  diferente do default nil de Uuid. RNG/tempo não foram qualificados.

`limits[]` mantém cinco classes `OPEN`: dependências terceiras não auditadas,
unificação Cargo/features/target, URL/IDNA/plataforma, gramática/runtime e
G01/paridade. Fonte e checksum não provam correção nem segurança dessas fronteiras.

## Reprodução

Na raiz do repositório, com Python 3.11+ e Git já disponíveis:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/external/reader.py --check
```

`--check` é offline e somente leitura. Exige os três archives autenticados em
`/tmp/cvg-codex100-exec-20261017/exec-transitive/crates/` e os objetos Git do pin
em `/tmp/cvg-rea-codex-20261017/upstream`. Falta ou drift mantém saída `OPEN`
com exit 1; o check nunca faz fetch. Git usa `GIT_NO_LAZY_FETCH=1` e
`GIT_OPTIONAL_LOCKS=0`. `-B` evita escrita de pycache.

`--write` regenera apenas inventário, verificação e manifesto nesta lane.
`--fetch`, usado uma vez nesta entrega, permite somente os três URLs HTTPS
exatos `https://static.crates.io/crates/NAME/NAME-VERSION.crate`, sem proxies
ambientais e sem redirects para outro host ou recurso. Cache autenticado evita
novo download. Nenhum Cargo, compiler, instalação, extração em disco ou runtime
do alvo é usado. Dados tar só são lidos depois do SHA256: até 8 MiB comprimidos,
32 MiB de dados regulares, 40 MiB de stream tar e 10.000 members por archive.
Links, dispositivos, traversal, absolutos, duplicatas e prefixos alheios são
rejeitados. `extractfile` é leitura em memória; `extract`/`extractall` não existem
no reader.

[verification.json](verification.json) registra duas gerações determinísticas,
253 inputs históricos preservados e 38 negativos rejeitados: artefatos omitidos
ou adulterados, input de lock/source, checksum, spans UTF-8, qualificação falsa
e tar inseguro/oversized. Os negativos são controles do reader, nunca testes
do alvo. [download.json](download.json) registra os três downloads autenticados.
[commands.json](commands.json) contém comandos/saídas/exit e controle offline
com sockets Python bloqueados e snapshots de somente leitura.

[manifest.json](manifest.json) autentica os arquivos desta lane, exceto a si
mesmo; seu SHA256 deve ser registrado externamente pelo Lead. Não é assinatura
ou aprovação independente. O próximo passo está no [handoff](handoff.md).
