# PAR-A01 BUILD fatia 2 — o tail sobre PostgreSQL (SPEC 0296 A1, A2, A4, A6, A8, A9)

Teste `packages/persistence/src/__tests__/aud0625-par-a01-tail-postgres.test.ts` (8 testes, banco descartável próprio, papel sem bypass; `SKIP-PG-A01-001`). Sem código de produção novo: o núcleo da fatia 1 roda sobre `PostgresSessionEventStore`, criado por requisição com o tenant da identidade.

- **A1:** um evento de transação cujo `COMMIT` está retido não existe para o tail; liberado o `COMMIT`, aparece uma vez.
- **A2, com um achado que corrige a SPEC:** o escritor S01 e o store 0028 são **mutuamente exclusivos** numa sessão (guarda da 0034): com o escritor aberto, dez `append` do store legado são todos recusados; sem escritor, trinta `append` concorrentes do legado deixam o log denso; um escritor novo retoma no cursor que o legado deixou. Um leitor que lê continuamente durante as três fases nunca vê posição com sequência diferente (nenhum `n+1` sem `n`) e o log final é `1..N` sem lacuna. A SPEC dizia "os dois escritores concorrentes na mesma sessão"; o que existe é exclusão mútua entre eles, e a prova é essa.
- Leitura em páginas de dez, commit tardio visto na leitura seguinte, fim por `max_events`; reconexão no último `id:` sem perda nem repetição; duas tenants com o mesmo `sessionId` nunca se veem (cada uma com seu store por requisição) e um store preso a um tenant recusa o fluxo do outro; `verifyTailCursor` dá `ok`, `cursor_ahead`, `not_found` (outro tenant e sessão inexistente idênticos).
- **A8/A9:** dez tails sobre um pool próprio de 8 e um semáforo de 3 permissões nunca seguram mais de 3 conexões ao mesmo tempo; o semáforo termina em zero. Um tail abortado devolve a conexão e não lê mais.
- Mutantes no nível PG (reaplicados do núcleo): sem esperar a chamada para devolver a permissão (T12) e leitura sem o tamanho de página (T17) morrem; a remoção da validação do evento (T4) sobrevive aqui porque o store já valida, e morre nos testes do núcleo (fatia 1).

Gates: typecheck, eslint, prettier, links, `skip:governance`. Produção NO_GO; dados sintéticos; o container `claude-d9-a01-pg` é só desta tarefa e é removido ao fim da BUILD.
