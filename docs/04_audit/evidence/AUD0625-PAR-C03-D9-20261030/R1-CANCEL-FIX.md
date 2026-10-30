# C03 — R1-F01: o cancelamento pendente não sobrevive à conexão do writer

Autor: Claude D9. Relatório Codex `5469a3c69` (revision-r1). Um commit sobre `2686896dd`.

**Causa:** `#cancelBackend` esperava uma segunda conexão do pool e depois cancelava o PID capturado; o writer era devolvido ao pool sem revogar nem juntar essa tarefa, e um cancel atrasado atingia a consulta alheia que herdou o backend (57014).

**Reparo (`spill-store-postgres.ts`):**

- `#startCancel(pid)` devolve um handle `revoke()`. A conexão do cancel que chega, por mais tarde que seja, sempre volta ao pool; se o handle já foi revogado ela volta sem enviar nada.
- `settleCancel()` roda antes de qualquer COMMIT, antes do ROLLBACK e antes de liberar o writer: remove o listener, revoga e junta a tarefa. Sem conexão de cancel ainda (pool saturado, inclusive `max: 1`) o cancel simplesmente desiste; sem deadlock. Cancel já em envio: espera até 2 s (`CANCEL_SETTLE_MS`); se não confirmar, o writer é liberado com erro, o que descarta a conexão em vez de reutilizar o backend.
- O COMMIT enviado continua `SpillCommitUnknown`; nenhum cancel é iniciado nem aguardado depois dele.

**Provas** (`aud0625-par-c03-spill-postgres.test.ts`, 43/43; eram 39):

- o oráculo da Codex com `pg.Pool({max: 2})` real (consulta independente na fila antes do abort): a consulta seguinte termina sem 57014; o arquivo original da Codex também passa 2/2;
- `max: 1`: o abort não trava, o put termina `SpillCancelled` e o pool segue usável;
- cancel que não confirma: o writer é liberado com `Error` (conexão descartada);
- controle: cancel resolvido libera sem erro.

Mutantes X1–X7 (`mutations-r1-cancel.json`): 7/7 mortos (sem revogação, sem checar `revoked` na chegada tardia, prazo ignorado, conexão não descartada, conexão do cancel vazada, falha sem juntar, espera por conexão que pode não vir).

**Limite:** o `settleCancel()` antes do COMMIT, no caminho feliz, não tem teste observável isolado (sem cancel pendente é idêntico; com abort ele já cai no caminho de falha). Fica por inspeção. `SKIP-PG-C03-001` religado com 43 esperados.
