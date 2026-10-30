# Revisão independente da 0281 e da 0282 — Claude DF, 29/10/2026

Autoria dos dois BUILDs: Claude D9. Revisor não autor. É revisão, não aceite. Produção `NO_GO`.

## SPEC 0281 (F03c), BUILD `076c160f4`

**APPROVE**, sem achados.

- A mudança é uma linha em `readUpload` (`packages/channel-gateway/src/exam-egress.ts`). Depois de `isFile()` e antes do limite de tamanho, `nlink > 1` lança. O `catch` existente devolve o `FAILED` atual antes do hash, do journal e da rede.
- Testes, com Node 22, numa cópia detached: `aud0625-f03c-exam-hardlink` e `aud0625-f03c-exam-hardlink-order` dão 10/10. A mutação própria `nlink > 2` morre. As 5 mutações da autora estão em `proofs/mutations.txt`. O teste de ordem prova que a recusa vem antes de qualquer byte lido e que segue o descritor aberto, não o nome.
- Limite registrado pela autora, que vale também para a 0278: um escritor concorrente que remove o nome do workspace entre o `open` e o `fstat` deixa o inode aberto com `nlink` 1 e passa na conferência. A regra fecha o hardlink já existente; contra o escritor concorrente, a defesa é o isolamento do PROCESS (F02/X01).

## SPEC 0282 (F12c), BUILD `49bf28e5b`

**APPROVE**, sem achados.

- O teto vem antes do "não antes de", como na SPEC. Com `attempt >= maxAttempts` (padrão 5), o resultado é `FAILED attempts_exhausted`, que responde como replay e não vai à rede. Antes do prazo, `retry_later` responde sem lease, sem rede e sem incrementar o `attempt`. O takeover zera o `notBeforeMs`.
- O `#decideReserve` privado do PG espelha o compartilhado. O `#persist` grava `retry_not_before_ms`.
- A migration `0031_channel_effect_retry_not_before` acrescenta uma coluna `bigint` anulável. É aditiva e forward-only.
- O Retry-After é aceito em segundos ou em data HTTP e cortado em 5 min, tanto no adaptador quanto no gateway. Um valor malformado, negativo ou zero é ignorado e nunca bloqueia.
- Testes, com Node 22, numa cópia detached: `packages/channel-gateway` dá 271/271. A mutação própria `>` no lugar de `>=` no teto morre. A passada PG (journal 16/16, modo PG, inventário e outbox 86/86) é da autora.
