# PAR-X02 BUILD, fatia 3 — o helper do Landlock no lançamento do X01 (SPEC 0288)

Task `AUD0625-PAR-X02-SPEC-DF-20261029`, Claude DF (Opus), 30/10/2026. Esta é a implementação; a revisão fica com uma sessão não autora (sugestão: a 07, autora do serviço do X01). Recibo `human-decisions-20`. Base: fatia 2 (`0a52f8106`). Produção `NO_GO`.

## Mudança

- `process-profile.ts`:
  - `ProcessContainmentOptions.landlockHelperPath?`: o helper revisado é capturado e fixado no perfil como o bubblewrap (stamp, sha256, tamanho), fora do workspace e executável. Sem helper, o digest do perfil não muda.
  - `landlockRulesFor(profile)` (§5.5): lista fechada derivada do perfil, nunca do payload:
    - leitura e execução em cada arquivo de runtime montado;
    - todos os direitos do ABI 3 no workspace e no `/tmp` do lançamento;
    - leitura e escrita em `/dev/null`, e leitura em `/dev/zero`, `/dev/urandom`, `/dev/random` e `/proc`.
    Só os bits 0–14, do ABI 3 (o piso D-B), entram, para nenhuma regra nomear um direito que o piso não trata. Um caminho com quebra de linha é recusado, porque o formato do helper é uma regra por linha.
  - `prepareProcessLaunch({ landlock: true })`:
    - sem helper no perfil, recusa (`landlock_helper_required`) antes de abrir qualquer fd;
    - com helper, monta-o somente leitura em `/.cvg/landlock-exec` (nenhum destino de runtime nem workspace pode ficar sob `/.cvg`);
    - embrulha o argv em `helper --status-fd F --rules-fd R -- argv`;
    - devolve `landlock: { statusFdIndex, rulesFdIndex, rules }`. Os dois canais vêm depois do pipe de status do bubblewrap.
- `process-service/service.ts`:
  - `ProcessServiceOptions.requireLandlock` (opção do anfitrião, como o `requireLandlock` do gate): todo lançamento passa pelo helper;
  - o serviço abre os dois pipes extras, escreve o ruleset e fecha o canal de regras;
  - no `close`, um lançamento com Landlock sem prova vira `spawn_failed`, com `landlock_<erro>` nos erros secundários (XL04).
- `process-service/landlock-status.ts`: leitor do canal do helper. Só conta como aplicado um documento bem formado:
  - exatamente as 5 chaves;
  - contadores inteiros, com `handledFs` diferente de 0;
  - ABI ≥ `LANDLOCK_MIN_ABI`;
  - no máximo 512 bytes.
  Recusa do helper preserva o código (`[a-z_]{1,40}`). Qualquer outra coisa é `status_malformed`.
- `types.ts`: `ProcessOutcome.landlock` sempre presente (§5.4). Sem `requireLandlock`, diz `{ applied: false }` em vez de silêncio.

## Provas

- `tests/par-x02-landlock-launch.test.ts` (9), em bubblewrap real, com o helper compilado da fonte (estático quando a libc estática existe, como D-A):
  - **XL03 pelo serviço:** a escrita num diretório que o bubblewrap cria e deixa gravável (o pai do workspace) dá `wrote` sem o helper e `EACCES` sob o helper, que relata `applied: true` com ABI ≥ 3;
  - o workspace e o `/tmp` seguem graváveis sob o helper;
  - **XL04:** helper com `-DMIN_ABI=99` dá `spawn_failed`, `landlock: {applied:false, error:'abi_too_low'}`, `exitCode: null` e a sentinela do payload não criada;
  - serviço com Landlock e perfil sem helper não lança nada;
  - preparação: ordem dos fds, bind somente leitura, embrulho do argv, ruleset fechado (nenhuma regra para `/`, para o pai do workspace ou para o helper), recusa sem helper e de caminho com quebra de linha, helper dentro do workspace e não executável recusados, e digest que muda com o helper.
- `packages/sandbox/src/__tests__/par-x02-landlock-status.test.ts` (6): prova partida em pedaços, canal vazio, recusa com e sem código válido, 12 formas malformadas (dois documentos, chaves a mais ou a menos, tipos, negativos, inseguros, `handledFs` 0), piso e excesso de tamanho.
- XL06, o payload não herda os fds: provado no próprio helper na fatia 1, que fecha os dois antes do `execve`. Pelo serviço não há asserção estável, porque o Node do payload reusa números de fd baixos.

## Mutantes (`mutate-s3.sh`, `mutations-s3.log`): 10/10 mortos

| ID  | Mutante                                       |
| --- | --------------------------------------------- |
| M1  | status do helper ignorado                     |
| M2  | serviço não pede o Landlock à preparação      |
| M3  | regra do workspace vira `/`                   |
| M4  | argv não embrulhado no helper                 |
| M5  | piso do ABI ignorado no leitor                |
| M6  | chaves extras aceitas                         |
| M7  | helper ausente não recusado                   |
| M8  | ruleset não escrito                           |
| M9  | `/tmp` fora das regras                        |
| M10 | excesso de tamanho do canal ignorado          |

## Gates

- `packages/sandbox` mais os testes do X01 e do X02: 18 arquivos e 328 testes passam.
- Typecheck da raiz, eslint e prettier: limpos.
- `skip:governance`: PASS. O `certification/skip-inventory.json` foi restaurado depois do gate.

## Fica para a fatia 4

O build do helper na CI. A imagem de produção segue sem bubblewrap e sem helper (D-C), então `PROCESS` continua `unavailable` lá.
