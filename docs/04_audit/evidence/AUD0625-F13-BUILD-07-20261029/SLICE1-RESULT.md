# AUD0625 F13 — fatia 1 (SPEC 0283 §3–§4): recibo do preview e token de revisão

Task `AUD0625-F13-BUILD-07-20261029` (Claude Sonnet, sessão 07). Branch
`claude/aud0625-f13-07` sobre `claude/aud0625-wave3` `caf38b204`; sem push.
Autorização: SPEC 0283 aprovada pelo Ricardo com A–E como recomendado
(`human-decisions-13.json`, sha256 `1891581a…1516e53`, copiado byte a byte
nesta pasta). Não libera release, piloto, provider/canal real, ação clínica
nem a D2.

## O que mudou (somente `products/shift-assistant/src/**`)

- `domain.ts`: evento `preview_presented` (`PreviewPart` por parte com
  `index`, `bytes`, `partSha256`, `outcome`), campos opcionais da nota
  `revision`, `completedIds`, `rawIntro`.
- `preview-receipt.ts` (novo): `previewContentSha256`, `previewToken`
  (`<8 hex da nota>-r<revisão>-<8 hex do hash>`), `previewEligibility`,
  `isCompletePresentation`, texto de recusa `CONFIRMATION_NOT_ELIGIBLE: <causa>`.
- `store.ts`: projeção `previewState` (tentativas, `complete` permanente,
  último recibo) e `notesAwaitingPreview` (rascunhos sem recibo completo, não
  cortados, dentro de `MAX_ATTEMPTS` e do atraso `RETRY_DELAYS_MS`).
- `assistant.ts`: o preview passa por `#present`, que envia parte a parte,
  **para na primeira falha**, marca as demais `not_sent` e grava o recibo; o
  texto vem de `#renderPreview(note)` (mesmo caminho no envio inicial e na
  reapresentação); `#confirm` exige recibo completo (ou eco do token completo
  quando a última parte ficou `uncertain`); o tick reapresenta rascunhos sem
  recibo; preview cortado nunca é confirmável e a pessoa recebe o motivo.
- `transport-limits.ts`: `splitForChannelChecked` informa o corte.
- `commands.ts`: `ok nota <token completo>`; o código de 8 hex puro não
  seleciona mais rascunho.
- `restore-sandbox.ts`: usa o token completo.

## Pontos de interpretação (a D9 deve ver)

1. **Hash do token.** A SPEC §3 diz "hash do texto integral do preview", mas o
   token aparece no preview: o hash do texto dependeria dele mesmo. O hash é de
   um **conteúdo canônico** (fonte, campos organizados, avisos, IDs completados
   e tarefas propostas com número, descrição, paciente, ID e prazo). O que foi
   enviado fica ligado por `partSha256` de cada parte no recibo. Mudar qualquer
   parte do conteúdo muda o token (teste por campo).
2. **503 do canal é `uncertain`**, não `not_sent`: é a classificação existente
   do transporte (`DispatchError`). Logo "canal recusou com 503" cai em
   `preview_uncertain` (reapresenta; `ok` simples recusado; eco do token
   completo aceito). `not_sent` é o que nunca saiu (egress negado, abortado).
3. **Eco do token** só vale quando todas as partes foram `accepted` ou
   `uncertain` e a última (que leva o token) é `uncertain`; qualquer parte
   `not_sent` recusa (0283-B).
4. **Rascunho legado** (journal sem recibo) é não elegível até o primeiro tick,
   que o reapresenta com o mesmo conteúdo; `revision` ausente lê 1 (0283-C).
5. **Reapresentação** reaproveita o orçamento de 5 tentativas e os atrasos
   30 s / 2 min / 10 min / 30 min da SPEC 0179 §6; um recibo `complete` nunca é
   desfeito. Cortado (`truncated`) não é reapresentado (0283-A).
6. A mensagem "mais de um rascunho" agora lista tokens completos; o teste
   `confirmation-reliability` foi ajustado ao token (consequência da SPEC §4).

## Provas

- Os 5 RED da fatia 1 (R1–R5) viraram `it`; R6–R8 (fatia 2) seguem `it.fails`.
- Novo `preview-receipt-journal.test.ts` (19): reinício com recibo completo e
  sem recibo, replay do webhook de `ok`, rascunho legado, reapresentação após
  atraso, orçamento, recibo completo permanente, preview cortado (sem reenvio,
  com aviso), token (revisão, mudança por conteúdo, completo, código curto,
  hash/revisão errados, revisão substituída, outro autor, eco em `uncertain`,
  eco recusado em `not_sent`), recibo de falha parcial, sem apresentação
  concorrente.
- Suíte do produto: 14 arquivos, 162 testes, 159 passam + 3 esperados falhar
  (fatia 2). eslint, prettier `--check` e `docs:check-links` OK. `tsc` do
  produto: só o erro preexistente `classification-no-model.test.ts(40,15)`
  (TS7006, referência de projeto do `model-gateway` não construída) e TS6305.
- Mutação (`mutate-s1.py`, 23 mutantes): 22 mortos
  (`mutations-s1.json` + `mutations-s1-rerun.json`; M15 e M18 sobreviveram na
  primeira rodada e foram mortos com os testes de falha parcial e de
  apresentação concorrente). **M23 sobrevive e é defensivo**: o ramo "envio
  suprimido antes da 1ª parte" só dispara com pausa/desligamento/revogação
  entre o commit e o primeiro `await`, o que os chamadores atuais (`#process`
  e o tick, que já checam pausa e membro) não produzem.
- Nenhum arquivo catalogado em `scripts/skip-catalog.json` nem
  `scripts/mutation-manifest.json` foi tocado.

## Não executado

Suíte global, PG, Docker, canal ou modelo reais; tipo-checagem completa com
referências construídas; a fatia 2 (tupla paciente/campo/valor/unidade).
