# Source projections — DX100-G01

T1, `IMPLEMENTED`; aprovação independente reservada ao Lead. Contratos:
[pai](../contract.json) e [lane](../projections-contract.json). Nenhum recibo
funcional ou fechamento G01.

O [reader stdlib](reader.py) autentica os nove manifests, seus 386 arquivos e
as respectivas entradas do checkpoint de 474 arquivos. Não executa readers
antigos, importa módulos do alvo ou lê fontes fora dessa whitelist. Manifests
com caminhos relativos são resolvidos na pasta do próprio pacote. O conjunto
físico de cada pacote deve ser exatamente o conjunto declarado.

O [registry](registry.json) contém fragmentos tipados por `inputpath` e
`json_pointer`. `id = src:SHA256(inputpath + NUL + pointer)` é a identidade
reutilizável; `<bytes>` substitui o pointer de arquivos não JSON. O hash do
objeto usa JSON UTF-8 canônico, com chaves ordenadas, sem espaços ou NaN.
`input_file_sha256` autentica o arquivo inteiro. `root_id` liga cada fragmento
ao pacote original. `source_identity` conserva o identificador declarado;
iguais nomes em arquivos diferentes não criam uma junção semântica.

[Schema e seletores](schema.json) documentam as chaves e classes; o
[manifest de inputs](input-manifest.json) fecha a whitelist. Todo arquivo
aceito tem um fragmento raiz. Os seletores expandem as tabelas atuais e
campos diretos selecionados, sem percorrer recursivamente grafos privados.
As raízes preservam também históricos, limites, notas e tabelas não expandidas.
`authenticated_fragment` e `--get ID` devolvem o objeto original completo,
incluindo referências aninhadas, condições, Git blobs, spans e aliases. Essas
referências permanecem no input autenticado; os spans não são copiados para
o registry. O pool `json_nodes` e os perfis de sintaxe são objetos de schema
completos referenciados por pointer, sem repetição de todos os seus nós.

Vínculos de requisitos e owners são extraídos apenas dos campos explícitos
documentados no schema. `entry_requirement` e `future_variant_family`
representam a entrada; `effect_requirement_candidates` continua candidato.
Strings Rust em `owner` não são owners DX100. `OPEN_UNASSIGNED` é preservado
quando o artefato não fornece requisito. Nenhuma relação por nome, título,
arquivo ou proximidade é inferida. O consumidor pode obter o objeto original
e interpretar relações explicitamente declaradas sem perder seus qualificadores.

Classes de suporte, campos, sintaxe, metadata, linguagem e futuros oráculos
têm denominadores distintos; a soma de fragmentos não mede funções públicas.
Os 36 handlers são um **dicionário**, preservado por chave; os 39 registros,
incluindo um de teste, são metadata. Dynamic, ToolSearch, CodeMode e AgentV2,
aliases e seus vínculos declarados permanecem acessíveis. `root_enum` é uma
string; 30 variantes raiz estão contidas nas 82 variantes CLI. Os 105 tipos
CLI e os tipos privados exec são metadata. Python tem 37 exports públicos,
separados de `definitions`; os 34 exports TypeScript não os qualificam.

O [sumário](summary.json) registra contagens independentes, inclusive os 274
contratos, cinco contratos sem JSON público, 186 respostas, 103 chaves de
configuração, 455 documentos, 309 campos CLI e 1.459 casos futuros. Os 291
owners de efeito TUI, seis gaps SDK e cinco limites externos continuam
`OPEN`; todos os fragmentos têm `future_qualification: NOT_RUN` e recibo nulo.
O censo TUI de 1.131 arquivos e o contexto integrado de 1.135 são suporte.
As 370 famílias futuras TUI têm pointers próprios: 65 de comandos, 291 de
eventos e 14 identidades de famílias de views. Os vínculos declarados como
`PROPOSED_*` ou `CANDIDATE_*` permanecem em `candidate_bindings`, com
`semantic_owner_status: OPEN_NOT_QUALIFIED`.

Comandos a partir da raiz do repositório, sem dependências adicionais:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/variant-registry/projections/reader.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/variant-registry/projections/reader.py --negative-tests
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/variant-registry/projections/reader.py --links
```

`--check` reconstrói duas vezes em memória, compara todos os fragmentos,
schema, sumário, inputs e manifesto estrito, sem gravações. `--negative-tests`
também é somente leitura: muta inputs e artefatos em memória, passa os dados
pelos seletores reais e verifica semântica além dos hashes de arquivo/objeto.
`--write` só regenera os quatro JSONs derivados desta lane; `--seal` somente
emite seu manifesto, depois das verificações. O manifesto exclui apenas a si
mesmo; seu SHA deve ser registrado pelo Lead fora do conjunto selado.

Resultados reais, falhas de desenvolvimento e limites ficam em
[comandos](commands.json), [verificação](verification.json),
[notas](development-notes.json) e [handoff](handoff.json). G02, G03 e G04,
revisão independente e qualificação funcional continuam responsabilidade do
Lead. Ledgers, catálogo, fonte e pacotes aceitos permaneceram somente leitura.
