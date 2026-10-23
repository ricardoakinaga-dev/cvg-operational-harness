# Revisão crítica independente — SPEC0255 r2

- SPEC: `docs/02_spec/0255_c100_skill_plugin_offline_inspection.md`, revisão r2.
- sha256 conferido antes e depois da revisão: `e03a1553742f9abea59f1f6d712693728ec76965a37ee328bcd7c1c43f64dc03`.
- Base: `main` `420b97b3`. Worktree `cvg-d9ef-c100-t01-spec-20261022`, só leitura.
- Mesmo crítico da r1, que não escreveu a SPEC. Data: 22/10/2026.
- Escrita só nesta pasta. Sem commit, push, PG, install, lockfile ou mudança de cartão.
- Numeração: `R2-M…` e `R2-O…` são os itens desta rodada. `r1-M1..M7` são os obrigatórios da revisão anterior. `MU…` são os mutantes da SPEC.

## Veredito: REVISE

A r2 é um avanço grande. Os sete obrigatórios da r1 estão fechados no mérito.

Rodei de novo a minha sonda ABA, agora contra uma implementação literal do §8.2–8.7: diretório fixado por fd e leitura por `/proc/self/fd`. **Nada de fora do root foi lido em nenhum dos oito ataques.** As trocas foram detectadas. A garantia G1 vale.

Restam quatro obrigatórios, todos pequenos:

- **R2-M1:** a busca de nome da seleção e a da admissão usam regras diferentes, o que quebra o I13, a base da P20.
- **R2-M2:** o marcador `<redacted:12hex>` deixa recuperar por força bruta o CPF ou telefone que o redator tirou.
- **R2-M3:** o exemplo de chave duplicada com escape sumiu do texto, e a prova do MU04 não diz onde fica o marcador.
- **R2-M4:** as provas de troca de diretório dependem só de timestamp e ficam instáveis em kernel sem timestamp multigrain, como o do CI e o do servidor Ubuntu.

## Estado dos obrigatórios da r1

| r1 | Estado | Observação |
| --- | --- | --- |
| r1-M1 (ABA) | **Fechado no mecanismo** | Sonda r2: 8 de 8 ataques sem leitura de fora (detalhes abaixo). Resta a instabilidade das provas (R2-M4). |
| r1-M2 (listagem) | Fechado | `opendirSync` até cap+1; estouro não processa nada; a seleção não lista. |
| r1-M3 (caps, JSON, agregação) | Fechado | Códigos alinhados; `MANIFEST_SYNTAX_INVALID`; §7.8. |
| r1-M4 (gramática) | Fechado, salvo um ponto | Decodificador fatal com BOM recusado; `FORBIDDEN` por categoria; delimitadores. O exemplo com escape sumiu (R2-M3). |
| r1-M5 (provas) | Fechado, salvo dois pontos | MU01a/b/c, SK08b, SK10c, SK13 e SK15–SK19 estão certos. Faltam o MU04 (R2-M3) e o tempo (R2-M4). |
| r1-M6 (T07) | Fechado | Mapa T07 → 0255-A coerente. Gate com Codex e K05. Sem ciclo, porque a T07 só depende da K05 (`0380:536`). Sem avaliador paralelo, porque a admissão passa a ser a da T07. |
| r1-M7 (loader) | Fechado | Tabela do §7.12 confere com `pdsh-015` e `pdsh-031` (linhas 398-403 e 410). |

## Obrigatórios da r2

### R2-M1 — A busca de nome da seleção difere da busca da admissão; o I13 é falso e a P20 depende dele

**Defeito.**

- A condição 7 da admissão (SPEC:579) diz: "qualquer resultado diferente de `ENOENT` dá `DUPLICATE_ID`".
- A seleção (SPEC:592-595) diz outra coisa: "nenhum diretório: `NOT_FOUND`; mais de um: `DUPLICATE_ID`; symlink, especial ou montagem: `BLOCKING_RISK_FINDING`". Ela não trata arquivo regular com o mesmo nome em outro root, nem erro diferente de `ENOENT` (por exemplo `EACCES`, num root com leitura mas sem busca).
- Resultado: com o diretório `foo` em A e o arquivo `foo` em B, a admissão dá `DUPLICATE_ID` e a seleção segue para `SELECTED`.
- Com `EACCES` em B, a seleção não sabe se há duplicata e pode seguir. Isso é falha aberta justamente na unicidade, que é o que torna a P20 segura.
- O I13 (SPEC:627) afirma consistência, e o SK08c não tem esse caso.
- Há também uma questão de ordem. A condição 1 pede root "que não mudou durante a leitura", mas a conferência da assinatura do root é feita "no fim da chamada" (SPEC:680). O texto não diz que ela vem depois da última busca de nome, nem que a decisão de admissão vem depois dela.
- O I13 também não lista outras exceções que tiram itens do inventário sem impedir a seleção: prazo, `maxFilesTotal`, `maxTotalBytes` e a condição 9 (`expected.inputDigest`), que a seleção não avalia.

**Evidência.**

- Sonda r2, caso t10: `kinds: [DIR, FILE]`, `admission: DUPLICATE_ID`, `selection: PROCEEDS_TO_SELECTED`.
- Caso t9: a remoção temporária da duplicata em B dá `ENOENT` na busca. Ela só é pega porque a assinatura de B muda em relação ao `sig0` tirado na abertura.

**Correção mínima.**

- Uma única função de busca, usada pela admissão e pela seleção. `ENOENT` → ausente. Diretório real → candidato. Qualquer outro tipo ou errno → recusa, com o mesmo código nos dois caminhos.
- Escrever a ordem: abrir os roots e tirar o `sig0` → buscas → conferência final das assinaturas → decisão.
- Completar as exceções do I13.
- Acrescentar ao SK08c os casos "arquivo regular com o mesmo nome em outro root" e "`EACCES` na busca".

Com isso, a P20 é segura (ver resposta 2b).

### R2-M2 — `<redacted:12hex>` deixa recuperar o valor redigido

**Defeito.**

- O §7.11 (SPEC:633) troca o identificador redigido por `<redacted:` + 12 hex + `>`. O texto não diz de que são os 12 hex; pela analogia com `<unsafe:…>` (SPEC:285), são do sha256 do valor.
- O redator do host tira exatamente valores de baixa entropia: CPF, CNPJ, telefone e data de nascimento (`audit-governance.ts:235-271`). Um prefixo de 48 bits sem chave, de um CPF (cerca de 10^9 valores válidos), se inverte por força bruta.
- Isso contradiz o I9 e o A11 ("sem segredo nos padrões do redator do host").
- O mesmo vale, com mais esforço, para o `itemDigest` e o `inputDigest` quando eles incluem o nome bruto e todos os outros componentes aparecem no relatório.

**Evidência.** Sonda r2, caso t11. O CPF sintético `123.456.789-09` é redigido como identificador (P18). A busca de 10^6 candidatos levou 357 ms e recuperou o valor, o que dá cerca de 6 min num núcleo para 10^9.

**Correção mínima.**

- O marcador não leva hash do valor. Usar um ordinal no item (`<redacted:1>`); vale também para `<unsafe:…>` no relatório.
- Item com `SECRET_PATTERN_IN_IDENTIFIER` já é `INVALID` e nunca admitido. Para ele, o relatório não publica nada calculado sobre o valor bruto: `itemDigest` e entrada no `inputDigest` sobre a forma exibida, e `sha256` nulo no arquivo que contém o valor.
- Declarar no I9 a limitação que resta: o `sha256` publicado de um arquivo pequeno é um oráculo para valor enumerável na descrição.

### R2-M3 — O exemplo com escape sumiu e a prova do MU04 não diz onde fica o marcador

**Defeito.**

- (a) A correção do r1-M4(d) depende de uma chave escrita com escape. No texto da r2, o exemplo virou `{"id":"a","id":"b"}` (SPEC:341), e o SK03 diz "duplicata simples e com `id`" (SPEC:839). Isso é duplicata simples: uma varredura do texto cru também a pega, e o mutante MU29 sobrevive. `grep -c 'u0069\|u0064'` na SPEC dá 0, e o `corrections.md` tem a mesma perda.
- (b) SK05b(iii) (SPEC:842) diz "leitura de dentro (marcador ausente)" para matar o MU04, mas não diz onde o marcador é procurado. Pelo I8, o corpo nunca entra no relatório. Se o marcador estiver só no corpo do `SKILL.md` de fora, a asserção passa mesmo com o MU04 lendo o arquivo de fora.

**Correção mínima.**

- Restaurar o escape: `{"id":"a","id":"b"}` no §7.5 e no SK03.
- No SK05b(iii), conferir que o `sha256` do `BODY` é o dos bytes de dentro, e pôr o marcador também na `description` do frontmatter de fora.

### R2-M4 — As provas de troca de diretório dependem só de timestamp e ficam instáveis no kernel do CI e do servidor

**Defeito.**

- Na troca ABA, a assinatura só muda por timestamp. Sonda r2: no diretório da skill muda só `ctimeNs`; no root mudam só `mtimeNs` e `ctimeNs`. `dev`, `ino`, `mode`, `nlink` e `size` ficam iguais.
- Em kernel sem timestamp multigrain (o suporte entrou no 6.13), o tempo do inode vem do relógio grosso, de um tique (1 a 4 ms). A sonda da r2 e a minha rodaram no kernel 7.0, que tem multigrain. O CI roda em `ubuntu-latest`/`ubuntu-24.04` (`.github/workflows/verify.yml:20`; `release-image.yml:33`), e o servidor é Ubuntu de versão não fixada.
- Num teste rápido, a última escrita da fixture e a troca feita pelo gancho podem cair no mesmo tique. Aí a troca não é detectada, e SK05b(iii) e SK05b(vi) (entrada de arquivo criada no root) falham de forma intermitente. O MU05 deixa de ser morto de forma confiável.
- A G2 e o risco residual do §3 (SPEC:102-105) só falam de escrita de conteúdo no mesmo tique. Não dizem que a troca ABA de diretório no mesmo tique também passa sem detecção. Ela é inofensiva graças à G1 (a leitura continua presa ao diretório original).
- O gancho `afterItem` (SPEC:828) não deixa claro se roda antes ou depois da conferência do §8.7. O ABA exige um gancho antes.

**Evidência.** Saída de `critic-probe-r2-aba-fields-output.json`: `skillDirChangedFields: ["ctimeNs"]` e `rootChangedFields: ["mtimeNs","ctimeNs"]`, com espera de 30 ms antes da troca.

**Correção mínima.**

- Nas provas SK05b(iii) e (vi), garantir que o relógio avança pelo menos alguns tiques (por exemplo, 50 ms) entre a última escrita da fixture e a troca. Ou usar subdiretório no caso (vi), que muda `nlink`.
- Definir um gancho `beforeItemCheck`.
- Reescrever a G2 e o risco residual: a detecção de troca no mesmo tique depende do kernel; a G1 continua valendo sem depender de tempo.

## Opcionais da r2

- **R2-O1 — Falsos positivos da P18 com o redator real.** Sonda t11: versão CalVer `2024.10.22`, arquivo `2024.10.22.md` e ids de ferramenta `token:refresh`, `secret:read` e `credential:lookup` viram `SECRET_PATTERN_IN_IDENTIFIER` e deixam o item `INVALID`. Isso falha fechado. Mas uma ferramenta de credencial (PAR-H03) com esse nome nunca seria admitida. Sugestão: não redigir requisito que seja igual a um id concedido pelo host, e registrar os falsos positivos na P18.
- **R2-O2 — Regex da P19.** O falso positivo aceito (`1b`, `1-0-0`, `2024-10`) é ok. Faltam formas do YAML 1.1: `0x1f` e `.5`/`+.5` passam como texto (sonda t12). Acrescentar `^[-+]?0x[0-9a-fA-F_]+$` e `^[-+]?\.[0-9]+([eE][-+]?[0-9]+)?$`.
- **R2-O3 — Ganchos.** O mapa `exports` de `@cvg/harness` só tem `"."` (`packages/harness/package.json`), então o pacote não expõe `dist/skills/acquisition.js`. Faltam três coisas:
  - deixar os ganchos só capazes de endurecer (`mapStat` só muda `dev`; `platform` só força "não suportada");
  - não ativar por variável de ambiente nem `globalThis`;
  - um teste estático de que nenhum módulo fora de teste importa o setter. Testes de `tests/` já importam `packages/harness/src` por caminho relativo, e nada barra isso em produção.
- **R2-O4 — CR.** A r1 recusava CR em qualquer ponto. A r2 recusa só no frontmatter (`FORBIDDEN` ou `---\r\n` → `FRONTMATTER_MISSING`) e aceita CR no corpo. O SK03 lista "CR" em "Decodificação" sem dizer o código. Escrever o código por posição e se o corpo aceita CR.
- **R2-O5 — Curinga.** A condição 5 recusa qualquer grant com `*`, mesmo com `requiredTools: []`. Isso é mais estrito que o texto da P5 ("`*` não satisfaz requisito"). Alinhar o texto.
- **R2-O6 — Ordem do gate.** Se o Codex ajustar ou cortar aceites (§14.2), o sha muda depois do `APPROVE` do crítico (§14.1). Dizer que qualquer mudança gera nova rodada do crítico sobre o novo sha, ou pôr a revisão do Codex antes da rodada final.
- **R2-O7 — Montagem (P21).** Montagem bind do mesmo FS mantém `st_dev`. O texto "mesmo assim ... é recusado" (SPEC:105) promete mais do que entrega. Subvolume btrfs e overlayfs sem "samefs" podem dar recusa falsa (falha fechado). Ajustar o texto.
- **R2-O8 — Corpo com code point proibido.** Bidi e zero-width no corpo e nas referências não geram achado. Quem aprova pelo digest revê o corpo noutro editor. Um achado não bloqueante (contagem) ajudaria a T07 e a 0255-C.
- **R2-O9 — Id e redator.** Não está dito se o `id` e o nome do diretório passam pelo redator. Um id só de dígitos (`5551234567`) casa o `ID_PATTERN` e o padrão de telefone.

## Respostas aos pontos do coordenador

1. **r1-M1 a r1-M7.** Todos fechados no mérito; ver a tabela.
   - A sonda ABA contra o §8.2–8.7 (oito ataques) não leu nada de fora em nenhum caso:
     - t1: ABA depois de fixar o diretório;
     - t2: diretório vira symlink entre o `lstat` e o `open` → `SYMLINK_REFUSED`;
     - t3: trocado por outro diretório real → `TREE_CHANGED`;
     - t4 e t5: o mesmo em `references/`;
     - t6: arquivo vira symlink → `SYMLINK_REFUSED`;
     - t7: arquivo trocado, mesmo tamanho → `FILE_CHANGED`;
     - t8: escrita no mesmo inode → `FILE_CHANGED` no kernel 7.0.
   - Lacunas: só R2-M4 (detecção por tempo) e R2-M1 (ordem da conferência). Nenhuma permite ler de fora sob o modelo do §3.
2. **Escolhas diferentes do executor.**
   - (a) Matar o MU01b pelo `trace` é correto e mais forte que o "marcador ausente". Com `stat`, o symlink passa no tipo e chega a um `open`, que o `trace` mostra. Condição: o `trace` deve ser emitido pelo mesmo invólucro que faz a chamada ao sistema.
   - (b) A P20 é **segura**, com o R2-M1 corrigido. O conteúdo do item admitido é lido por inteiro, preso ao digest aprovado e ao grant dele. A unicidade é exata por nome, porque id = diretório (I11) e o `ID_PATTERN` é ASCII minúsculo; em diretório casefold do ext4, a busca acha a variante e recusa. Recusa ou estouro em outro item, ou em outro root, não muda nada que este item usa. O relatório continua `NOT_ADMITTED` quando está `INCOMPLETE`. Condições: a mesma busca nos dois caminhos, qualquer errno → recusa e a conferência dos roots depois da última busca.
   - (c) Root não canônico só no loader: aceitável. O root do loader é entrada do host, e o modelo exclui escrita acima do root. Dentro, o loader não segue nada.
   - (d) Recusar `1b` é falso positivo aceitável (falha fechado). Faltam `0x1f` e `.5` (R2-O2).
3. **Ganchos fora do export.** Sim, pelo mapa `exports`. Faltam as garantias do R2-O3.
4. **Tabela do loader (§7.12).**
   - `skillPath` relativo: nenhum teste confere o valor (`grep -rn skillPath`), e há nota no `PUBLIC_API`.
   - Só Linux: o `pdsh-015` falha em macOS, o que está declarado no §16.
   - Os consumidores atuais são só testes, e as composições usam `skills: []`. Conferi as mensagens esperadas: `ilegível`, `entrada inacessível`, `difere do nome do diretório`, `campo desconhecido`, `skill.json ilegível: raw` e `{ok:true, skills:[]}`. O risco é baixo.
5. **M6.**
   - O mapa T07 → 0255-A está coerente (§5).
   - O gate tem a revisão do Codex e a K05, sem C06, conforme o registro da decisão ("o BUILD continua esperando Q01/M1, a PAR-K05 e a revisão T3").
   - Não há ciclo, porque a T07 só depende da K05.
   - Não há avaliador paralelo, porque a admissão é a da T07.
   - O A20 deixa claro que a 0255-A não fecha a T07.
   - Ver R2-O6 sobre a ordem.
6. **P17–P21 e regressões.**
   - P17 é seguro (recusa duplicata).
   - P18 é seguro, mas tem falsos positivos (R2-O1) e o oráculo do marcador (R2-M2).
   - P19 está ok (R2-O2).
   - P20 é seguro com o R2-M1.
   - P21 está ok (R2-O7).
   - Regressões: as provas dependem de tempo (R2-M4), o exemplo com escape sumiu (R2-M3), o CR mudou sem código (R2-O4) e o curinga ficou mais estrito (R2-O5).

## Premissas

Para decisão do usuário:

- **Defaults do lead** (modelo de ameaça, Linux com `/proc`, P8 endurecer, P4 `INVALID`): coerentes e seguros. Confirmar na revisão T3.
- **Escondida — kernel do servidor:** com kernel sem multigrain, a detecção de troca no mesmo tique não é garantida (R2-M4). A G1 cobre a leitura. Basta declarar; não é preciso fixar o kernel.
- **P18:** aceitar falsos positivos em CalVer e em ids `token:`/`secret:`/`credential:` (R2-O1), ou isentar requisitos que o host concede.
- **P19:** aceitar o falso positivo `1b` e completar `0x…` e `.5`.
- **P20:** aceitar a relaxação, com o R2-M1.
- **P21:** aceitar, com o texto ajustado (R2-O7).
- **P17:** recusar duplicata até a T07 definir a precedência.

## O que conferi

- `sha256sum` da SPEC antes e depois: `e03a1553…`. `git status` sem mudança fora de `docs/02_spec/0255…` e desta pasta de evidência.
- Leitura integral da SPEC r2, do `corrections.md`, do `decisions-20261022.json`, do `spec-r2.json` e da sonda do executor e da saída dela.
- Conferências pontuais:
  - `grep -n 'LINE_ENDING\|redacted:\|u0069\|u0064\|Ganchos'` na SPEC;
  - `packages/harness/package.json` (`exports` só com `"."`) e `tsconfig.base.json` (`paths`);
  - `grep` de imports relativos para `packages/harness/src`: só testes;
  - `.github/workflows/*.yml` (`runs-on`; sem `container:`);
  - `grep` de ids de ferramenta com `secret`/`token`/`credential`: nenhum hoje;
  - `0380:104` (Codex como dono do PARE100), `0380:536`, `0383:13`;
  - os testes `pdsh-015` e `pdsh-031` contra a tabela do §7.12.
- Sondas em Node v22.23.2, kernel 7.0.0-38, com `env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin`, dados sintéticos em diretório temporário removido:
  - `critic-probe-r2.mjs`, casos t1–t12. É uma implementação literal do §8.2–8.7, das duas regras de busca (§7.9.7 e §7.10.2), do redator real contra identificadores, da força bruta do marcador de 12 hex e da regex da P19.
  - Sonda dos campos da assinatura que mudam numa troca ABA.
- Caminhos das sondas:
  - `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/c100-critic/critic-probe-r2.mjs`;
  - `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/c100-critic/critic-probe-r2-output.json`;
  - `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/c100-critic/critic-probe-r2-aba-fields.cjs`;
  - `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/c100-critic/critic-probe-r2-aba-fields-output.json`.
