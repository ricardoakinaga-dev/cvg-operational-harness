# Revisão crítica independente — SPEC0255 r1

- SPEC: `docs/02_spec/0255_c100_skill_plugin_offline_inspection.md`, revisão r1.
- sha256 conferido antes e depois da revisão: `2bb4e54155150293f4bf29058dc2ed451977d62e018b3c4675fcdbe5b7f9d828`.
- Base: `main` `420b97b3373389f30ac82c4d4078a21b2363fdf9`, worktree `cvg-d9ef-c100-t01-spec-20261022`, só leitura.
- Crítico: sessão Claude independente, que não escreveu a SPEC. Data: 22/10/2026.
- Escrita só nesta pasta. Sem commit, push, PG, install, lockfile ou mudança de cartão.
- Numeração: `M1..M7` são os obrigatórios desta revisão. "Mutante M01..M23" são os da SPEC (§11.1).

## Veredito: REVISE

A SPEC é cuidadosa e rastreável. Ela é honesta sobre o bloqueio do BUILD. As âncoras de código e de documento conferem dentro de ±2 linhas. O desenho geral é bom: inspeção separada de grant, digest por conteúdo, corpo só na seleção e defaults que falham fechado.

Mas há sete obrigatórios. Dois são de segurança provados por sonda: a corrida ABA passa pela releitura de dev/ino (M1), e a listagem de diretório não tem teto (M2). Três são contradições ou lacunas que impedem um BUILD fiel: caps e códigos (M3), gramática e decodificação (M4) e o endurecimento do loader (M7). Um é de prova: dois mutantes nomeados não morrem pelos testes citados (M5). Um é de governança: P1 e P2 se contradizem e pressupõem uma SPEC da PAR-T07 que não existe (M6).

## Obrigatórios

### M1 — A releitura por dev/ino não detecta troca ABA; I3, A05 e A15 não valem com escritor concorrente

**Defeito.** O §7.5 (SPEC:529-534) só compara `dev`/`ino` dos diretórios no fim do item. O §7.4 (SPEC:517-527) usa `O_NOFOLLOW` só no último componente. O `lstat` e o `open` seguem symlink em diretório intermediário. Um atacante com escrita no root troca o diretório da skill por symlink, espera a leitura e devolve o diretório original. O `dev`/`ino` volta igual, e o item sai `COMPLETE` com bytes de fora do root. O §15 (SPEC:762) fala em "janela pequena", mas o atacante pode manter a troca durante toda a leitura. I3 (SPEC:74), A05 (SPEC:709) e A15 (SPEC:719) são escritos como absolutos.

A integridade da seleção continua protegida pelo digest: os bytes devolvidos são os aprovados. O vazamento é de confidencialidade no inventário: sha256, tamanho e descrição redigida de arquivo de fora.

**Evidência.**

- Sonda do crítico, seção A (Node v22.23.2), com implementação literal do §7.4–7.5: `coverage: COMPLETE`, `bodyCode: OK`, `outsideMarkerRead: true`.
- O repositório já tem algoritmo mais forte: `scripts/boundary-installed-identity.mjs:227-276`. Ele compara uma assinatura bigint completa (`dev`, `ino`, `mode`, `nlink`, `size`, `mtimeNs`, `ctimeNs`) antes, durante e depois da leitura, e refaz o `lstat`. Na sonda, o ABA por rename muda o `ctimeNs` do diretório e o `mtime`/`ctime` do root (`fullSignatureChanged: true`).
- No Linux há forma ainda mais forte, sem `openat`. Abrir cada diretório com `O_RDONLY|O_DIRECTORY|O_NOFOLLOW` (diretório-symlink dá `ENOTDIR`). Depois abrir os filhos por `/proc/self/fd/<dfd>/<nome>` com `O_NOFOLLOW`. Na sonda, a leitura ficou presa ao diretório original mesmo com a troca (`readInside: true`). Outra opção: depois do `open`, conferir `readlink('/proc/self/fd/<fd>')` dentro do root real. A sonda recusou o ABA (`OUTSIDE_ROOT_BY_FD_PATH`).

**Correção mínima.**

1. Trocar `dev`/`ino` pela assinatura completa bigint de `boundary-installed-identity.mjs:227-231`. Aplicar ao root, ao diretório da skill e a cada subdiretório, antes e depois do item. Por arquivo, comparar a assinatura do `lstat` com o `fstat` antes e depois da leitura e com um novo `lstat`, como `readPhysical` (`:235-276`).
2. Declarar o modelo de ameaça: há ou não escritor concorrente no root. Dizer o que a assinatura cobre e o risco residual (granularidade de timestamp; FS sem `ctime` confiável). Opcional, como defesa a mais: fixar diretórios por fd via `/proc` no Linux, com recusa se `/proc` faltar.
3. Acrescentar ao SK07b o caso ABA (troca por symlink e volta) e o mutante "recheck só por dev/ino".

### M2 — Listagem de diretório sem teto contradiz I4 e A06

**Defeito.** O §7.2, passos 3 e 4 (SPEC:501-502), faz `readdir` completo, ordena e só depois trunca em `maxEntriesPerRoot`. O §7.5, passo 2 (SPEC:532), faz o mesmo nos subdiretórios. O §6.9, passo 2 (SPEC:440), também lista o root inteiro. A leitura de nomes não tem teto. O prazo só é conferido entre arquivos (SPEC:211, 527). I4 (SPEC:75) diz que todo cap tem default e teto rígido.

**Evidência.** `readdirSync` devolve todos os nomes numa chamada síncrona. "Processa as primeiras em ordem" (SPEC:201) exige a lista completa para ser determinístico. Na sonda (seção G), `opendirSync` com `readSync` parou em cap + 1.

**Correção mínima.** Ler no máximo cap + 1 entradas com `opendirSync`. Se passar, dar `CAP_EXCEEDED`, cobertura `INCOMPLETE` e não processar nenhum item daquele diretório, para o resultado ser determinístico. Vale para o root (`maxEntriesPerRoot`), para os subdiretórios (`maxFilesPerSkill`) e para a seleção. Ajustar SPEC:201 e o SK06, com contador de entradas lidas por gancho interno.

### M3 — Caps e códigos contraditórios; JSON inválido sem código nem prova; cobertura do relatório sem definição

**Defeito.**

- (a) O §6.3 (SPEC:209-210) diz que `maxFrontmatterBytes` e `maxDescriptionChars` deixam o item `INVALID`. O SK06 (SPEC:656) exige que "cada cap da tabela §6.3" dê `CAP_EXCEEDED` e `INCOMPLETE`. O §8 (SPEC:570) liga `CAP_EXCEEDED` a `INCOMPLETE` e não tem código para frontmatter acima do cap. O BUILD não consegue cumprir os dois.
- (b) JSON com erro de sintaxe não tem código no enum fechado (§8, SPEC:561-578). A03 (SPEC:707) e SI03 prometem que erro de sintaxe é reportado com escopo. O SK03 (SPEC:653) não tem caso de JSON inválido. O loader copia `error.message` (`loader.ts:138-140`). A mensagem do V8 traz trecho do conteúdo. Sonda: `Unexpected token 'S', "{"a": SYNTH-SECRET}" is not valid JSON`.
- (c) O `coverage` do relatório (SPEC:285) não tem regra de agregação. O §6.4 (SPEC:229) só diz o que afeta a cobertura no nível do root. A condição 1 da admissão (SPEC:421) e o mutante M04 dependem dessa regra. A seleção usa cobertura própria (SPEC:442). Não está escrito que ela pode dar `SELECTED` quando o relatório do mesmo input daria `COVERAGE_INCOMPLETE`, que é o caso do SK08b.

**Correção mínima.**

- Escolher um efeito por cap e alinhar §6.3, §8 e SK06. Por exemplo: `FRONTMATTER_TOO_LARGE` e `DESCRIPTION_TOO_LONG` são `INVALID` e saem do SK06.
- Criar `MANIFEST_SYNTAX_INVALID` (escopo `file`), sem copiar mensagem; no máximo a posição numérica. Pôr o caso no SK03 e um mutante.
- Definir a agregação do `coverage` do relatório. Exemplo: `INCOMPLETE` se houver recusa no root, cap global, prazo vencido ou item `INCOMPLETE`. Escrever a relação com a cobertura da seleção.

### M4 — Gramática e decodificação deixam reinterpretação aberta

**Defeito.**

- (a) A decodificação de `SKILL.md` e das referências não está especificada. Só o `skill.json` tem "UTF-8 estrito; BOM ... `ENCODING_INVALID`" (SPEC:237). O SK03 pede "o código de §8" para BOM no frontmatter, sem dizer qual. Sonda: o `TextDecoder` padrão remove o BOM e entrega `---\n`, e o arquivo passaria. `Buffer.toString` troca byte inválido por U+FFFD. Os dois reinterpretam.
- (b) "Controle" (SPEC:250) não está definido. Não diz se entram Cf (bidi U+202A–U+202E e U+2066–U+2069, zero-width, U+FEFF no meio do texto), U+0085, U+2028 e U+2029. O YAML 1.1 trata NEL, LS e PS como quebra de linha. A descrição do `skill.json` não tem restrição nenhuma. A projeção da P14 (SPEC:406) é texto de contexto permanente. Uma quebra de linha na descrição forja outra linha `<id>@<version>: …` quando a 0255-C ligar a projeção.
- (c) Delimitador: não diz o que fazer com `---` no fim do arquivo sem `\n`, `--- ` com espaço, `...`, cabeçalho vazio (`---\n---\n`) ou mais de 32 linhas. Também não diz o que fazer com valor terminado em `:`, que o YAML recusa e a gramática aceita.
- (d) P15 (SPEC:241, 792): a varredura de chave duplicada não diz que compara a chave já decodificada. Sonda: em `{"id":"a","id":"b"}`, o `JSON.parse` fica com `"b"`. Uma varredura do texto cru não vê a duplicata.

**Correção mínima.**

- Decodificador UTF-8 fatal, com BOM proibido, para `SKILL.md` e referências (`ENCODING_INVALID`).
- Lista fechada de code points proibidos, por categoria: Cc, Cf, Zl, Zp, U+0085 e não-caracteres. Cada caso com código definido.
- Regra exata de abertura e fechamento do frontmatter. Valor não termina em `:`.
- Comparar chaves JSON depois de decodificar os escapes.
- Aplicar o mesmo conjunto proibido à descrição do `skill.json` na inspeção (I5 permite ser mais estrito). A projeção recusa ou escapa quebra de linha.
- Casos no SK03.

### M5 — Provas e mutantes que não fecham

**Defeito.**

- (a) O mutante M01 (SPEC:675) não morre pelo SK05. Na sonda B, com os casos estáticos do SK05, o correto, o `stat` no lugar de `lstat` e o "sem `O_NOFOLLOW`" dão todos `SYMLINK_REFUSED`. Uma camada mascara a outra. Só a troca entre `lstat` e `open` separa os códigos: o correto dá `SYMLINK_REFUSED`, e o sem `O_NOFOLLOW` dá `FILE_CHANGED_DURING_READ`. O mesmo vale para os mutantes M02 e M03 se só uma das duas checagens sair (no M02, `nlink` no `lstat` e no `fstat`; no M03, tamanho no `lstat` e na leitura).
- (b) O mutante M11 (SPEC:685) sobrevive ao SK08b (SPEC:661). O `SKILL.md` de 5 MiB passa do teto rígido de 1 MiB e não é lido. O FIFO não é aberto. Na sonda C, a seleção só da escolhida e o mutante "adquire todas" dão o mesmo `bytesRead` (47) e o mesmo `filesOpened` (1).
- (c) O SK10c (SPEC:664) se diz "verde na base", mas inclui "depois de selecionar a skill". `selectSkillBody` não existe na base. Além disso, nenhum mutante do código novo derruba esse teste.
- (d) Há comportamentos de segurança sem prova. Nenhum SK cita `REDACTION_FAILED` nem `REDACTOR_MISSING`, que são o fail-closed da redação (§6.10). O mesmo vale para `KNOWLEDGE_NOT_AVAILABLE`/`KNOWLEDGE_NOT_EVALUATED` (condição 6), `MANIFEST_FRONTMATTER_CONFLICT` e `FORMAT_NOT_ENABLED`. O mutante M19 só morre se algum teste provocar erro de FS (por exemplo `EACCES`, ou `ENOENT` no root), e o SK11 não diz que provoca.
- (e) A regra comum 4 e a "Prova" do cartão (`0383:315`) pedem negativos no boundary público. Só o SK11 e o SK13 usam o `dist`.

**Correção mínima.**

- Dividir o mutante M01 em dois, cada um com o teste que o mata. Um é o gancho de troca entre `lstat` e `open`, esperando `ELOOP` → `SYMLINK_REFUSED`. O outro é o diretório-symlink, esperando marcador ausente.
- No SK08b, pôr um `skill.json` pequeno e válido na outra skill, ou usar espião de `lstat`/`open`.
- Separar o SK10c em controle de base e parte nova.
- Acrescentar casos e mutantes para: redator que lança, redator que devolve não-string, redator ausente, conhecimento, conflito entre manifesto e frontmatter, formato não habilitado e erro de FS.
- Levar ao teste de consumidor do `dist` um negativo por aceite de segurança (A05, A07, A10 e A11).

### M6 — P1 e P2 se contradizem e pressupõem uma SPEC do dono que não existe

**Defeito.** P1 (SPEC:778) mantém o gate canônico: PAR-T07 integrada e qualificada antes do BUILD. P2 (SPEC:779) põe a 0255-A como fatia da PAR-T07, "sem fechar a T07", com aceites "acrescentados à SPEC do dono". As duas juntas levam a um de dois casos.

- No primeiro, a T07 fecha antes, sem a 0255-A. Então a admissão própria da 0255-A, com digest do chamador (P11), vira avaliador paralelo ao "hash aprovado" e ao "falha ao carregar fora do grant" da T07 (`0380:537`). Isso vai contra o `0383:13` ("não reconstruir seu executor") e o `0394:7` ("nenhum ... sistema de policy ou avaliador paralelo").
- No segundo, a T07 depende da 0255-A. Então o gate fica circular.

Não há SPEC da PAR-T07: `grep -rln PAR-T07 docs/02_spec/` só acha a própria 0255. O `0383:13` diz "quando compatível; ampliação exige novo gate". A01, A05, A07 e A10 ampliam o aceite da T07, então exigem um gate da T07, e esta SPEC não pode abri-lo. A PAR-T07 ainda depende da PAR-K05 (`0380:536`).

**Evidência.** SPEC:742, 778-779, 788 e 800; `0383:13` e `0383:311`; `0380:530-537`; `0394:7` e `0394:69`.

**Correção mínima.** Tirar o default combinado. Apresentar ao usuário e ao dono do programa duas opções coerentes:

- **(A)** A 0255-A é a primeira SPEC da PAR-T07. Ela precisa do aceite do dono e do gate da K05, que é dependência da T07. O `itemDigest` vira o hash canônico da T07.
- **(B)** Esperar a T07 e reescrever a admissão para consumir o hash e o catálogo aprovados dela. A P11 muda.

Pôr no §13 o aceite do dono da PAR-T07 e do integrador Claude100 (`0394:69`).

### M7 — P8 (endurecer o loader) é contraditório e subespecificado

**Defeito.**

- (a) O SK14 (SPEC:669) exige "sem caminho absoluto" nos casos A a E. Mas `SkillManifestLoadError.skillPath` é o caminho absoluto (`loader.ts:6, 107, 114, 120, 137`; caso E da sonda do executor). O §6.11 (SPEC:487) só fala em tirar o caminho das mensagens. Cumprir o SK14 muda um campo público (`PUBLIC_API.md:99`) sem dizer.
- (b) "Trata cap como erro" e "o resultado para JSON válido não muda" (SPEC:486-489) colidem. Um `skill.json` válido acima de 16 KiB, ou com descrição acima de 1024 caracteres, passa hoje e falharia depois. O loader não tem parâmetro de limites, e a SPEC não diz quais valem.
- (c) Não está dito se o loader passa a exigir root absoluto e canônico (§7.2). Hoje ele aceita caminho relativo e root que passa por symlink (por exemplo, `tmpdir()` no macOS, em `/var`).
- (d) O pdsh-031 (`pdsh-031-core-coverage.test.ts:398-403`) exige `entrada inacessível` para symlink quebrado. O loader endurecido trata symlink como erro, e a mensagem precisa continuar sendo essa.
- (e) O texto do V8 em `skill.json ilegível: …` vaza trecho do JSON (sonda D). O endurecimento deve cortá-lo.

**Correção mínima.** Escrever a tabela de comportamento do loader endurecido:

- `skillPath`: passa a relativo ou continua absoluto, com nota no `PUBLIC_API`;
- quais caps valem e com que valores;
- a regra de root;
- symlink mapeado para `entrada inacessível`;
- mensagem de JSON sem `error.message`.

Ou adotar a alternativa da própria P8: manter o loader e marcá-lo no `PUBLIC_API` como fora da fronteira de segurança.

## Opcionais

- **O1 — `bytes` do `lstat` em entradas não regulares depende do local e do FS.** Na sonda E, o mesmo symlink em dois lugares deu 181 e 197 bytes, que é o comprimento do alvo absoluto. O tamanho de diretório varia por FS (ext4 dá 4096; tmpfs e btrfs variam). I6 (SPEC:78) e "a mesma árvore em outro lugar dá o mesmo digest" (SPEC:551) falham para itens com recusa. O impacto é baixo, porque esses itens não são admissíveis. Correção: `bytes` só para arquivo regular, e `null` nos demais.
- **O2 — O redator real cobre pouco, e os identificadores não passam por ele.** Na sonda F, `redactSensitiveText` deixou passar `ghp_…`, `sk-ant-…`, `AKIA…`, JWT e PEM. O SK11 só usa formatos cobertos (`api_key=`, `Bearer` e e-mail). Charset fechado não é redação: `version`, `requiredTools`, nomes de arquivo e o `field` de `MANIFEST_INVALID` podem carregar um token. O `field` é a chave desconhecida, texto do autor, e o charset "seguro" dele não está definido (SPEC:395). Correção:
  - reescrever A11 e I9 como "segredos nos padrões do redator do host";
  - definir o charset do `field`;
  - pôr no SK11 um token sem prefixo como limitação conhecida;
  - mensagem de `SkillInspectionInputError` só com código e campo.
- **O3 — Teto de nós do `canonicalizeJson`.** `CANONICAL_JSON_MAX_NODES` é 20.000 (`canonical-json.ts:14`). Um item mínimo tem 53 nós, então cabem cerca de 376 itens. Os defaults permitem 8 × 64 = 512 itens. "O relatório é serializável por `canonicalizeJson`" (SPEC:401) falha dentro dos defaults. Correção: teto total de itens (por exemplo, 256) ou retirar a afirmação.
- **O4 — A 0255-B se sobrepõe à PAR-H04.** O `0380:818` dá à H04 o "inventário somente leitura do que está carregado". A H04 precisa estar integrada antes do BUILD da 0255-B (SPEC:746). Então a r2 deve projetar sobre o inventário da H04, sem construir outro. Pôr isso nas pendências do §9 (SPEC:615-620).
- **O5 — A "seleção autorizada" é autorizada pelo chamador.** O mapa de digests e o grant vêm do chamador (P11). Dizer isso no texto e exigir que a 0255-C só use a seleção com autoridade da T07 ou da H04. Escrever também que o corpo devolvido sai do mesmo buffer cujo sha256 entrou no `itemDigest`, sem releitura, e acrescentar um mutante para isso.
- **O6 — Segundo avaliador de grant.** A condição 5 (SPEC:425) reimplementa a regra do kernel com outra semântica para `*`. Implementar como `agentExposesTool` (`kernel-runtime.ts:84-96`) mais a exclusão explícita do curinga, para as duas regras não divergirem. Consultar `approvedItemDigests` só por propriedade própria, porque o id `constructor` casa o `ID_PATTERN`.
- **O7 — O precedente citado é o mais fraco.** `exam-egress.ts:127-149` não faz `lstat`, não confere `nlink` e não compara inode. O padrão mais forte do repositório é `boundary-installed-identity.mjs:227-276`. A cópia no harness não é "executor, policy ou avaliador paralelo" (`0394:7`). Ela é mais uma cópia de uma primitiva de leitura; já existem outras em `scripts/build-installed-reference.mjs` e `scripts/release-image-record.mjs`. Saída mínima: manter a cópia privada em `acquisition.ts`, reusar os vetores de teste e registrar a consolidação como achado, sem bloquear.
- **O8 — Plataforma.** Se `fs.constants.O_NOFOLLOW`, `O_NONBLOCK` ou `O_DIRECTORY` não forem números (Windows), recusar com código próprio. Hoje `0 | undefined` vira 0, e o `open` segue symlink sem avisar.
- **O9 — Precedência da classificação.** Dizer o que vale quando um arquivo cai em duas linhas do §6.4: `SKILL.md` com bit de execução, `.run.sh`, ou diretório oculto (se é percorrido ou não). Dizer também qual `refusal` vai para o `fileEntry`.
- **O10 — Corpo vazio.** `estimateTokens('')` dá 1 (`context-engine.ts:39-41`), e a SPEC diz que "texto ausente vale 0" (SPEC:405). Dizer se corpo presente e vazio é `BODY` com 1 token.
- **O11 — Escalares que o YAML leria como outro tipo.** Em `name` e `description`, `true`, `null`, `~`, `1.0` e `yes` viram texto. Para "recusa sem reinterpretar" entre ferramentas, considerar recusar.
- **O12 — Gate, item 3 (SPEC:741).** A colisão da 0029 não faz parte do aceite da C100-Q01 (`0383:194`). Deixar como risco e observação ao integrador. Listar os nove reusos da Q01 (Q03 e Q04 já estão `DONE`).
- **O13 — Função síncrona com prazo de até 60 s.** Ela bloqueia o event loop. Dizer que não roda no caminho de requisição da API.
- **O14 — Contagem do recon.** Há 2.147 linhas em 1.367 arquivos de `docs/` que citam `0029_controlled_published_kernel`, e não 1.635 menções (recon §1.3). O achado em si se confirma (ver abaixo).

## Respostas às perguntas do executor

1. **§7.4–7.5.**
   - Não é suficiente (M1).
   - Há forma mais forte e portátil no próprio repositório: a assinatura completa com `ctimeNs`. No Linux há forma ainda mais forte: fd do diretório com `O_DIRECTORY|O_NOFOLLOW` e `/proc/self/fd/<dfd>/<nome>`, que emula `openat`, ou a verificação por `/proc/self/fd/<fd>`.
   - Não é "sistema paralelo" nos termos do `0394:7`, que proíbe executor, policy e avaliador. A saída mínima está no O7. O risco real de paralelismo está na admissão contra a T07 (M6).
2. **§6.5.** Ver M4. Anchors, aliases, tags, blocos, fluxo e comentário estão bem cobertos pelos caracteres iniciais proibidos e pela recusa de recuo. Faltam: decodificação, conjunto de controle, delimitadores, chave duplicada com escape e a descrição do `skill.json`.
3. **§7.6.**
   - Ficar de fora caminho absoluto, limites e perfil está certo, e as recusas entram.
   - Há dois defeitos: os `bytes` do `lstat` em não regulares (O1) e o drift ABA (M1).
   - Versão alterada muda os bytes, portanto muda o digest, e o aceite não é reaproveitado (SK07). Upgrade concorrente só não reaproveita aceite depois do M1. Arquivo truncado por cap não entra no digest, mas o item fica `INCOMPLETE` e não é admissível.
4. **§6.9.**
   - A seleção lê conteúdo só da skill escolhida, incluindo as referências dela, por causa do digest. Mas lista os nomes de todos os roots sem teto (M2).
   - A detecção de duplicado só pelo nome do diretório basta: para todo item `VALID`, o id é igual ao nome do diretório (`loader.ts:68-70`; `name` do frontmatter igual ao diretório), e o `ID_PATTERN` é minúsculo e ASCII. Vale escrever esse invariante e um mutante "frontmatter `name` ≠ diretório aceito".
5. **Premissas e gate.**
   - P1 e P2: M6.
   - Falta no gate o aceite do dono da T07 e do integrador. O item 3 inclui a 0029, que não é aceite da Q01 (O12).
   - Premissas escondidas: modelo de ameaça, plataforma Linux, existência da SPEC da T07 e suficiência do redator (abaixo).
   - Os defaults de P3 a P16 falham fechado, salvo P8 (M7) e P15 sem a regra de escape (M4).
6. **Prova.**
   - O SK10c como controle de regressão é honesto só se for separado da parte "depois de selecionar".
   - Os mutantes M01 e M11 não morrem pelos testes citados (M5).
   - Os demais conferem: M04–M10 e M12–M23 morrem pelos testes indicados. M19 também, mas só com um caso de erro de FS explícito. M02 e M03 morrem se o mutante tirar as duas checagens.
7. **Escopo.**
   - A P8 cabe sem quebrar consumidores de runtime, porque só os testes consomem o loader e as composições usam `skills: []` (`sdk/src/server.ts:126`; `controlled-kernel-execution.ts:441`). Mas o texto precisa do M7.
   - O §9 está só em nível de contrato: o BUILD exige r2 (SPEC:582, 746), e o §18 pede aprovação só da 0255-A. Ver O4.
8. **Migration 0029.** Confirmado. Detalhes abaixo. Não afeta a 0255-A diretamente.
9. **Redação.**
   - Como escrita, falha fechada: redator ausente dá erro antes do disco; redator que lança ou devolve não-string dá `[redaction-failed]` e o item não é admitido. Mas não há prova (M5d).
   - O relatório usa label e caminho relativo, e só `errno`. Restam três brechas: o `field` sem charset definido (O2), a mensagem de JSON inválido (M3b) e o loader com `skillPath` absoluto (M7).
   - O corpo nunca aparece. A cobertura do redator é limitada (O2).

## Premissas

Para decisão do usuário, ou do usuário com o dono do programa:

- **P1 e P2 (M6):** escolher a opção A (0255-A como primeira SPEC da PAR-T07, com aceite do dono e gate da K05) ou a opção B (esperar a T07 e consumir o hash e o catálogo dela). Os dois defaults atuais não convivem.
- **P8 (M7):** endurecer com a tabela de comportamento escrita, ou manter o loader e marcá-lo como fora da fronteira de segurança.
- **Escondida — modelo de ameaça (M1):** o root pode ter escritor concorrente não confiável? Se não puder, I3, A05 e A15 devem dizer "árvore estática garantida pelo host". Se puder, é preciso a assinatura completa ou o fd via `/proc`.
- **Escondida — plataforma (M1, O8):** a fronteira vale só para Linux? A resposta decide o uso de `/proc` e a recusa quando faltar constante.
- **Escondida — dono da PAR-T07:** não há SPEC nem claim da T07. Quem aceita os aceites A01, A05, A07 e A10?
- **P4:** com o default, uma `SKILL.md` com `license` ou `metadata` fica `INVALID`, e a compatibilidade com skills reais fica quase nula. A escolha é entre aceitar esse custo ou registrar chaves inertes como achado, sem conceder nada.
- **P11 (O5):** digests vindos do chamador até a T07. Aceitável, desde que a 0255-C não use a seleção sem a autoridade da T07 ou da H04.
- **P12 (M2):** com o M2, o estouro de listagem passa a não processar nenhum item daquele diretório.
- **P15 (M4d):** recusar a chave duplicada, comparando a chave já decodificada.
- **Seguros como estão:** P3, P5, P6, P7, P9, P10, P13, P14 (com o M4b) e P16.

## Achado da migration 0029 (confirmado)

- `0380:59` reserva a 0029 para a composição 0217: "0029 (composição 0217) primeiro, no PAR-G01; depois 0030 (SPEC0225) e 0031 (SPEC0221)". O `0380:101` repete: "A migration 0029 ainda não está no checkout principal ... na ordem 0029 → 0030 → 0031".
- O arquivo `packages/persistence/migrations/0029_controlled_published_kernel.sql` existe no snapshot `a72422bee` (e em `refs/backup/pare100-spec0217-r5-snapshot`) e nas cópias de evidência em `docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build/*-sources/`.
- A `main` `420b97b3` tem `packages/persistence/migrations/0029_case_assignment_authorization.sql`, adicionado em `48c8607c9` e levado à `main` por `24cdb463f` (PR #13, 21/10). Ele está na lista ordenada `defaultPostgresMigrations` (`packages/persistence/src/postgres-migrations.ts:50`).
- O runner grava a versão pelo nome completo (`schema_migrations.version text PRIMARY KEY`). Então não há choque de chave primária. Há choque de número e de ordem: a ordem reservada "0029 → 0030 → 0031" e a SPEC0239 (que vem "depois de 0029 → 0030 → 0031") supõem um 0029 que não é o da `main`. Bancos já migrados com o 0029 da SPEC0176 exigem renumerar a composição.
- Não achei registro dessa colisão nos ledgers nem nas SPECs.
- **Efeito na SPEC0255:** nenhum direto. A 0255-A não tem migration, e o §13.6 proíbe migration. O efeito é indireto: atrasa a Q01 e a M1, que são gate do BUILD. Não cabe a esta SPEC resolvê-lo (O12).

## O que conferi

Comandos de leitura na worktree da SPEC (`/mnt/dados/cvg-work/cvg-d9ef-c100-t01-spec-20261022`) e na worktree do Codex (`/mnt/dados/cvg-work/cvg-d9ef-rea-plan-20261022`, `ba0794421`):

- `sha256sum docs/02_spec/0255_c100_skill_plugin_offline_inspection.md` (antes e depois) e `git log`/`git status` da worktree.
- `sha256sum` dos quatro arquivos do Codex: conferem com o `spec-r1.json` (`db8b5277…`, `f1348d78…`, `b16d3867…`, `7c9c8ecd…`).
- Leitura integral da SPEC, do `recon.md`, do `spec-r1.json`, da sonda do executor e da saída dela; do 0394; das fichas Q01, T01 e T02 e das regras do 0395; da proposta SI01–SI12; e das linhas 51-52 do 0623.
- `sed -n` nas âncoras: `0383:13,184-200,304-330,725-737,883`; `0380:50-59,101,200-219,528-537,793-820,1190-1197`; `0381:15,38,68`; `AGENTS.md:103`; ADR-003.
- Código:
  - `cat -n packages/harness/src/skills/{loader,registry,assert,index}.ts`;
  - `packages/contracts/src/contracts.ts:80-96` e `canonical-json.ts:1-125`;
  - `context-engine.ts:35-45` e `kernel-runtime.ts:80-100,480-505`;
  - `packages/platform/src/contracts.ts:388-510` e `plugin-gateway.ts:118-137,494-540,799-812`;
  - `plugin-execution-core.ts:35-40,118-128` e `control-plane-store.ts:812-838`;
  - `confine.ts`, `audit-governance.ts:230-275`, `release-image-contract.mjs:195-250`, `exam-egress.ts:120-155` e `boundary-installed-identity.mjs:225-276`;
  - `workspace-dependency-policy.json:120-145`, `packages/{harness,platform}/package.json`, `sdk/src/server.ts:122-128` e `controlled-kernel-execution.ts:436-444`.
- Consumidores e testes:
  - `grep -rn loadSkillsFromDirectory|createSkillRegistry|assertSkillsAvailable` (só testes e superfície pública);
  - `pdsh-015-skills.test.ts` e `pdsh-031-core-coverage.test.ts:360-420`;
  - `grep -rn skillPath`.
- `grep -rln PAR-T07 docs/02_spec/`: só a 0255.
- Migration:
  - `ls packages/persistence/migrations`;
  - `git log --all --diff-filter=A -- 'packages/persistence/migrations/0029*'`;
  - `git ls-tree -r a72422bee -- packages/persistence/migrations/`;
  - `postgres-migrations.ts:20-135`;
  - `grep -r 0029_controlled_published_kernel docs | wc -l`;
  - busca por registro da colisão.
- Sondas em Node v22.23.2 (`env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin`), só com dados sintéticos e temporários no scratchpad:
  - `critic-probe.mjs`, seções A a G: corrida ABA e alternativas por `/proc`, mutante M01, mutante M11, mensagem do `JSON.parse`, tamanho do `lstat` de symlink, cobertura do redator real e listagem limitada. Saída em `critic-probe-output.json`.
  - Teste de `ctimeNs` depois de rename ABA.
  - Mensagens do `JSON.parse`, BOM no `TextDecoder`/`Buffer` e chave duplicada com escape.
  - Contagem de nós do relatório para o `canonicalizeJson`.
- Caminho das sondas: `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/c100-critic/critic-probe.mjs` e `.../c100-critic/critic-probe-output.json`. Os diretórios temporários foram removidos.
