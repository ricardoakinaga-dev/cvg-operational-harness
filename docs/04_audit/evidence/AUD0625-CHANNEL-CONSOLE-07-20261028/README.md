# AUD0625-CHANNEL-CONSOLE-07-20261028

Base: origin/main 61e5cf8f. Worktree `/mnt/dados/cvg-work/aud0625-channel-console-07`, branch `claude/aud0625-channel-console-07`.

| Arquivo | Comando | Resultado |
|---|---|---|
| f17-red.txt | `npx vitest run apps/web/src/__tests__/console-conversation-pagination.test.tsx` sem a correção | exit 1; 2 falhas, 1 controle passa |
| f17-green-web.txt | `npx vitest run apps/web` | exit 0; 30 arquivos, 102 testes |
| f12-channel-gateway.txt | `npx vitest run packages/channel-gateway` | exit 1 nesta rodada: 1 falha em `channel-effect-journal-edges.test.ts` (temporização, arquivo não tocado); 176 ok + 8 expected fail. Reexecução 3x: 177 ok + 8 expected fail, exit 0 |
| typecheck.txt | `npm run typecheck` | exit 0 |
| lint.txt | `npm run lint` | exit 0 |

F12: os 8 `it.fails` (500/502/503/504 × Evolution/Chatwoot) passam hoje porque o defeito existe; controles (conexão caída, 200, 400, 429) verdes. Sem correção do F12 até a aprovação T3 da SPEC 0268.
Não rodados (proibidos): certify, test:e2e, test:postgres, Docker.
