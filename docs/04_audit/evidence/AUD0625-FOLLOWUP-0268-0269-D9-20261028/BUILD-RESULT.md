# AUD0625-FOLLOWUP-0268-0269-D9-20261028 — correções da revisão 0268/0269

Base: `ba965eab` (ponta da sessão 07, com 0268 e 0269 sobre `8429019b`). Node v22.23.2. Sem push/PR. As SPECs 0268 e 0269 **não foram alteradas**; este arquivo registra o complemento.

## (a) P2 — 2xx com corpo acima do limite (0268, complemento)

- **Comportamento novo:** quando o destino responde 2xx e o corpo passa de `maxResponseBytes`, o adaptador lança `provider_rejected` com `retryable: false` e `effectUnknown: true`. O gateway grava `UNCERTAIN`, devolve `effect_uncertain` e não reenvia. Vale para Evolution e Chatwoot (`packages/channel-gateway/src/adapters/bounded-body.ts`, `oversizedResponseError`).
- **Por que UNCERTAIN e não CONFIRMED:** sem o corpo não há o id do provider para rastrear a entrega. A escolha é do orquestrador.
- **Base na SPEC 0268:** invariante 1 ("nenhum reenvio automático de operação cujo pedido já saiu e cujo efeito não é provadamente ausente"). Um 2xx prova que o pedido saiu e foi aceito, e a leitura cortada do corpo impede a confirmação; era gravado como `FAILED`, o que dizia "não enviado". Status não-2xx continuam como antes: 4xx → `FAILED`, 429 → retentável, 5xx → `UNCERTAIN`.
- **Testes:** novo `aud0625-followup-oversized-2xx.test.ts` (10 casos, nos dois adaptadores: 2xx com corpo grande e com `content-length` grande → `UNCERTAIN`, 1 tentativa, 2ª chamada `effect_uncertain`; controles de 2xx pequeno → `CONFIRMED`, 4xx grande → `FAILED`, 429 grande → 2 tentativas). Três casos de `aud0621-0248-channel-bounds.test.ts` que só conferiam `code` agora afirmam `retryable: false` e `effectUnknown: true`.
- **Falham no código antigo:** [red-on-old-code.txt](red-on-old-code.txt) — 10 falhas (os 4 casos novos de "fica UNCERTAIN" e os 3 casos reforçados, nos dois adaptadores). O código antigo é o `bounded-body.ts` de `ba965eab`.

## (b) 0269 — paginação do console (T2, só `App.tsx` e o teste)

Correções em `apps/web/src/App.tsx`:

- **Já existiam e agora têm teste:** deduplicação dos ids anexados; descarte da página que chega depois de a visão mudar; `pageInfo` zerado na troca de identidade.
- **Novas:** `fetchMoreConversations` distingue `'stale'` (visão mudou) de `'failed'` (rede); "Abrir caso" mostra "Não foi possível carregar mais conversas." na falha, não escreve nada se a visão mudou, e para depois de 20 páginas (`maxCaseSearchPages`) com "Caso não encontrado nas conversas carregadas."; esgotar as páginas mantém "Caso não encontrado entre as conversas.".
- **Testes** (`console-conversation-pagination.test.tsx`, de 3 para 11): ids repetidos entre páginas; resposta atrasada depois de trocar o operador; páginas esgotadas sem achar a sessão; teto de 20 páginas (20 requisições extras); falha na página 2 em "Abrir caso"; falha contida em "Carregar mais"; mensagem ausente quando a visão muda durante "Abrir caso"; `pageInfo` esquecido enquanto o novo operador carrega.
- **Mutações** ([web-mutations-after-fix.txt](web-mutations-after-fix.txt)): 13 no total. **12 morrem.** A que sobrevive é a retirada do guard de carga em andamento do "Carregar mais" (W6): equivalente, porque o botão fica `disabled` enquanto carrega e o clique é ignorado. Antes eram 9 mutações com 6 sobrevivendo.

## (c) Follow-up registrado, sem correção

- **AUD0625-F12c:** o 429 fica retentável (`release` → `PENDING`), mas o gateway não impõe `Retry-After`, espera nem teto de tentativas. Não reabre duplicidade e não é regressão da 0268; cartão para depois.

## Gates (Node 22)

[gates.txt](gates.txt): `npm run typecheck` exit 0; `npm run lint` exit 0; `npx vitest run packages/channel-gateway apps/web`: 50 arquivos, 356 testes passam. O `npm test` completo fica para a integração. Uma execução anterior do pacote `channel-gateway` teve duas falhas de tempo em `channel-effect-journal-edges` (15 s) com a máquina sob carga (load 8–10); repetida, passou 195/195.

## Rodada 2 — achados G1 e G2 da revisão da sessão 07 (`26a4cd55`)

- **G2 (decisão do orquestrador):** um 3xx com corpo acima do limite continua `FAILED` (`provider_rejected`, sem `effectUnknown`), coerente com o 302 de hoje: um redirecionamento não processa o pedido. Nenhum código mudou; o teste novo `aud0625-followup-3xx-oversized.test.ts` (11 casos) fixa isso em `oversizedResponseError` (301, 302, 307, 308) e pelos dois adaptadores até o journal (estado `FAILED`, 1 tentativa, 2ª chamada repete o erro), com controles (400 definitivo, 429 retentável, 503 e 200 incertos). **O mutante C2 ("3xx grande tratado como incerto") antes sobrevivia e agora morre** (8 falhas nos arquivos de corpo grande).
- **G1 (P3, não reproduzido, só registro):** "Abrir caso" não consulta nem marca `isLoadingMoreConversations`; iniciar a busca com um "Carregar mais" em voo faz dois laços partirem do mesmo estado, e a resposta mais lenta pode devolver a lista a um tamanho menor (a próxima página volta a ser buscável, sem perda irrecuperável). Fica como acompanhamento: serializar as buscas ou usar `setConversations(prev => merge(prev, page))`.
