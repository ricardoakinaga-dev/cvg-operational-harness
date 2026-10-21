# Crítico independente R2 — AUD0621-PRODUCT-PISO008-20261021

Agente general-purpose novo (não-fork), prompt autocontido, somente leitura, sobre
o HEAD `321a1369c` da candidata (commits `a0e601994`, `8a4d1d239` reparo agrupado
da R1, `321a1369c` correção da sandbox achada durante o reparo). Rodou a suíte do
produto (11 arquivos/120 testes verdes), as sondas da R1 ajustadas e sondas novas
(`probe-sandbox-r2.mts`, `probe-paused-r2.mts`, `probe-paths-r2.mts`, cópia
mutada `mut-sandbox-m36b.ts`, fora do repositório). Candidata não alterada.

**VEREDITO: REJECT** — 3 obrigatórios, todos no caminho da sandbox de restore.

Obrigatórios da R1 conferidos como corrigidos: 1 (cópia pausada retomada), 2
(`liveOk` no monitor), 3 (destino do restore e `--out` dentro do volume) e 5
(URL obrigatória ou dispensa registrada; /proc como indício fraco). O 4 (sandbox
exercita confirmação e lembrete) só está correto com zero ou um rascunho
restaurado.

## Obrigatórios da R2

Pela regra da frente a rodada parou e foi reportada; depois o Lead autorizou uma
rodada de reparo e um R3 restrito (`critic-r3.md`, APPROVE), commit
`5cb5d303c`. Texto original da R2:

1. `src/restore-sandbox.ts` (complemento `syntheticDraft()`): devolve
   `findDraft()`, o primeiro rascunho confirmável da projeção, e não a nota que
   acabou de criar. Com dois ou mais rascunhos restaurados vencendo depois do
   tick, o complemento confirma outro rascunho restaurado, o sintético fica em
   rascunho e nenhum lembrete sai: falso FAIL em volume saudável (sondas
   `probe-sandbox-r2.mts` e `probe-paused-r2.mts` caso D, onde
   `reminderSource: synthetic_due_draft` aparece com o lembrete de uma tarefa
   restaurada). Correção indicada: identificar a nota criada (id novo ou paciente
   sintético) e dar FAIL explícito se ela não existir; teste com dois ou mais
   rascunhos que vencem depois.
2. `src/restore-sandbox.ts` (exigência de exercício do lembrete): sem teste que
   a derrube; M36, M36b e M40 sobreviveram e a evidência os rotulava como
   equivalentes. Na cópia mutada M36b, o caso de dois rascunhos dá PASS sem
   nenhum lembrete (falso PASS). Correção indicada: caso que precisa dar FAIL
   quando nenhum lembrete pode ser exercido (ou verificação extraída para função
   pura testável). O rótulo da evidência foi corrigido em
   `mutation-controls.json` (sobreviventes, não equivalentes).
3. `src/restore-sandbox.ts` e `src/backup.ts` (`copyVolume`): `--sandbox` aceita
   pasta dentro do volume restaurado ou do volume de origem e roda o assistente
   gravável ali com PASS (sonda `probe-paths-r2.mts` S1/S2), contrariando
   `docs/operations.md` ("o volume restaurado não é tocado pela sandbox"). Mesma
   classe do obrigatório 3 da R1. Correção indicada: recusar sandbox igual ou
   dentro do `restoredDir` (realpath) e, no `restore-proof`, dentro da origem
   pelos ancestrais contra `sourceRealpathSha256`.

## Opcionais/residuais da R2 (registrados)

- `src/monitor.ts`: readiness 200 com corpo `{}` (sem `ready`/`mode`) conta como
  saudável; sugestão: exigir `ready === true`.
- `docs/operations.md`: não descreve o complemento `synthetic_due_draft`, que o
  pai do `--target` precisa existir, nem que o restore recusa o caminho original
  mesmo em host novo (o hash é só do caminho).
- `src/backup.ts`: `statSync` no lugar de `lstatSync` aceita `dataDir` que é
  symlink (antes `source_missing`), sem teste nem doc.
- Retomar a cópia pausada processa as mensagens restauradas pendentes
  (`policy_denied`, respostas a membros); a cópia não pausada não processa.
  Assimétrico, inofensivo.
- `scripts/shift-monitor.mjs`: o log do ciclo não inclui `liveOk` (cosmético).
- Sem mudança, como pedido: envio dentro do ciclo de sondagem e reenvio por
  minuto. V2, lock e outbox não inventados.

## Conferido pela R2

Suíte 11/120 verde; sondas da R1 passam (monitor sem `resolved` com o serviço
fora; restore P3a/P3b FAIL com origem intacta; `--out` dentro do volume lança
sem gravar; volume vazio e pausado dão PASS; os 6 nomes/endereços de metadata
recusados); `--out` B1–B4 corretos; scripts com os códigos de saída esperados;
prova de alerta (38/38, 14 recibos) gerada depois de `8a4d1d239`, cobrindo o
reparo do monitor; `321a1369c` só mexe na sandbox.
