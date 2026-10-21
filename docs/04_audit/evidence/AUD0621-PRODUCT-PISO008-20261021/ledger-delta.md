# AUD0621-PRODUCT-PISO008-20261021 — texto proposto para os ledgers

Proposta da frente para o Lead (task-mãe `AUD0621-REMEDIATION-20261020`, sessão
CONT-20261018-D9EF). Esta frente não edita `docs/99_runtime_state.md`,
`docs/20_master_execution_log.md`, `docs/30_backlog_master.md` nem
`products/shift-assistant/docs/backlog.md`. Commits, caminhos e hashes:
`promotion.json` desta pasta.

**Estado: crítico R1 REJECT → reparo → R2 REJECT (3 obrigatórios na sandbox)
→ rodada autorizada pelo Lead → R3 restrito APPROVE sem obrigatórios.
Candidata pronta para integração pelo Lead; nada promovido.**

## docs/99_runtime_state.md

- `AUD0621-PRODUCT-PISO008-20261021` (SPEC0179 aprovada em 03/10 para BUILD local
  sintético): candidata detached `/mnt/dados/cvg-work/cvg-aud0621-piso008-20261021`
  sobre `525d3e6f`, HEAD `5cb5d303c` (4 commits). F25 (P1) fechado
  **localmente** na parte do produto:
  - imagem reconstruída da candidata, com contrato PASS, egress PASS e
    `docker stop` em 322 ms com exit 0; controles FAIL como esperado;
  - stop do próprio produto com processo real: SIGTERM em até 10 s, exit 0 e
    pendências preservadas; processo congelado contido pelo SIGKILL do
    supervisor aos 15 s;
  - PISO-008 sobre o journal V1: backup com inventário SHA-256 e
    `backup_verified`; restore com rejeições e comparação sob hold; sandbox de
    transporte (escolha por identidade, oráculo testado, nunca dentro da origem
    ou do restaurado); monitor externo com fila durável e receptor com recibo
    (processos separados, 38/38).
  - NÃO FECHADO no ambiente real: nft no host com contadores, build pela receita
    completa no CI (`npm ci` com registry), monitor em outra máquina, receptor
    real com responsável, lock de escritor único/journal V2 e outbox com recibo
    do provider.
  - NO_MODEL vigente; D2 não concedida; nada promovido nem publicado.

## docs/20_master_execution_log.md

- 21/10/2026 — AUD0621-PRODUCT-PISO008.
  - First red: os testes falharam na base `525d3e6f` pelo motivo certo (180
    tentativas `not_sent` em 180 ticks, Whisper público aceito, organizador sem
    guarda, `inbox_stalled` ausente aos 250 s, módulos PISO-008 ausentes). Os
    vermelhos de cada reparo também falharam pelo motivo certo: R1 com 10
    testes, correção da sandbox com 1 e reparo R2 com 11 de 12.
  - Barra do produto: 12 arquivos/132 testes verdes (eram 9/86). Prettier, lint
    e typecheck da raiz verdes.
  - Mutantes: 37 de 40 mortos na rodada principal (M29 equivalente) e 10 de 10
    no reparo R2, inclusive M36, M36b e M40; M42 morto 5 de 5.
  - Prova de alerta com processos separados: PASS, 38 verificações e 14 recibos
    iguais aos alertas entregues.
  - Backup e restore do volume sintético e do volume real da prova: PASS.
  - Controles: 14 de restore/backup e 7 de posição da sandbox, todos com exit
    1; raiz symlink recusada.
  - Imagem `cvg-aud0621-piso008-shift-assistant:local` (removida no fim):
    contrato PASS, com o programa igual ao bundle `2f51cc22…`; egress PASS.
  - Críticos: R1 REJECT → R2 REJECT → rodada autorizada → R3 APPROVE.
  - Sem push, PR, deploy, dado real, canal, provider ou Whisper real.

## docs/30_backlog_master.md

- Linha de continuidade AUD0621: F25 com prova local completa da parte do
  produto (imagem, egress, stop, backup, restore, alerta) entregue em candidata
  para integração pelo Lead; pendências do ambiente real seguem em
  PISO-007/PISO-008, sem cartão novo.

## products/shift-assistant/docs/backlog.md (cartões donos)

- **PISO-007** (texto proposto):
  - A imagem foi reconstruída da candidata integrada. O estágio de build usou
    `--build-context`, porque `npm ci` precisa do registry. A base
    `node:22.23.2-bookworm-slim` aparece listada mas não pode ser inspecionada
    no cache, então o receptor e o controle usaram `node:22.23.2-trixie-slim`,
    sem pull.
  - `image-contract.mjs` deu PASS, com o SHA do programa igual ao do bundle.
  - `infra-egress-proof.mjs` deu PASS, com `docker stop` limitado e exit 0;
    controles FAIL como esperado.
  - Os scripts aceitam `--name-prefix` e `--label`.
  - Continua aberto: nft e contadores no host de produção, build pela receita
    completa no CI e SBOM do artefato (Lead).
- **PISO-008** (texto proposto): prova local feita sobre o journal V1, com
  crítico APPROVE.
  - Backup:
    - exige `--writer-stopped`;
    - exige `--stopped-url` ou dispensa registrada;
    - confere o segundo hash da origem;
    - recusa `--out` dentro do volume e raiz symlink;
    - grava inventário com caminho relativo, bytes e SHA-256;
    - só emite `backup_verified` depois de verificar cada hash;
    - nada é removido.
  - Restore:
    - recusa recibo, inventário ou projeção com hash divergente;
    - recusa caminho absoluto ou `..`, symlink, conjunto diferente e hash
      divergente, tudo antes de escrever;
    - exige destino novo, vazio e fora da origem;
    - compara a projeção sob hold.
  - Sandbox:
    - retoma cópia pausada pelo gestor;
    - confirma rascunho por identidade;
    - cria rascunho sintético quando falta;
    - usa oráculo de lembrete testado;
    - nunca roda dentro da origem ou do restaurado.
  - Monitor externo (`src/monitor.ts`, `scripts/shift-monitor.mjs`,
    `deploy/monitor.example.yaml`):
    - sonda a cada 10 s com timeout de 2 s;
    - duas falhas para disparar e duas boas da mesma origem para resolver;
    - readiness só vale dentro do contrato;
    - um alertId por episódio;
    - fila durável com cinco tentativas e falha visível, sem recibo falso.
  - Receptor local exclusivo e `docs/operations.md`.
  - Continua aberto:
    - monitor em outra máquina;
    - receptor real e responsável;
    - parada física do host;
    - lock de escritor único e journal V2 (PISO-004);
    - outbox com recibo do provider (PISO-003).
  - Residuais do R3, opcionais:
    - recusar `..` cru no caminho de sandbox/destino/`--out` ou conferir o
      realpath depois do `mkdir`;
    - teste para a ligação do oráculo na sandbox (mutante W1);
    - escolha por identidade testada com UUID aleatório (M42 morre em ~11 de
      12 rodadas);
    - raiz symlink com barra final.
  - Residuais anteriores:
    - envio dentro do ciclo de sondagem;
    - reenvio por minuto de avisos contínuos;
    - limite de atualização por episódio.
- **PISO-005/PISO-006** (nota):
  - Lembrete `not_sent` tem orçamento de cinco tentativas nos atrasos da §6;
    é final na hora para egress negado ou texto acima do teto, e `adiar`
    reabre.
  - `inbox_stalled` dispara aos 240 s para mensagem nova; há testes de
    `inbox_stalled` e de `job_deadline_exceeded`.
  - `WHISPER_URL` só aceita loopback, endereço privado ou nome interno, sem
    nomes de metadata.
  - O organizador injetado só pode ser o sintético e só sob o runner de
    testes.
  - O orçamento da entrada continua por mensagem, somando os estágios (mais
    estrito que a §6).
- D2: inalterada.
