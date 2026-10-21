# Crítico independente R1 — AUD0621-PRODUCT-PISO008-20261021

Agente general-purpose novo (não-fork), prompt autocontido, somente leitura, sobre
o commit `a0e601994` da candidata `/mnt/dados/cvg-work/cvg-aud0621-piso008-20261021`
(base `525d3e6fd`). Rodou a suíte do produto (11 arquivos/111 testes verdes,
Node 22.23.2), os scripts em pastas próprias e quatro sondas próprias
(`probe-monitor.mts`, `probe-restore.mts`, `probe-backup-inside.mts`,
`probe-paused.mts`, fora do repositório). A candidata não foi alterada.

**VEREDITO: REJECT** — 5 obrigatórios.

## Obrigatórios e reparo (commit `8a4d1d239`, mais `321a1369c`)

| # | Achado da R1 | Reparo | Prova |
| - | ------------ | ------ | ----- |
| 1 | Sandbox falhava em todo backup feito pelo runbook: volume salvo em pausa ficava pausado na cópia (ajuda 0/3, confirmação 0/1, FAIL). | Cópia pausada é retomada pela lane gerencial (`retomar assistente` do gestor sintético); sem gestor, FAIL; `resumedInSandbox` no relatório. | Teste "resumes a volume backed up while paused…" (vermelho em `a0e601994`); mutante M34 morto. |
| 2 | Monitor emitia `live_timeout resolved` sem nenhuma sonda boa quando live trocava de código (timeout → unreachable). | Motivo de origem `live` só conta sonda boa com live 200 (`liveOk`). | Teste "resolves a live episode only after live answers 200…" (vermelho); M30 morto. |
| 3 | Restore aceitava destino dentro do volume de origem (inclusive via ancestral symlink) e gravava lá; backup aceitava `--out` dentro do volume e copiava antes de falhar. | Restore compara o hash do realpath de cada ancestral do destino com `sourceRealpathSha256`; backup recusa `outDir` dentro do volume antes de qualquer escrita (`BackupUsageError`, CLI exit 2). | Testes "refuses a restore target inside the source…" e "refuses an output directory inside the volume…" (vermelhos); M31 e M32 mortos; controles CLI `target-inside-source`, `…-via-symlink`, `backup-out-inside-volume`. |
| 4 | Sandbox dava PASS sem exercitar confirmação ("no draft in the volume") nem lembrete ("0 sent, 0 eligible"). | Sem rascunho restaurado, a sandbox cria e confirma um rascunho sintético na cópia (organizador em processo só para o texto da sandbox; notas restauradas seguem `policy_denied`); se nada restaurado vence no tick, confirma um rascunho sintético que vence em 1 min; os checks exigem exercício. | Testes "creates and confirms a synthetic draft…", "still exercises a reminder when the restored draft is due later…" (vermelho em `8a4d1d239`, falso FAIL encontrado no reparo) e "fails instead of passing empty…"; M35 e M39 mortos. |
| 5 | Docs afirmavam que a URL era exigida; sem `--stopped-url` saía `backup_verified` com `not_checked`; varredura de /proc tratada como prova. | `--stopped-url` obrigatório ou dispensa explícita `--no-stopped-url-check` registrada como `waived_by_operator`; sem nenhum, `stopped_url_required`; /proc descrito como indício fraco em código e docs. | Teste "requires the stopped URL check or a recorded operator waiver" (vermelho); M33 morto; controle CLI `backup-without-stopped-url-or-waiver` (exit 2). |

## Opcionais da R1

- Aplicados: nomes de metadata (`metadata`, `metadata.google.internal`,
  `instance-data…`) recusados no `WHISPER_URL` e docstring corrigida (nome de
  rótulo único pode resolver por search domain; a rede interna é a contenção);
  readiness 200 com corpo ilegível vira `ready_invalid`; notas sobre a marca
  forjável do organizador sintético (a guarda real é `NODE_ENV=test`), limite de
  atualização por episódio, upgrade de volume com lembrete preso no laço
  `not_sent` (`operacao-local.md`).
- Registrados sem mudança: envio de alertas dentro do ciclo de sondagem (receptor
  lento atrasa a próxima sonda); oscilação 2 ruins/2 boas abre episódios novos
  (limite de 1/min vale por episódio); avisos contínuos (`paused`,
  `reminder_uncertain`) reenviam uma vez por minuto; first red do arquivo
  PISO-008 é "módulo não existe" (a força vem dos mutantes e dos vermelhos do
  reparo).

## Conferido sem achado pela R1

Inventário/receipt/projeção sem telefone ou texto; `backup_verified` só após
verificar cada hash; restore rejeita absoluto, `..`, symlink, hash divergente,
arquivo extra/faltante antes de escrever; hold não grava; evento com exatamente
os 9 campos; fila 30 s/2/10/30 min sobrevivendo a reinício; receptor com token,
fsync e receiptId; stop real < 10 s com exit 0; resíduos WHISPER_URL,
organizador, orçamento `not_sent` e `inbox_stalled` 240 s com testes; dependência
de V2/lock/outbox registrada; seção "Só no ambiente real" honesta.
