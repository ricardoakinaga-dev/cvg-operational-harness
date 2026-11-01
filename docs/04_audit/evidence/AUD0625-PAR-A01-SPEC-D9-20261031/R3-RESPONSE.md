# R3 — SPEC 0296 (PAR-A01): resposta à conferência da R2 (`5dea5d17a`)

Uma regra (decisão DF, opção (b)) e três P3.

## P2-N3 — recusa transitória em banda (D11)

Antes dos cabeçalhos, uma recusa **transitória** deixa de ser `429`/`503`:

- limite de conexões atingido → `200` + `retry:` (com jitter) + `event: end` com `too_many_streams`;
- fonte indisponível na pré-verificação (ou espera do semáforo acima de 5 s) → `200` + `retry:` + `event: end` com `source_unavailable`;
- nenhum evento de dados em nenhum dos dois casos.

Motivo (medido no Node 22): o `EventSource` nativo só reconecta depois de uma conexão `200` fechada; qualquer outra resposta fecha o objeto para sempre e `Retry-After` não é lido.
Continuam terminais e fora de banda: `401`, `403`, `404`, `409`, `400`, o `204` de fim permanente e o `405` do `HEAD`.
O SDK e o WEB podem usar leitor de `fetch` com reconexão própria; o `EventSource` nativo também funciona.

Onde: A8 (ordem das reservas), tabela de razões de fim (nova linha `too_many_streams`), §6 (três linhas de limite), §7 (duas linhas da matriz), §9 (linha A8/A9), §10 (D11).

Testes: RED-7 passa a exigir a recusa em banda (`200`, `retry:`, `end`, `too_many_streams`, sem `id:`); novo RED-12 com leitor que imita o `EventSource` e listener real: 200 com eventos, reconexão que encontra o limite cheio (`200` + `retry:` + `end` transitório, nenhum dado) e nova reconexão que recebe o restante sem perda nem duplicação.

## P3

1. O laço confere o sinal depois de cada `await` (nenhuma leitura depois do `close`): A13.
2. A chave do `204` é a posição resolvida pelo A7, não o `?after=` da URL: A8/A13 e tabela de razões.
3. O modo `simulation` só existe com `NODE_ENV=test`; o `server.ts` o recusa em produção: A10.
