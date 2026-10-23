# Revisão crítica independente — SPEC0255 r3

- SPEC: `docs/02_spec/0255_c100_skill_plugin_offline_inspection.md`, revisão r3.
- sha256 conferido antes e depois da revisão: `6fec67f4637b1e4f4f3fb88ee0c1ac4f443a967e303c358c38c50304bb87a1f9`. É o mesmo do `spec-r3.json`.
- Base: `main` `420b97b3`. Worktree `cvg-d9ef-c100-t01-spec-20261022`, só leitura.
- Mesmo crítico da r1 e da r2, que não escreveu a SPEC. Data: 22/10/2026.
- Escrita só nesta pasta. Sem commit, push, PG, install, lockfile ou mudança de cartão.
- Numeração: `R3-O…` são os opcionais desta rodada. `R2-M…` e `R2-O…` são da revisão anterior. `MU…` são os mutantes da SPEC.

## Veredito: APPROVE

Não há obrigatórios.

Os quatro obrigatórios da r2 estão fechados, e conferi cada um por sonda ou pelos bytes do arquivo. Os nove opcionais da r2 foram aplicados. Nenhum deles traz regressão de segurança.

Ficam oito opcionais de texto e de declaração. Nenhum leva a falha de segurança, prova falsa ou BUILD impossível.

Este `APPROVE` é só o item 1 do §14. Ele **não** autoriza o BUILD. Ainda faltam a revisão dos aceites pelo Codex, a revisão T3 do usuário, presa ao sha256, a C100-Q01/M1 e a PAR-K05.

## Estado dos obrigatórios da r2

| r2 | Estado | Como conferi |
| --- | --- | --- |
| R2-M1 — busca de nome diferente | **Fechado** | Sonda r3, implementação literal do §8.11. Os dois caminhos dão o mesmo resultado em todos os casos: t10 (diretório em A, arquivo em B) → `NAME_CONFLICT` nos dois; symlink em B → `NAME_CONFLICT`; `EACCES` (B com modo 0600) → `NAME_LOOKUP_FAILED` nos dois; duplicata real → `DUPLICATE_ID`; ausente → `UNIQUE` na admissão e `NOT_FOUND` na seleção. Na corrida, a duplicata sai antes da busca e volta depois, com espera de 50 ms. A conferência final vem depois da busca e dá `COVERAGE_INCOMPLETE` nos dois. A ordem está escrita no §8.2 passo 5, no §8.11, no §7.9 condição 1 e no §7.10 passo 3. O I13 lista as exceções (a) a (d). |
| R2-M2 — marcador reversível | **Fechado** | `<redacted:N>` e `<unsafe:N>` são ordinais (§7.4, §7.11). Item com valor redigido ou nome inseguro sai com `itemDigest: null`, `sha256: null` no arquivo e forma exibida no `inputDigest` (§7.11, §8.9). O MU41 confere a ausência de prefixo do hash. O resto que ainda sai calculado sobre o valor bruto é só comprimento: `bytes` do arquivo e custo da projeção. A limitação do `sha256` de arquivo pequeno com valor enumerável na descrição está declarada com honestidade no I9 e no §7.11. |
| R2-M3 — escape e marcador do MU04 | **Fechado** | Com Node, o arquivo tem a sequência literal de 6 caracteres (barra invertida, `u`, `0069`) nas linhas 350 e 897. O exemplo `{"id":"a","id":"b"}` aparece 2 vezes, e o `JSON.parse` dele dá `"b"`, ou seja, é duplicata. O SK05b(iii) confere o `sha256` do `BODY` e põe o marcador na `description` de fora. |
| R2-M4 — dependência de timestamp | **Fechado** | A G1 está separada da G2, e a G2 depende do kernel (P22), o que bate com a sonda r2: numa troca ABA só mudam `ctimeNs` e `mtimeNs`. O risco residual lista os três efeitos, todos de dentro. Há os ganchos `beforeItemCheck` e `afterItem`. SK05b(iii) e o MU40 esperam 50 ms, o que basta para um tique de 1 a 4 ms. O SK05b(vi) usa subdiretório, que muda `nlink`. O 0393:19 confirma o Ubuntu Server 24.04 no servidor. |

## Escolhas do executor

- **(a) Três motivos (`NAME_CONFLICT`, `DUPLICATE_ID`, `NAME_LOOKUP_FAILED`).** Aceito. Os três recusam nos dois caminhos, e a sonda confirma.
  - A separação é útil na operação: entrada de outro tipo, duplicata real e erro de busca pedem ações diferentes.
  - Um arquivo regular no root, que o inventário ignora (`ROOT_ENTRY_IGNORED`), agora bloqueia a skill de mesmo nome em outro root. Isso é mais estrito e coerente.
- **(b) `hostIdentifiers` com igualdade exata (MU45).** Aceito, e é seguro. A isenção só vale para um texto que o próprio host forneceu, então não pode vazar segredo da skill.
  - Efeito colateral: a validação de formato e a publicação do digest passam a depender do contexto do chamador (R3-O3).

## Opcionais da r3

- **R3-O1 — Ordem entre busca e aquisição na seleção.** O §7.10 faz a busca (passo 2) antes da aquisição (passo 3). O §8.11 diz "2. ... na seleção, adquirir só a skill pedida; 3. buscas". Na seleção, a busca tem de vir primeiro, para achar o root. As duas versões terminam com a conferência final depois de tudo, então não há efeito de segurança. Alinhar o §8.11.
- **R3-O2 — `field` alterado pelo redator.** O §7.5 item 4 manda para `<unsafe:N>`. O §7.11 manda para `<redacted:N>`, com `SECRET_PATTERN_IN_IDENTIFIER`. Só a segunda forma dispara a regra "nada calculado sobre o valor bruto". Alinhar com o §7.11: `<unsafe:N>` só para charset, `<redacted:N>` para mudança do redator.
- **R3-O3 — Contexto do chamador.** Com `hostIdentifiers` e o grant entrando na isenção sozinho, o mesmo item pode sair `INVALID` no inventário e `VALID` na admissão. Pode também ter `itemDigest` nulo num perfil e não no outro, e outro `inputDigest`. Isso falha fechado no inventário. Declarar no I7 ou no §7.11, e dizer que o `expected.inputDigest` vem de uma execução com o mesmo contexto.
- **R3-O4 — O `inputDigest` não fixa o conteúdo de item com `itemDigest: null`.** Mudar o conteúdo de um item redigido ou com nome inseguro não muda o `inputDigest`. Não afeta a admissão de outro item (P20). Declarar no §8.9.
- **R3-O5 — CRLF recusado.** A R2-O4 deixa `INVALID` todo `SKILL.md` ou referência com CR, inclusive no corpo. É uma escolha de compatibilidade, como P4, P7 e P19. Pôr nos riscos (§16) e nas premissas, para o usuário decidir sabendo disso.
- **R3-O6 — Limite de rodadas.** O §14 item 1 diz "até duas rodadas por revisão". O `0383:15` diz "até dois retrabalhos; depois replanejar". A r3 é o segundo retrabalho. Alinhar o texto à regra do cartão, para que uma mudança futura (por exemplo, do Codex) não pareça abrir rodadas sem limite.
- **R3-O7 — Detalhes de texto.**
  - O cabeçalho da tabela do §5 ainda diz "Estado na r2".
  - O I13 (d) diz "que só o inventário avalia". A condição 9 é do perfil `admission` da inspeção, então o certo é "que só a inspeção avalia".
  - O `ID_PATTERN` do `skillId` de entrada não tem teto de comprimento. Um id longo falha fechado com `ENAMETOOLONG` → `NAME_LOOKUP_FAILED`, mas o melhor é `INPUT_INVALID` (por exemplo, 1 a 64 caracteres).
- **R3-O8 — Timestamp do sistema de arquivos dos testes.** A espera de 50 ms supõe um FS com tempo fino (ext4, xfs, btrfs, tmpfs). Em FS de granularidade grossa (ext3 com inode pequeno, alguns NFS), as provas de troca voltam a ser instáveis. Dizer que os testes de corrida rodam em diretório temporário local.

## Respostas aos pontos do coordenador

1. **R2-M1 a R2-M4:** todos fechados (tabela acima).
   - O t10 e o `EACCES` foram refeitos contra o §8.11 literal: `NAME_CONFLICT` e `NAME_LOOKUP_FAILED`, iguais nos dois caminhos.
   - A conferência final vem depois da última busca. Na corrida, a sonda dá `COVERAGE_INCOMPLETE` nos dois caminhos.
   - O marcador ordinal não deixa oráculo, e a limitação do `sha256` de arquivo pequeno está no I9.
   - O escape está no arquivo como os 6 caracteres literais.
2. **Escolhas:** (a) e (b) aceitas. O efeito de (b) sobre o contexto está no R3-O3.
3. **Regressões dos opcionais aplicados:** nenhuma de segurança. Há duas premissas que ficaram implícitas: CRLF recusado (R3-O5) e dependência do contexto (R3-O3). Os demais estão coerentes:
   - R2-O2: a regex nova acerta `0x1f`, `.5` e `+.5`;
   - R2-O3: os ganchos só endurecem e o setter é interno;
   - R2-O5: o curinga está alinhado;
   - R2-O6: a ordem do gate está certa;
   - R2-O7: o texto de montagem está certo;
   - R2-O8: o achado do corpo não bloqueia;
   - R2-O9: id e nome passam pelo redator.
4. **Gate:**
   - A ordem crítico → Codex → usuário está coerente, e uma mudança do Codex gera novo sha256 e nova rodada do crítico (§14 item 2).
   - O texto não autoriza o BUILD. O cabeçalho diz "BUILD não autorizado", o §14 diz "bloqueado" com os itens 4 e 5 abertos, o §15 diz "quando houver BUILD", e o `spec-r3.json` tem `buildAuthorized: false`.
   - Ver R3-O6 sobre o limite de rodadas.

## Premissas para o usuário decidir

- **Defaults do lead** (§17.2): modelo de ameaça com escritor concorrente; Linux com `/proc`; P8 (endurecer o loader); P4 (chave fora da gramática dá `INVALID`); P11; P12; P15; P22 (detecção depende do kernel). Todos falham fechado.
- **P20:** admitir um item sem exigir a cobertura do relatório inteiro. É segura com a busca única do §8.11.
- **P18:** falsos positivos da redação de identificadores (CalVer, `token:`, `secret:`, `credential:`), a menos que o host os passe em `hostIdentifiers` ou no grant.
- **P19:** o falso positivo `1b` é aceito.
- **P21:** a checagem de montagem não pega bind mount do mesmo sistema de arquivos e pode recusar btrfs ou overlayfs à toa (falha fechado).
- **CRLF recusado** (R3-O5): premissa nova implícita.
- **P3, P5–P7, P9, P10, P13, P14, P16 e P17:** defaults seguros.

Não é do usuário, mas é gate: o Codex revisa os aceites marcados "proposta" antes da revisão do usuário.

## O que conferi

- `sha256sum` da SPEC antes e depois: `6fec67f4…`, igual ao do `spec-r3.json`. `git status` sem mudança fora de `docs/02_spec/0255…` e desta pasta de evidência.
- Leitura integral da SPEC r3, do `spec-review-r2/corrections.md` e do `spec-r3.json`.
- As cópias das minhas sondas da r2 na evidência são iguais ao scratchpad (`critic-probe-r2.mjs.txt`: sha256 `74a807cd…`, idêntico).
- Bytes do escape: script Node que conta a sequência de barra invertida e `u0069` (linhas 350 e 897) e faz o `JSON.parse` do exemplo, que dá `"b"`.
- `grep` de "Estado na r2", "só o inventário avalia" e "até duas rodadas" na SPEC.
- `0383:15` (limite de retrabalho) e `0393:19` (Ubuntu Server 24.04).
- Sonda r3 em Node v22.23.2, kernel 7.0.0-38, uid 1000, com `env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin` e dados sintéticos em diretório temporário removido:
  - `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/c100-critic/critic-probe-r3.mjs`;
  - `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/c100-critic/critic-probe-r3-output.json`.
