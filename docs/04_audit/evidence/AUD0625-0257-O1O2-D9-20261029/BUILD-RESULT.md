# AUD0625-0257-O1O2-D9 — observações O1 e O2 da SPEC 0257 no console (T2)

Branch `claude/aud0625-0257-o1o2-d9` sobre `claude/aud0625-wave3` @ `f38bfafc4`, local, sem push. T2 (só o console), sintético, Node 22.23.2. Origem: `AUD0625-REVIEW-0257-S1-D9-20261028/CONFIRMATION.md`, observações O1 e O2.

## O1 — registro falha depois de um 2xx

Decisão: **aviso ao operador, mantendo a chave** (não gerar chave nova). O servidor já aceitou a solicitação; a operação segue `pending` com a mesma chave, então o próximo clique reenvia o mesmo pedido e o servidor devolve a mesma aprovação (replay), sem duplicar. Uma chave nova criaria uma segunda solicitação de export que o operador pode não querer, e quando o `sessionStorage` está quebrado a próxima gravação falharia de qualquer jeito (o console já bloqueia o envio com mensagem de recuperação). Mudança em `App.tsx`: quando `resolveLogicalOperation` lança, a mensagem de sucesso ganha "Aviso: o registro nao foi guardado neste navegador; um novo clique reenvia a mesma solicitacao, sem criar outra."

## O2 — JSON corrompido no sessionStorage

Decisão: **descartar e regenerar**. `read` (`api/logical-operation.ts`) separa duas falhas: `getItem` que lança continua sendo `LogicalOperationStorageError` (o registro está indisponível); um valor que não é JSON (truncado, estranho) passa a ser "sem registro", e a próxima gravação o sobrescreve com uma chave nova. A chave perdida era irrecuperável. `resolveLogicalOperation` sobre um valor corrompido vira no-op.

## Provas

- Vermelho antes da correção: os 2 testes novos falharam (`export-approval-logical-operation.test.tsx` 11 passam, 2 falham).
- Testes (4 novos): O2 com 4 valores corrompidos (regenera, chave nova, a chamada seguinte reusa a nova, resolver não lança); O2 controle (storage ilegível continua bloqueando); O1 (aviso depois de 2xx com a gravação de resolução falhando, e o clique seguinte reusa a MESMA chave); O1 controle (sem falha, sem aviso). Arquivo 13/13; `apps/web` inteiro 34 arquivos/174 testes.
- Mutações: M1 (JSON inválido volta a lançar) morta; M3 (aviso nunca ligado) morta; M4 (aviso invertido) morta com 5 falhas. M2 (leitura ilegível ignorada em `read`) e M5 (forma errada também lança, capturada) sobrevivem como **equivalentes**: o `write` relê o item e lança do mesmo jeito, e o `catch` interno trata a forma errada como "sem registro".
- Typecheck 0, eslint 0, prettier.
