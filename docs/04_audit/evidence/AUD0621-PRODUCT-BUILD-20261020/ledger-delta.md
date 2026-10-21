# AUD0621-PRODUCT-BUILD-20261020 — texto proposto para os ledgers

Proposta da frente para o Lead (task-mãe `AUD0621-REMEDIATION-20261020`). Esta
frente não edita `docs/99_runtime_state.md`, `docs/20_master_execution_log.md`,
`docs/30_backlog_master.md` nem `products/shift-assistant/docs/backlog.md`.
Commit e números finais: ver `promotion.json` desta pasta.

## docs/99_runtime_state.md

- `AUD0621-PRODUCT-BUILD-20261020` (SPEC0179/0180 aprovadas em 03/10, BUILD local
  sintético): candidata detached `/mnt/dados/cvg-work/cvg-aud0621-product-20261020`
  sobre `6c9fc651`, commit em `promotion.json`. F07, F08, F09, F10, F11, F18,
  F21 (parte do produto) e F24 corrigidos com first red, mutantes e testes do
  produto verdes em Node 22; F25 com prova local da imagem real (sem shell,
  10001, rootfs só leitura) e da rede interna (destinos não autorizados sem rota,
  receptor proibido com zero requisições). NÃO FECHADO: firewall do host de
  produção, imagem pela receita completa no ambiente real/CI e o restante da
  SPEC0179 listado abaixo. NO_MODEL vigente; D2 não concedida; nada promovido.

## docs/20_master_execution_log.md

- 20/10/2026 — AUD0621-PRODUCT-BUILD: first red 39/42 testes novos falhando na
  base; correção em `products/shift-assistant/**`; barra do produto (Shift
  assistant bar) local verde, 9 arquivos/86 testes, denominador PASS; lint e
  typecheck da raiz verdes; 28 de 31 mutantes mortos (3 equivalentes
  documentados); imagem `distroless/cc` + Node fixado com contrato PASS (sha do
  programa igual ao bundle) e controle da receita antiga FAIL; prova de egress
  na rede interna PASS e autoteste em rede comum FAIL (esperado); crítico
  independente R1 REJECT (3 obrigatórios) → reparo único → R2 APPROVE sem
  obrigatórios. Sem push, PR, deploy, dado real, provider ou canal real.

## docs/30_backlog_master.md

- Linha de continuidade AUD0621: F07–F11, F18, F21 (produto), F24 e F25
  entregues em candidata para integração pelo Lead; pendências reais seguem nos
  cartões PISO abaixo, sem cartão novo.

## products/shift-assistant/docs/backlog.md (cartões donos)

- PISO-001: rascunho nunca abre tarefa nem lembrete; `ok` confirma só rascunho do
  próprio autor, em uma linha do journal que ativa as pendências; mais de um
  rascunho exige `ok nota <código>`; `ok` simples recusado enquanto outra nota do
  autor está pendente; correção exige nova confirmação; journal legado projeta
  tarefa aberta de nota não confirmada como rascunho (AUD-0621 F08). Continua
  aberto: precondição de preview aceito pelo canal (outbox/recibo), token de
  revisão com hash, `legacy_review_required` de notas legadas confirmadas.
- PISO-002: pendência com homônimos não recebe ID pela ordem da lista; ambiguidade
  bloqueia a confirmação; memória de pacientes só de notas confirmadas e sem ID
  sinalizado; leito divergente não completa ID só pelo nome (AUD-0621 F09).
  Continua aberto: evidência por campo/citação (SourceEvidence), que depende de
  organização por modelo (NO_MODEL/D2).
- PISO-003: falha transitória de download, Whisper ou organização deixa a
  mensagem pendente com tentativa e próximo horário persistidos (30 s, 2 min,
  10 min, 30 min), sobrevive a restart e termina em nota bruta sem pendências ou
  revisão humana; duplicata não tira elegibilidade; falha de gravação não
  envenena a fila; membro revogado vira revisão (AUD-0621 F07/F10). Desvio
  deliberado da SPEC0179 §6 ("cinco tentativas por estágio"): o orçamento é de
  cinco tentativas por mensagem, somando os estágios, com um único aviso ao
  autor, porque o contador por estágio permitia laço sem fim quando a falha
  alternava de estágio (crítico R1); é mais restrito que a SPEC e deve ser
  registrado na próxima revisão dela. Continua aberto: outbox durável de respostas e recibos,
  persistência da transcrição antes da organização, envelope inline do Evolution.
- PISO-004: última linha sem LF é isolada com cópia verificada do original e da
  cauda, segmento selado sem truncar e sucessor em `journal.json`; linha inválida
  no meio, evento desconhecido ou prefixo divergente falham fechado; commits com
  fsync e várias mudanças numa linha `transaction` (AUD-0621 F18). Continua
  aberto: formato V2 com seq/hash, lock de escritor único, protocolo de mídia com
  sidecar, migração e upgrade.
- PISO-005: um tick por vez, agendamento sem sobreposição, reserva durável antes
  do envio, revalidação de pausa/desligamento/journal/tarefa/nota/destinatário sem
  yield antes de cada envio, envio incerto (timeout, 5xx, queda) bloqueia a janela
  até `adiar`/`feito` (AUD-0621 F10/F11). Continua aberto: recibo de entrega e
  AP-011, ferramenta humana de resolução de incerteza, tick 1–5 s.
- PISO-006: leituras com teto por chunk e prazo até o fim do corpo em WhatsApp e
  Whisper, base64 do Evolution validado antes de decodificar, prazo de job que
  libera a fila, fila limitada com 503 `queue_full` e reserva de controle, pausa
  do gestor fora da fila (aborta o trabalho em curso), `/health/live`,
  `/health/ready` e `/health` com 503 por journal, scheduler, fila e entrada
  parada, stop limitado com saída não-zero (AUD-0621 F21 produto). Continua
  aberto: limites do transporte de modelo e dos adapters de canal compartilhados
  (frente AUD0621-RUNTIME-0248/HISO-011) e oracle de cancelamento de modelo, sem
  aplicação enquanto NO_MODEL valer.
- PISO-007: runtime `gcr.io/distroless/cc-debian12` fixado + binário Node
  22.23.2, sem shell/gerenciador/setuid/node_modules, usuário 10001, rootfs só
  leitura, `/data` 0700; compose com limites e rede interna `cvg-shift-backend`
  sem porta publicada; exemplo nft de forward default-deny IPv4/IPv6; scripts
  `image-contract.mjs` e `infra-egress-proof.mjs` com prova local PASS e
  controles FAIL esperados (AUD-0621 F25). Continua aberto: aplicação e
  contadores do filtro no host de produção, build pela receita completa no
  ambiente real/CI, SBOM do artefato (Lead).
- PISO-008: sem mudança; backup/restore/alerta próprios continuam pendentes.
- D2: inalterada. Organização clínica por modelo continua fora; o organizador
  passa pelo gateway público com classe CLINICAL fixa e recebe `policy_denied`
  antes de qualquer provider (AUD-0621 F24).

## Residuais registrados pelo crítico R2 (não aplicados após a aprovação)

- `assistant.ts`: comentário acima de `RETRY_DELAYS_MS` ainda fala em falha "de
  um estágio"; estágio `'reply'` sem uso.
- Folga do `inbox_stalled`: soma o intervalo do scheduler também para mensagens
  novas (tick 60 s → alarme após 300 s; SPEC 8.3 pede >240 s). Ajuste sugerido:
  somar o intervalo só quando a elegibilidade vem de `nextAttemptAt`.
- Testes ausentes: `inbox_stalled`, `job_deadline_exceeded`, preservação do
  contador de tentativas após restart, reuso do sucessor vazio em `#isolateTail`.
- `WHISPER_URL` não restrito a destino local no código (só a rede interna
  impede); 4xx de download (inclusive 408/429) tratado como permanente; timeout
  de corpo do webhook vira ECONNRESET; crash-loop em `#isolateTail` copia o
  segmento a cada tentativa; `ok` simples logo após a nota pode confirmar
  rascunho ainda não visto (PISO-001, recibo de preview).
- Exemplo nft: regra `:3400` aceita qualquer membro da bridge; drop de IPv6 para
  todos os membros (compose sem IPv6).
