# 0269 — SPEC: console — paginação de conversas e abertura de caso além da 1ª página (AUD0625 F17)

Status: `T2`, implementada. Não altera contrato público da API nem CSS; usa os parâmetros `limit`/`offset` e `pageInfo` que `GET /v1/conversations` já oferece. Complementa a SPEC 0250 §3.6 (listas limitadas).

## Recon

- `apps/web/src/App.tsx` (efeito de identidade): `listConversations(identity, { limit: 25, offset: 0 })` carregava só a 1ª página e descartava `pageInfo`.
- A fila de aprovações oferece "Abrir caso" apenas para `openSessionId` presente em `conversations.data` (`openableSessionIds`); casos além das 25 primeiras conversas ficavam inalcançáveis.
- `api/client.ts` `listConversations` e `ConversationPageView.pageInfo { limit, offset, total, hasNextPage }` já existem.

## Regras

1. O painel de conversas guarda o `pageInfo` e, havendo `hasNextPage`, mostra "N de total" e o botão "Carregar mais conversas"; a página seguinte é **anexada** (sem duplicar ids) com `offset + limit`.
2. "Abrir caso" fica disponível para qualquer aprovação com sessão quando há conversas não carregadas; ao clicar, o console avança páginas até achar a conversa cuja `openSessionId` coincide e a seleciona; se esgotar sem achar, mostra "Caso não encontrado entre as conversas.".
3. Resposta de página que chega depois de troca de identidade/escopo é descartada (`isCurrentViewScope`); falha de rede interrompe a busca sem alterar a lista.
4. Sem nova rota nem parâmetro de busca no servidor. Se for exigida busca por texto/ID de caso no servidor, vira SPEC T3 própria.
5. Classes CSS existentes apenas (`actions`); `apps/web/src/styles.css` não é tocado.

## Critério de pronto

- `apps/web/src/__tests__/console-conversation-pagination.test.tsx` (60 conversas): carregar mais anexa páginas até o fim e remove o botão; "Abrir caso" de `sess_55` pagina até `offset=50` e abre a timeline de `conv_55`; sem botão quando tudo cabe em uma página.
- RED sem a correção (2 falhas) e GREEN com ela; `npx vitest run apps/web`, `npm run typecheck`, `npm run lint` verdes.

## Limites

Busca no servidor por caso e virtualização de listas muito grandes ficam fora; a abertura de caso pode fazer várias requisições sequenciais (uma por página de 25) em bases grandes.
