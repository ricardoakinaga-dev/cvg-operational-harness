# Operação local do consumidor

Estado: procedimento da extração T2, para ambientes sintéticos. O piloto requer
correções, provas e decisão do candidato conforme o [backlog próprio](backlog.md).

## Build e verificação

Na raiz, usando Node22 e dependências do lockfile:

```bash
npm run test:shift-assistant
npm run build:shift-assistant
npm run demo:shift-assistant
```

O build compila shared/model-gateway por exports públicos antes de empacotar o
entrypoint. A demo cria sua própria pasta temporária e simuladores de canal/modelo;
não usa o sandbox persistente. Com NO_MODEL vigente (AUD-0621 F24), a nota clínica
recebe `policy_denied` no gateway público antes de qualquer provider: a demo e o
processo guardam a nota bruta, sem pendências, e nenhum pedido chega ao modelo. Para executar somente este processo: `npm start`
dentro de `products/shift-assistant`, após build e configuração.

## Configuração e dados separados

Use `deploy/.env.example` como referência e mantenha os valores privados fora do
controle de versão. O compose está em `deploy/compose.yaml`; contexto de build é
o monorepo. Cada projeto deve usar seu volume próprio; não apontar para
volumes/processos existentes para testar essa extração.

O contêiner (AUD-0621 F25) roda sobre o runtime distroless com o binário Node fixado,
sem shell nem gerenciador de pacotes, como `10001:10001`, rootfs somente leitura,
`/tmp` em tmpfs `noexec`, sem capabilities e com limites de memória, pids e CPU.
Ele entra só na rede interna `cvg-shift-backend`, com endereço fixo `10.254.177.4`
(sem rota para fora e sem porta
publicada no host): WAHA/Evolution e Whisper precisam ser ligados a essa rede e
os endereços do `.env` usam os nomes deles nela. Para outro arranjo, o filtro do
host é `deploy/egress-policy.example.nft`, aplicado pelo operador do host.
Provas locais da imagem real: `node scripts/image-contract.mjs <imagem>` e
`node scripts/infra-egress-proof.mjs <imagem> <imagem-receptora-com-node>`.

No workspace, uma inspeção local sem subir serviços:

```bash
docker compose -p cvg-shift-synthetic -f deploy/compose.yaml config --no-interpolate
```

Após criar a configuração sintética e conferir os recursos, use o mesmo `-p`
para construir, subir e parar somente esse ambiente. A porta interna é3400;
o sandbox existente3400/3401 não pode ser reiniciado por esta rodada.

Saúde: `/health/live` (processo atende), `/health/ready` (200 somente com journal
gravável, scheduler com rodada recente, fila abaixo do limite e sem entrada parada;
pausa saudável responde 200 com `mode: paused`) e `/health` (contagens, mesmo status
da prontidão). Prazos e limites: `SHIFT_SEND_TIMEOUT_MS`, `SHIFT_MEDIA_TIMEOUT_MS`,
`SHIFT_WHISPER_TIMEOUT_MS`, `SHIFT_MODEL_TIMEOUT_MS`, `SHIFT_JOB_TIMEOUT_MS`,
`SHIFT_SHUTDOWN_TIMEOUT_MS`, `SHIFT_MAX_MEDIA_BYTES` e `SHIFT_MAX_PENDING_MESSAGES`,
aceitos só até os máximos do `.env.example`; tetos de bytes das respostas são fixos.

Journal e mídia em `/data` são documentos do consumidor. Build/move não migram,
apagam ou reutilizam dados. A configuração da extração mantém tick60s; o scheduler
de1–5s com prova de entrega pontual é proposta T3, ainda sem BUILD.

## Interrupção e recuperação

Parada: enviar SIGTERM ao processo/contêiner específico. O stop é limitado por
`SHIFT_SHUTDOWN_TIMEOUT_MS`; se o prazo vencer com trabalho em curso, a saída é
não-zero. A pausa do gestor é gravada na hora, fora da fila de conteúdo, e aborta
o trabalho em andamento, que fica guardado para depois da retomada.

Rascunho não ativa pendência nem lembrete: o autor confirma com `ok` (ou
`ok nota <código>` quando há mais de um rascunho). Falha transitória de download,
Whisper ou organização fica em espera durável (30 s, 2 min, 10 min, 30 min; cinco
tentativas por mensagem, somando os estágios, e um único aviso ao autor); esgotada,
vira nota bruta sem pendências ou revisão humana. Lembrete
é reservado no journal antes do envio; envio de resultado desconhecido (timeout,
5xx, queda do processo) não é repetido: `adiar N X` abre nova janela. Envio
recusado antes de sair do processo (`not_sent`) tem cinco tentativas nos mesmos
atrasos e é final na hora para egress negado ou texto acima do teto
(`reminder_send_failed`, atenção na saúde); `adiar` abre janela com orçamento
novo. Na atualização, um volume antigo com lembrete preso nesse laço passa a
`reminder_send_failed` (contagem dos eventos antigos) e só volta com `adiar`.

Conservar journal/mídia originais e inventário hash-bound antes de diagnóstico.
Última linha sem quebra de linha não é commit: na abertura, a cópia verificada do
original e a cauda isolada ficam em `recovery/<id>/`, o segmento é selado sem
truncar e o journal continua no sucessor listado em `journal.json`. Linha no meio
que não é JSON, evento desconhecido ou prefixo divergente impedem a abertura para
recuperação humana; a validação campo a campo de cada evento é do formato V2.
Um binário anterior ao AUD-0621 não entende linhas `transaction` nem sucessores:
não use rollback de binário sobre um volume já aberto por esta versão. Backup
com inventário e hash, restore com comparação sob hold e sandbox, monitor externo
com fila durável e recibo: [operations.md](operations.md) (PISO-008, prova local
sintética). Migração V2, outbox durável e lock de escritor único continuam
especificados em0179 e pendentes.

## Aceites distintos

Build/imagem/demo comprovam o artefato estrutural. A imagem sem shell e o egress
pela rede interna têm prova local sintética (AUD-0621 F25); o filtro do host de
produção e a imagem construída no ambiente real continuam pendentes do operador.
PISO008 tem restore/alerta executados localmente com processos separados
([operations.md](operations.md)); monitor em outra máquina e receptor real ficam
para o ambiente de operação.
PISO009 exige guia validado e áudios; PISO010 exige candidato aprovado e duas semanas
de acompanhamento. Esses resultados não são herdados da certificação do harness.
