# Backup, restore e monitor externo (PISO-008)

Estado: implementação local sobre o journal V1, com provas sintéticas
(SPEC0179 §10, AUD-0621 F25). Não autoriza piloto, dado real, canal, receptor
ou monitor de produção. O que só se prova no ambiente real está listado no fim.

Todos os comandos rodam na raiz do repositório com Node 22 e as dependências do
lockfile: `node --import tsx products/shift-assistant/scripts/<script>.mjs`.

## Backup consistente

1. O gestor pausa (`pausar assistente`) e espera o envio em curso terminar ou
   ficar incerto; o operador para o processo/contêiner (`docker stop`, que dá
   15 s de graça antes do SIGKILL).
2. Rodar com o processo parado:

   ```bash
   node --import tsx products/shift-assistant/scripts/backup.mjs \
     --data <volume> --out <pasta de backups> --writer-stopped \
     --stopped-url http://<assistente>:3400/health/live
   ```

`--writer-stopped` é a declaração do operador: o journal V1 ainda não tem lock de
escritor único nem UUID/seq (dependência PISO-004, formato V2). Por isso o
script exige `--stopped-url` (a URL do assistente tem de recusar conexão; se
responder, `writer_answering`) ou, sem caminho de rede até o assistente,
`--no-stopped-url-check`, que fica registrado no inventário como
`waived_by_operator`; sem nenhum dos dois o backup falha
(`stopped_url_required`). Ele refaz o hash da origem depois da cópia: qualquer
mudança é `source_changed_during_copy`. A varredura de descritores abertos em
`/proc` é só indício fraco: o journal é aberto e fechado a cada commit, então um
escritor vivo raramente é visto segurando o arquivo. Symlink ou arquivo especial
na origem, journal que não abre e mídia referenciada ausente também falham.
`--out` dentro do volume é recusado antes de qualquer escrita.

Saída: uma pasta nova `<out>/<backupId>/` (0700, arquivos 0600) com `data/`
(cópia), `inventory.json` (caminho relativo, bytes e SHA-256 de cada documento,
classe — manifesto, segmento, recovery, mídia —, resumo de cada segmento com
prefixo commitado e cauda, mídia referenciada, órfãos preservados, verificações
do escritor), `projection.json` (projeção normalizada sem conteúdo: estados,
números, datas, contadores, hash do texto e referências opacas no lugar de
telefones e IDs do provider; são hashes sem chave, que tiram o valor dos
relatórios mas podem ser revertidos por força bruta em espaço pequeno como
telefone, por isso o arquivo fica junto da cópia do journal com as mesmas
permissões) e `receipt.json`. `backup_verified` só sai depois de
conferir cada hash da cópia; falha é `backup_failed` e não autoriza nada. Nada é
removido, nem na origem nem nas cópias (D4). A configuração e seus segredos não
são lidos.

## Restore com comparação sob hold

```bash
node --import tsx products/shift-assistant/scripts/restore-proof.mjs restore \
  --backup <out>/<backupId> --target <volume novo> --sandbox <pasta nova> \
  --members '<SHIFT_MEMBERS sintético>'
```

Antes de escrever qualquer byte: recibo `VERIFIED`, hash do inventário e da
projeção iguais aos do recibo, caminhos relativos sem `/` inicial, `..` ou `.`,
nenhum symlink/arquivo especial, conjunto de arquivos idêntico ao inventário e
cada SHA-256 conferido. O destino tem de ser novo ou vazio e nunca o volume de
origem nem um caminho dentro dele (inclusive por symlink de um ancestral). A cópia é verificada de novo, o volume é reaberto somente leitura (hold:
nada grava, cauda sem quebra de linha fica onde está) e a projeção restaurada tem
de ser igual à do backup — texto (hash), revisão/confirmação/substituição,
vínculos, tarefas (número, prazo, estado, contadores), entrada (estágio e
orçamento), envio incerto, pausa e mídia.

Depois, numa cópia em `--sandbox`, o assistente real roda sem hold com canal,
Whisper e modelo substituídos por stubs em processo (notas restauradas recebem
`policy_denied`, NO_MODEL). Volume salvo em pausa é retomado na cópia pelo
gestor sintético (`retomar assistente`; sem gestor, FAIL). Prova um comando por
membro, a confirmação de um rascunho — restaurado ou, sem nenhum, um rascunho
sintético criado na própria cópia (`draftSource`) — e os lembretes elegíveis dois
minutos depois, uma vez cada, sem reenviar lembrete aceito ou incerto e sem envio
fora da equipe. Verificação não exercida não conta como PASS. O volume restaurado
não é tocado pela sandbox.

`restore-proof.mjs make-fixture --out <pasta nova>` grava o volume sintético dos
testes (rascunho, confirmado, corrigido, concluído, adiado, retry, pausa,
despacho interrompido, cauda isolada e mídia órfã) para ensaiar o procedimento.

Procedimento de recuperação (SPEC0179 §10): pausar ou parar, comprovar processo
parado, copiar originais com hash, escolher prefixo ou backup íntegro, restaurar
em volume novo sob hold, reconciliar fatos posteriores sem envio, validar
projeções e mídia, decisão humana para cada entrega incerta, sandbox, e só então
retomar com a autoridade de operação. Mídia faltando, corrupção no meio, conflito
de manifesto ou entrega sem prova mantêm o hold.

## Monitor externo

O alerta é responsabilidade de um processo fora do assistente — em produção, em
outra máquina (`deploy/monitor.example.yaml`). O próprio assistente não prova que
alguém sabe que ele morreu.

```bash
SHIFT_MONITOR_LIVE_URL=... SHIFT_MONITOR_READY_URL=... \
SHIFT_MONITOR_RECEIVER_URL=... SHIFT_MONITOR_RECEIVER_TOKEN_FILE=... \
SHIFT_MONITOR_STATE_FILE=... SHIFT_MONITOR_CANDIDATE_DIGEST=sha256:... \
SHIFT_MONITOR_INSTANCE_ID=<rótulo opaco> \
node --import tsx products/shift-assistant/scripts/shift-monitor.mjs
```

- Sonda `/health/live` e `/health/ready` a cada 10 s com timeout de 2 s.
- Alerta depois de duas falhas seguidas do mesmo motivo (meta ≤ 30 s até o
  receptor), resolve depois de duas sondas boas da mesma origem (live com 200;
  live falhando com outro código não resolve), um `alertId` por episódio e no
  máximo uma atualização por minuto por episódio. Interpretação registrada: o
  limite vale por episódio; um motivo que oscila abre episódios novos, cada um
  depois de duas falhas, e um aviso contínuo (`paused`, `reminder_uncertain`)
  gera uma atualização por minuto enquanto durar.
- Leitura de prontidão com 200 e corpo ilegível é `ready_invalid`.
- Motivos: `live_timeout`, `live_unreachable`, `live_status`, `ready_timeout`,
  `ready_unreachable`, os códigos de prontidão de `src/health.ts`
  (`storage_unavailable`, `scheduler_stale`, `inbox_stalled`,
  `job_deadline_exceeded`, `backlog_full`, `stopping`; desconhecido vira
  `not_ready`) e os de atenção (`reminder_uncertain`, `reminder_send_failed`,
  `review_required`, aviso). Pausa saudável é `paused` com severidade `info`:
  aviso de estado, não incidente.
- Evento: exatamente `{alertId, product, candidateDigest, instanceOpaqueId,
reasonCode, firstObservedAt, observedAt, severity, state}`; nada de telefone,
  paciente, texto ou URL.
- Fila durável no arquivo de estado (escrita atômica com fsync): cinco tentativas
  em 30 s, 2 min, 10 min e 30 min. Esgotadas, a entrega fica `failed`, sai no log
  `shift.monitor.delivery_failed` e em `shift-monitor.mjs status`; nunca vira
  recibo.

O receptor tem de devolver `{receiptId, payloadSha256}` com o hash exato do corpo
enviado; resposta diferente conta como falha. Para a prova local, o receptor
exclusivo (`alert-receipt-proof.mjs receiver`) escuta só em loopback, exige token
e grava `<receiptId>.json` com payload, hash e `receivedAt`.

## Prova com processos reais

```bash
npm run build:shift-assistant
node --import tsx products/shift-assistant/scripts/alert-receipt-proof.mjs run \
  --work <pasta nova> --bundle products/shift-assistant/dist/shift-assistant.mjs
```

Sobe o assistente (bundle), o monitor e o receptor como processos separados,
com WAHA/Whisper sintéticos e um proxy de saúde em loopback, e induz: scheduler
sem progresso (envios de lembrete pendurados), serviço lento (saúde atrasada
3 s), parada real por SIGTERM com o receptor fora e o monitor morto (fila durável
entre reinícios), processo congelado (SIGSTOP) que só termina pelo SIGKILL do
supervisor depois dos 15 s de graça, e pausa do gestor. Compara cada alerta
entregue com o recibo gravado e verifica motivo, prazo, `alertId` e `resolved`.

## Parada

SIGTERM/SIGINT marcam parada, cortam admissão e timer, abortam os trabalhos e
dão até `SHIFT_SHUTDOWN_TIMEOUT_MS` (10 s) no total; trabalho em curso fica
guardado (mensagem pendente, lembrete interrompido vira incerto e não é
reenviado). Prazo vencido sai com código 1. Todo `await` de trabalho e resposta
está ligado ao sinal de parada, então o prazo só vence com a thread presa
(fsync/E/S travado): esse caso é contido pelo supervisor externo
(`stop_grace_period: 15s` no compose → SIGKILL, status não-zero).

## Só no ambiente real

- Firewall do host aplicado com contadores (`deploy/egress-policy.example.nft`).
- Imagem construída pela receita completa no CI (aqui o estágio `npm ci` precisa
  de rede e foi substituído pelo bundle local).
- Monitor em outra máquina e receptor real com responsável; parada física do host.
- Lock de escritor único, journal V2 (UUID/seq/hash encadeado) e outbox com
  recibo do provider (PISO-003/PISO-004), que este backup ainda não cobre.
