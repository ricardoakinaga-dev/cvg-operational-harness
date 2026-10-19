# Contratos TypeScript por AST de sintaxe

Recorte T1 do pin `8d9f6466ff0294785d56f55b1fe363d132fe4133`.
[Inventário](inventory.json), [leitor](reader.mjs) e
[verificação](verification.json) preservam os dez módulos `src`, o manifesto
do pacote e os 34 exports históricos. As 36 funções/assinaturas incluem
callbacks e suporte privado; não representam 36 funções públicas qualificadas.

O leitor autentica os arquivos locais do analisador TypeScript 6.0.3, o contrato,
o catálogo, o checkpoint anterior e os blobs Git antes de extrair a AST.
`createSourceFile` analisa texto. Não há `Program`, checker, emit, transpile,
import do SDK, avaliação de defaults ou execução do processo Codex. A versão
declarada pelo SDK é `^5.9.2`; a ferramenta local não prova equivalência com ela.

Cada método, campo, tipo, chamada, parâmetro, alias e comentário relevante mantém
bytes UTF-8, linhas, digest e texto exatos. Visibilidade da linguagem e anotação
`@internal` são separadas. Nomes computados, privados e default anônimo são
preservados com limites explícitos. Relações entre módulos são candidatas
estáticas; não substituem resolução de tipos ou publicação efetiva do pacote.

O SDK usa `codex exec --experimental-json` e eventos pontuados, como
`turn.completed`. Python usa RPC do app-server. Os cinco grupos de regras
cobrem JSONL, agregação de turn, entrada, processo e schema temporário, com
oráculos de runtime ainda abertos. Implementação nativa CVG não pode encaminhar
suas execuções ao Codex instalado e chamar isso de paridade nativa.

Reprodução na raiz do repositório:

```sh
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/typescript/reader.mjs --check
```

Sem `--check`, somente os dois JSONs desta lane são escritos. `--check` deriva
duas vezes e compara os bytes sem escrever. Dez mutações semânticas de fonte
em memória incluem duas alterações no corpus real; seis controles adicionais
verificam adulteração do artefato por desigualdade de regeneração. Estes seis
não são seis testes independentes da semântica do SDK. Cinco controles de
sintaxe mantêm casos difíceis e rejeitam erro de parse. Tudo é prova do leitor,
sem recibo funcional, typecheck ou fechamento de G01.
