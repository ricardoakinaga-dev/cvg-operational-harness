# SPEC-DOC-001 — Gerador do índice operacional (L03)

## Registro e status

- Versão: 0.4; explicita o corte no primeiro histórico, precedência dos contextos Markdown e limites do subconjunto de links.
- Task de origem: [L03 — Gerar navegação documental derivada](../03_build/0341_50_improvements_backlog.md), P3-S7.
- Relação: A29-10 / A24-11 trata da reconciliação e frescor da navegação; esta SPEC trata somente da geração determinística do bloco de links correntes.
- Status: `SPEC_DRAFT_FOR_REVIEW`; revisão I1 fresh-context não foi criada (`agent thread limit reached`); revisão humana e gate de BUILD ainda não realizados.
- PRD de produto: não aplicável ao utilitário documental interno. O backlog L03 é o requisito de origem. Se o escopo incluir experiência do usuário ou comportamento do produto, abrir PRD próprio antes de ampliar esta SPEC.
- Autoridade: este documento é proposta técnica; não autoriza código, execução do gerador ou checks. O C1H tem decisão e escopo independentes.

## Objetivo e fronteiras

Gerar de forma determinística um bloco de navegação corrente dentro de
`docs/99_operational_index.md`, usando somente referências citadas nos blocos
correntes dos ledgers autorizados. O índice continua sendo navegação; os
ledgers continuam sendo as fontes mutáveis de status e decisões.

O gerador não interpreta o significado de palavras como `APPROVED`, `PASS`,
`NO_GO` ou `WAITING_HUMAN_APPROVAL`; não cria, concede ou infere approval,
certification, gate, release ou acesso à produção. Ele copia rótulos e destinos
de links existentes e os apresenta como referências citadas pelas fontes.

## Requisitos funcionais

1. Ler somente estes arquivos, em ordem fixa:
   - `docs/99_runtime_state.md`;
   - `docs/20_master_execution_log.md`;
   - `docs/30_backlog_master.md`.
2. Resolver a raiz do repo uma vez; cada input e o índice-alvo devem ser
   arquivos regulares, não symlinks, e canonicamente permanecer dentro da raiz.
   Ler inputs e índice-alvo como UTF-8 estrito, sem BOM; preservar os bytes
   originais para `--check` e `--write`. Fonte/alvo ausente, encoding inválido
   ou erro de leitura invalida a geração.
3. Percorrer linhas em ordem, mantendo os estados de fence e comentário, e
   parar assim que o primeiro delimitador elegível da regra 4 for encontrado.
   Validações estruturais deste requisito cobrem somente o prefixo corrente;
   bytes posteriores pertencem ao histórico e não são inspecionados.
   - Fence abre com 0–3 espaços seguidos de pelo menos três backticks ou tils.
     Fecha com o mesmo caractere, run de tamanho igual ou maior e apenas
     espaços/tabs depois. Enquanto aberto, o texto não forma delimitador nem
     link. Fence sem fechamento antes do delimitador invalida a fonte. Um
     fence de backticks não pode ter backtick no info string.
   - Comentários HTML começam em `<!--` e terminam no primeiro `-->` seguinte,
     inclusive entre linhas. Conteúdo comentado não forma delimitador nem
     link. Comentário sem fechamento antes do delimitador invalida a fonte;
     comentários não aninhados sempre usam o primeiro fechamento.
   - Fora de fence/comentário, linha iniciada por tab ou 4+ espaços é código
     indentado e não forma delimitador. Se contiver candidato link-like — um
     `[` não escapado seguido na mesma linha por um primeiro `](` não escapado
     — falhar como `UNSUPPORTED_INDENTED_LINK` com arquivo/linha; não descartar
     silenciosamente uma citação possível nem extrair código.
   - Para links, runs de backticks não escapados por número ímpar de barras
     invertidas mascaram somente conteúdo na mesma linha até um run de tamanho
     igual. Run sem par é texto literal. Span mascarado dentro de candidato
     `[...](...)` torna o candidato `UNSUPPORTED_INLINE_CODE_IN_LINK`; não
     extrair parcialmente o token.
4. Em cada fonte, o delimitador é a primeira linha física fora de
   fence/comentário/código indentado que corresponda literal e case-sensitive
   a `^ {0,3}##[ \t]+Histórico(?:[ \t]+.*)?[ \t]*$`. Prefixos explícitos de
   blockquote/lista, como `> ## Histórico` e `- ## Histórico`, não
   correspondem. O parser é line-oriented e não infere containers Markdown:
   uma linha isolada com até três espaços e esse padrão corresponde mesmo se
   usada como continuação de lista. A linha do delimitador e todo conteúdo
   posterior não são lidos, decodificados ou validados. Ausência do primeiro
   delimitador invalida a fonte.
5. Extrair apenas links inline de uma linha no subconjunto abaixo. Referências
   definidas/não definidas, autolinks, HTML `<a>`, texto livre e blocos de
   código não são links citados e não entram no resultado. Não usar regex que
   atravesse linhas nem fallback que tente adivinhar sintaxe inválida.
6. Interpretar o subconjunto caractere por caractere, fora dos contextos
   ignorados acima. Não há whitespace entre `]` e `(` nem depois de `(`. Label
   é não vazio e de uma linha: o primeiro `]` não escapado fecha o label; `[`
   não escapado dentro dele é nesting e falha. Os únicos escapes de label são
   `\\`, `\[` e `\]`. Destination sem angle-brackets é um token não vazio,
   sem whitespace/control literal; parênteses literais precisam estar
   balanceados e somente `\\`, `\(` e `\)` podem escapá-los. Span inline-code
   dentro do candidato é rejeitado conforme a regra 3. Destination entre
   `<...>` fecha no primeiro `>` e não aceita espaço, `<`, backslash ou
   control literal. Título opcional requer um ou mais espaços/tabs ASCII após
   o destination e consiste em um token de uma linha: aspas simples aceitam
   `\\` e `\'`, aspas duplas aceitam `\\` e `\"`, e título entre
   parênteses não aceita nesting e só aceita `\\`, `\(` e `\)`. Depois do
   título, somente espaços/tabs ASCII podem preceder o `)` de fechamento.
   Qualquer escape, nesting ou caractere fora desse contrato falha com
   arquivo/linha. A extração suporta somente `[label](destination)`,
   `[label](<destination>)` e essas formas com título opcional. Um `[label]`
   sem `(` não é candidato e é ignorado; `[label](` com sintaxe quebrada é
   erro, não texto literal.
7. Destinos com esquema `http`, `https`, `mailto` ou `tel` (comparado sem
   diferenciar maiúsculas/minúsculas) são referências externas permitidas e
   ignoradas. Esquema explícito é detectado no início do destination já
   interpretado por `^[A-Za-z][A-Za-z0-9+.-]*:`; qualquer outro esquema,
   destination absoluto, path protocol-relative (`//host/...`) ou path vazio
   com query é rejeitado; âncora
   isolada `#fragment` é ignorada. Para link local, separar no primeiro `#`;
   depois separar path e query no primeiro `?` antes do fragmento. Query e
   fragment vazios ou presentes são preservados byte a byte. `?`/`#` literal no filename exige
   percent-encoding. Percent-decodificar o path exatamente uma vez em UTF-8 e
   rejeitar encoding inválido ou NUL. Resolver relativo ao diretório da fonte;
   exigir destino existente e arquivo regular, usar `realpath` na raiz do repo e
   no destino. O destino canônico precisa permanecer dentro da raiz; symlink
   em qualquer segmento que escape da raiz é rejeitado; `..` é aceito somente
   se o destino canônico permanecer dentro da raiz. Backslash literal no
   path é proibido. As três fontes fixas e o índice ficam no mesmo diretório
   `docs/`; validar essa igualdade antes de copiar o href sem reescrita.
8. Manter uma seção por ledger de origem. Preservar ordem fixa das fontes e a
   primeira ocorrência dentro de cada fonte. Deduplicar somente por destino
   canônico, query e fragmento; links para anchors diferentes no mesmo arquivo
   permanecem distintos. Na duplicata, manter a primeira forma Markdown
   original. Não deduplicar ocorrências entre seções de fontes distintas.
9. Renderizar exatamente este template fixo, mantendo os nomes de seção e
   ordem abaixo, inclusive a seção vazia sem placeholder textual. Copiar
   somente os tokens Markdown validados, sem texto de status ou verdict:

   ```md
   ## Links citados nos blocos correntes

   ### Runtime state
   - [link inline original]

   ### Master execution log
   - [link inline original]

   ### Master backlog
   - [link inline original]
   ```

   O bloco ocupa somente o conteúdo entre estes marcadores, cada um em sua
   própria linha, em ordem e com uma ocorrência exata no índice:
   - `<!-- GENERATED CURRENT REFERENCES:BEGIN -->`
   - `<!-- GENERATED CURRENT REFERENCES:END -->`
   A geração e o modo `--check` não podem alterar bytes antes, depois ou nas
   linhas dos marcadores.
10. O modo `--check` é somente leitura: exit 0 se o bloco atual for idêntico
    ao resultado gerado; exit diferente de zero em caso de drift ou entrada
    inválida. Nenhum temp, lock ou output auxiliar pode ser criado.
11. O modo `--write` atualiza apenas o bloco marcado no alvo fixo. Deve recusar
    par ausente ou repetido, ordem invertida, marcador com whitespace extra,
    symlink no arquivo-alvo ou linha de marcador malformada. Validar entradas e
    render completo antes de criar temporários. A implementação nunca cria ou
    repara marcadores ausentes; o bootstrap da primeira execução precisa ser
    um delta de SPEC/gate que insere o par exato no índice antes de `--write`.
    Usar lock exclusivo adjacente criado com `wx`; lock já existente falha sem
    mutação e nunca é removido por outro processo.
12. Criar temp único no mesmo diretório, preservar mode bits do alvo, escrever
    os bytes com newline final, sincronizar e comparar o alvo corrente com os
    bytes originais imediatamente antes do rename. Re-hashear também as três
    fontes e abortar se qualquer input mudou desde a leitura. Drift concorrente
    do target ou das fontes aborta sem
    sobrescrever a edição concorrente. Renomear atomicamente apenas depois de
    todas as validações; limpar temp e lock próprios em qualquer saída. As
    únicas criações temporárias permitidas são esses dois nomes efêmeros no
    diretório do índice; ambos devem estar ausentes após saída normal. Um lock
    residual após crash exige recuperação manual; não o remover automaticamente.

## CLI proposta

```text
node scripts/generate-operational-index.mjs --check
node scripts/generate-operational-index.mjs --write
```

Argumento ausente, opção desconhecida ou combinação de modos falha com uso
curto e sem mutação. Não há `--source`, output path arbitrário, rede,
instalação de dependência, banco ou configuração externa.

## Invariantes de segurança e determinismo

- A lista de fontes é constante no código e validada antes de qualquer escrita.
- O conteúdo histórico fora do primeiro bloco corrente não é lido para gerar a
  navegação e permanece byte-idêntico.
- Heading-looking text dentro de fence, comentário HTML ou código indentado
  não vira delimitador. Prefixos de blockquote/lista não correspondem ao
  padrão; continuação sem prefixo segue o matcher line-oriented da regra 4.
  O parser usa somente o subconjunto descrito acima e falha fechado em
  ambiguidade.
- Depois do primeiro heading `## Histórico ...`, headings posteriores não são
  contados como delimitadores duplicados nem lidos como fontes correntes.
- Destinos locais resolvem a partir da fonte e por `realpath`; traversal e
  symlink escape falham. Percent-decoding, query e fragment têm regras únicas.
- Links repetidos usam destino canônico + query + fragmento; anchor distinto
  permanece visível; ordem e desempate são determinísticos.
- O gerador não copia estados, decisões, hashes ou critérios de gate como
  afirmações próprias; não modifica os arquivos-fonte.
- Para `--write`, validar entradas e renderizar integralmente antes de gravar;
  escrever por arquivo temporário no mesmo diretório e renomear somente depois
  da validação. Falha anterior à troca não pode deixar bloco parcial.
- `--write` só opera com o par de marcadores já presente; sua inserção inicial
  faz parte de um delta de índice explicitamente aprovado e com rollback.
- O output usa UTF-8, newline final, ordenação estável e sem timestamp, host,
  variável de ambiente ou dado volátil.

## Tratamento de falhas

Fonte ausente, primeiro delimitador de histórico ausente, link inválido,
path traversal, marcador inválido ou erro de leitura resulta em falha fechada,
mensagem que identifica o arquivo/linha quando possível e nenhuma escrita.
Erro de escrita mantém o original disponível para rollback e retorna exit
diferente de zero.

## Critérios de aceite para BUILD/AUDIT futuros

- Duas execuções `--check` sem mudanças nos inputs retornam o mesmo resultado;
  `--write` seguido de `--check` é idempotente.
- Links existentes em fontes correntes aparecem no grupo da fonte correta;
  links citados somente após o delimitador histórico nunca aparecem no bloco
  gerado.
- Fontes com vários headings `## Histórico ...` depois do primeiro delimitador
  são aceitas; o bloco gerado contém somente links anteriores ao primeiro.
- Duplicatas, links quebrados, path traversal, marcador ausente/duplicado ou
  primeiro delimitador ausente falham sem modificar o índice.
- Headings/links dentro de fences, comments e código indentado não são
  extraídos; heading histórico nesses contextos não encerra a seção.
  Fence/comment não fechado antes do primeiro delimitador falha sem mutação;
  conteúdo histórico depois dele, mesmo com fence/comment não fechado, não é
  inspecionado.
- Prefixos de blockquote/lista e continuação de lista devem obedecer
  literalmente ao matcher da regra 4; não implementar inferência de containers.
- Link inline com span inline-code dentro do token falha como
  `UNSUPPORTED_INLINE_CODE_IN_LINK`; run de backtick sem par é literal. Candidato
  link-like dentro de linha indentada falha como `UNSUPPORTED_INDENTED_LINK`.
- Symlink file/directory que escape do repo, esquema URI não permitido,
  percent-encoding inválido, link candidato malformado, fragmentos distintos
  e query/fragment preservados têm casos sintéticos positivos/negativos.
- Input ou índice-alvo symlink e link-like syntax em linha indentada falham
  conforme as regras acima, sem gravação. Marcador citado apenas em blockquote
  ou lista não satisfaz o par de marcadores do alvo.
- Link-like syntax em linha indentada com tab/4+ espaços falha com
  `UNSUPPORTED_INDENTED_LINK`; destinos com `..` que permanecem dentro da raiz
  passam e destinos que saem da raiz falham.
- Bytes fora do bloco delimitado são idênticos antes e depois de `--write`.
- Drift concorrente do índice aborta o write; lock/temp são exclusivos,
  limpos ao final normal e não alteram o conteúdo em falha pré-rename; mode
  bits do índice são preservados.
- Testes usam apenas diretórios e Markdown sintéticos; nenhuma fonte ou dado de
  produto é carregado por fixture externo.
- `node scripts/check-doc-links.mjs docs/99_operational_index.md` passa após a
  geração. Este check não substitui as provas de falha, idempotência ou
  preservação de bytes.

## Write-set, rollback e gate

Write-set de código proposto, sujeito a gate próprio:

- `scripts/generate-operational-index.mjs`;
- `tests/generate-operational-index.test.js`;
- `docs/99_operational_index.md` (marcadores e bloco gerado somente).

Sem dependência npm nova, mudança de `package.json`, alteração dos ledgers,
modificação de histórico ou mudança de contrato do produto. Antes de BUILD, o
gate deve confirmar que os dois novos paths estão ausentes, congelar os bytes
baseline do índice e registrar rollback que restaure o índice e remova somente
os arquivos novos deste write-set. O command plan deve incluir modo sintético,
`--check`, link checker, captura individual de exit code/duração e pós-check do
write-set.

É necessária aprovação humana específica do packet final porque A29-10 exige
task/SPEC/gate para automação. Aprovação C1H, L02 ou reconciliação manual AUD38
não se transfere a este BUILD. Até revisão/aprovação próprias, nenhum código ou
comando do gerador está autorizado.
