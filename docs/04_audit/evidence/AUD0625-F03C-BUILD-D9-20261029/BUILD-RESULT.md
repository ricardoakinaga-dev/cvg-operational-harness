# AUD0625-F03C-BUILD-D9 — SPEC 0281: o upload de exames recusa arquivo com mais de um hardlink

Branch `claude/aud0625-f03c-d9`, fase 1 `868ff63e6` (base `879b4e034`). SPEC 0281 sha256 `3a2eaa50…`, aprovada pelo Ricardo com D1 = recusa total (`human-decisions-8.json`, sha256 `e752da133ff9c8881b1bce7e2b76882cbf4fe409effd24524a2ecac8da6ddcc8`, copiado byte a byte e conferido). BUILD T3 local e sintético, Node 22.23.2, sem push, produção `NO_GO`.

## Mudança

- `packages/channel-gateway/src/exam-egress.ts`, `readUpload`: depois de `isFile()` e antes de `stat.size`, `if (stat.nlink > 1) throw` (uma linha mais o comentário). O `catch` existente devolve o `FAILED` de sempre, antes do journal e da rede; a união de resultados e a mensagem pública não mudam.
- Testes: os 3 `it.fails` da fase 1 viraram `it` (envio de hardlink para fora, journal intocado, dois nomes dentro) e ficaram os 4 controles (`aud0625-f03c-exam-hardlink.test.ts`, 7/7). Novo `aud0625-f03c-exam-hardlink-order.test.ts` (3/3), que embrulha o `node:fs` real só para contar `readSync` e rodar um gancho logo depois do `openSync`: a recusa vem antes de ler qualquer byte e segue o descritor aberto, não o nome trocado depois (o arquivo tem três nomes; depois de o nome do workspace ser substituído o inode aberto ainda tem 2 links e o nome novo tem 1).

## Provas

- Mutações do §4 da SPEC, todas mortas ([mutations.txt](proofs/mutations.txt)): sem a conferência (U1, 3 falhas), `>= 1` (U2), conferência depois da leitura (U3, só o teste de ordem a mata), conferência por nome com `lstat` em vez do descritor (U4, só o teste do nome trocado a mata) e recusa engolida (U5).
- Regressão: `packages/channel-gateway` inteiro mais `aud0625-f03b-hardlink`: 24 arquivos, 239/239 ([gates.txt](proofs/gates.txt)). `npm run typecheck` 0, eslint 0, prettier e docs:check-links (ver o commit).
- Nota de método: o teste de ordem precisa de `// @vitest-environment node`; no jsdom padrão do repositório o `vi.mock('node:fs')` não intercepta e o contador de `readSync` ficava em 0.

## Limite encontrado (vale também para a 0278)

A SPEC diz (§2, invariante 2) que decidir pelo `fstat` do descritor "não abre janela de troca". Há uma janela do lado oposto: se um escritor concorrente do workspace **remove o nome do workspace entre o `open` e o `fstat`**, o inode aberto passa a ter só o nome de fora (`nlink` 1), a conferência passa e o upload envia o conteúdo de fora. Reproduzido com o gancho pós-`open` ([race-probe-out.txt](proofs/race-probe-out.txt): `status=SUCCEEDED sent=["SYNTHETIC-OUTSIDE-SECRET"]`). Fecha o caso estático (hardlink já existente), que é o da SPEC, mas não vence um escritor que acerte essa janela. O mesmo vale para `readBodyAt` da 0278. A mitigação completa não cabe em `nlink` (por exemplo reconferir o nome depois da leitura ainda pode ser burlado por religação); a defesa real é o isolamento do PROCESS (F02/X01), que impede o payload de ver o arquivo de fora e de agir no workspace durante a chamada. Registrar como observação; não muda o aceite da 0281.
