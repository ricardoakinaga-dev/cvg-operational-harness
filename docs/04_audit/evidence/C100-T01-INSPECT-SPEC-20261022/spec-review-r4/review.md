# Revisão crítica independente — SPEC0255 r4 (delta r3 → r4, rodada única de replanejamento)

- SPEC: `docs/02_spec/0255_c100_skill_plugin_offline_inspection.md`, revisão r4.
- sha256 conferido antes e depois da revisão: `3bc9d091d35132e95c5054a39b82d9845b66d5a6ade89a055ecf5d9353e97ebb`.
- Base do delta: r3 em `HEAD` `176c1bdf`, com sha256 `6fec67f4…`, igual ao aprovado na revisão r3.
- Escopo: só o delta, conforme `replan-20261023.md`. Mesmo crítico das rodadas anteriores, sem autoria. Data: 23/10/2026.
- Escrita só nesta pasta. Sem commit, push, PG, install, lockfile ou mudança de cartão.

## Veredito: APPROVE

Não há obrigatórios.

- As correções F01 e F02 do Codex estão certas e não abrem regressão.
- As três escolhas do executor são aceitáveis.
- R3-O1 a R3-O8 foram aplicados.
- O delta não traz contrato, aceite ou corte fora do escopo do replanejamento.

Ficam quatro opcionais, todos de texto. Nenhum leva a falha de segurança, prova falsa ou BUILD impossível. Podem virar nota do BUILD sem r5.

O APPROVE não autoriza o BUILD. Pelo §14, ainda faltam três coisas:

- a conferência da r4 pelo Codex;
- a revisão T3 do usuário, presa ao sha256 `3bc9d091…`;
- a C100-Q01/M1 e a PAR-K05.

## Integridade do delta

- O `spec-r4.diff` é igual a `git diff -b HEAD`, e o `spec-r4.full.diff` é igual a `git diff HEAD`. Os hashes batem com o `spec-r4.json`.
- O conteúdo normalizado (espaços e alinhamento de tabela) muda 40 linhas novas e 29 removidas. O resto do diff completo (130/119) é só realinhamento do prettier. Não há mudança de conteúdo escondida em espaço.
- Os hashes do patch do Codex, do `owner-review-codex.json` e do handoff no checkout principal batem com o `spec-r4.json`. A conferência foi só de leitura.

## Ponto 1 — F01 e F02

### F01 — SK10c-new

O Codex tem razão, e é uma falha que eu não vi na r3. O SK10c-new da r3 exigia `SELECTED` para uma skill que declara `synthetic.write`, com o perfil sem `synthetic.write`. Mas a condição 5 (§7.9) e o §7.10 dão `TOOL_NOT_GRANTED` e `REFUSED` nesse caso.

A correção, com dois controles, fecha a contradição:

- (i) Ferramenta declarada fora do grant: `REFUSED`, com `TOOL_NOT_GRANTED`, o array intacto e o kernel em `POLICY_DENIED`. Isso mata o MU47 e também o MU14b: um mutante que acrescenta ao array as ferramentas declaradas passaria na condição 5 e mudaria o array.
- (ii) Ferramentas concedidas e corpo que instrui WRITE: `SELECTED`, e o WRITE continua em `POLICY_DENIED`.

O A10 está alinhado. Não há regressão.

### F02 — mensagens do validador

A mudança está certa. Hoje o loader interpola a chave do autor (`loader.ts:49`) e o id e o nome do diretório (`loader.ts:69`).

- As categorias fixas "campo desconhecido" e "id difere do nome do diretório" preservam as asserções existentes. O `pdsh-015:79` confere `toContain('difere do nome do diretório')`, o `pdsh-015:91` confere `toContain('campo desconhecido')` e o `pdsh-015:107` confere "campo ausente: version". Nenhum teste confere a forma interpolada (`grep`).
- O SPEC0200 (linhas 49 e 120) exige só o erro, não o texto da mensagem, então não há contradição com a SPEC aprovada.
- MU46 e MU48 têm teste que os mata (SK14 e SK11).
- O segredo é montado no teste por concatenação, o que evita literal para o scanner.

## Ponto 2 — escolhas do executor

1. **F02 também no `field` da inspeção (`UNKNOWN_FIELD`, sem `field`).** Aceito. A saída fica mais estrita, e o R3-O2 deixa de existir. O custo é de diagnóstico: o relatório não diz qual chave é desconhecida. Isso está declarado no §7.5 item 4. Falta um detalhe de texto (R4-O1).
2. **Mensagem de id diferente do diretório fixada.** Aceito. Ela tira o id, que vem do conteúdo. Mas o `skillPath` relativo do mesmo erro continua trazendo o nome da entrada (§7.12, `"<entrada>/skill.json"`), por desenho. A asserção do SK14 tem de valer só para a mensagem (R4-O3).
3. **"skill.json ilegível: raw" mantida.** Aceito. Só ocorre se o `JSON.parse` for trocado por um mock que lança algo que não é `Error`, o que nunca acontece em produção, e não traz conteúdo da skill. Mudar exigiria mexer na asserção de `pdsh-031:410`, o que fica fora do delta.

## Ponto 3 — R3-O1 a R3-O8

| Item | Estado |
| --- | --- |
| R3-O1 | Aplicado. O §8.11 diz: na seleção, a busca vem primeiro; no inventário, a aquisição e depois a busca; a conferência final vem depois da última busca e da última leitura. |
| R3-O2 | Resolvido pela F02. Uma ressalva de texto no §8.10 (R4-O1). |
| R3-O3 | Aplicado no I7. |
| R3-O4 | Aplicado no §8.9. |
| R3-O5 | Aplicado: P23 e risco no §16. |
| R3-O6 | Aplicado no §14 item 1 e no §15, coerente com `0383:15` e com o replanejamento. |
| R3-O7 | Aplicado: cabeçalho "Estado na r4", I13 (d) e teto de 64 no `skillId`. O teto abriu uma exceção não declarada no I13 (R4-O2). |
| R3-O8 | Aplicado no §12, parágrafo "Tempo". |

## Ponto 4 — escopo

Não há contrato, aceite ou corte novo além do replanejamento:

- `UNKNOWN_FIELD` é um código do validador estruturado que já existia desde a r2.
- O teto do `skillId` vem do R3-O7.
- A P23 é uma declaração (R3-O5).
- MU46 a MU48 são provas da F01 e da F02.
- O A10, o A11 e o A17 só mudaram de texto para refletir o patch do Codex.

O cabeçalho, o §14 e o `spec-r4.json` mantêm "BUILD não autorizado".

## Opcionais (R4)

- **R4-O1 — Texto residual do `field` antes da F02.** O §8.10 passo 3 (SPEC:773) ainda diz "sem mostrar a chave, salvo se casar o charset do `field`". Depois da F02, o `field` só aceita o vocabulário fixo (§7.6), então a leitura certa é "só se a chave for do vocabulário fixo". Correções sugeridas:
  - trocar o texto;
  - acrescentar ao SK11 o caso de uma chave do autor repetida e estendê-lo ao MU48;
  - dizer que `FRONTMATTER_KEY_UNSUPPORTED` e `FORBIDDEN_CODE_POINT` em chave desconhecida do frontmatter também saem sem `field`.
- **R4-O2 — O teto de 64 só vale na seleção.** O §7.2 recusa `skillId` com mais de 64 caracteres (`INPUT_INVALID`). Mas o inventário aceita diretório com nome do `ID_PATTERN` de qualquer tamanho (§7.4). Um item com id longo pode sair `ADMITTED`, e a seleção dele lança `INPUT_INVALID`, uma exceção que o I13 não lista. Falha fechado. Correção: aplicar o teto ao nome do item (`ITEM_NAME_INVALID`) ou declarar a exceção (e) no I13.
- **R4-O3 — Alcance da asserção da F02 no loader.** O SK14 diz que nenhum dos dois casos "traz a chave, o id ou o nome". O `skillPath` relativo (§7.12) traz o nome da entrada por desenho, e o MU46 fala só "na mensagem". Correções sugeridas:
  - dizer no SK14 que a asserção é sobre `message`;
  - dizer no §7.12 que o `skillPath` leva o nome da entrada do sistema de arquivos, que não é conteúdo, e que o loader não tem redator.
- **R4-O4 — Texto do SK10c-new (i).** "Corpo da ferramenta zero" quer dizer "`execute` da ferramenta chamado zero vezes". Escrever assim.

## Premissas para o usuário

- **P23 (nova):** CR ou CRLF em `SKILL.md` e nas referências deixam o item `INVALID`.
- **Custo da F02:** o relatório não diz qual chave é desconhecida. Decidir se esse custo é aceitável. O Codex propôs a regra, e o executor a estendeu à inspeção.
- **O resto não muda:** os defaults do lead (ameaça, Linux com `/proc`, P8 com as mensagens em categorias, P4, P11, P12, P15 e P22) e as premissas P3, P5–P7, P9, P10, P13, P14 e P16–P21, com os defaults avaliados como seguros nas rodadas anteriores.

## O que conferi

- `sha256sum` da SPEC antes e depois: `3bc9d091…`. `git log` mostra a r3 no `HEAD` (`f465878d` e `176c1bdf`), e `git show HEAD:…` dá `6fec67f4…`.
- `git diff -b HEAD` e `git diff HEAD`, comparados byte a byte com o `spec-r4.diff` e o `spec-r4.full.diff`. Os dois batem.
- Diff por palavra (`--word-diff`) de todo o delta.
- Comparação normalizada r3 × r4 com Node, para separar conteúdo de realinhamento.
- Leitura do `replan-20261023.md`, do `codex-corrections.md`, do `spec-r4.json` e do `spec-approval.json`.
- Leitura só de consulta, no checkout principal: patch do Codex, `owner-review-codex.json` e item 5 do handoff, com os hashes conferidos.
- Código e testes:
  - `loader.ts:49` e `loader.ts:69` (mensagens interpoladas);
  - `pdsh-015:73-107` e `pdsh-031:371-410` (asserções de mensagem);
  - `grep` de "campo desconhecido" e "difere do nome" em todo o código;
  - SPEC0200, linhas 49 e 120.
- Trechos da r4: §7.2, §7.5, §7.6, §7.11, §7.12, §8.9 a §8.11, §12 (SK10c-new, SK11, SK14, MU46 a MU48), §13 a §17.
- Cópia da r3 extraída do `HEAD` para a comparação, no scratchpad: `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/c100-critic/spec-r3.md`.
