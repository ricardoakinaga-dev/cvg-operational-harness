# Nota 0293b — marcador determinístico no prefixo da compactação (refinamento da I12)

30/10/2026. Nota técnica da [SPEC 0293](0293_tool_output_spill_and_prune.md) R2, `claude/aud0625-par-c03-build-d9`; evidência em
[SLICE4-RESULT](../04_audit/evidence/AUD0625-PAR-C03-D9-20261030/SLICE4-RESULT.md). Aceita pelo DF como nota técnica, sem T3 novo (coerente com a I13 e a D6 aprovadas). Sem push; produção `NO_GO`.

## O que muda em relação à I12

A I12 pede um marcador por bloco, gerado por CSPRNG depois que o conteúdo existe. Isso continua valendo **na chegada** de um resultado de ferramenta: a forma é decidida uma vez e guardada em
`Observation.rendering`, então um marcador aleatório não move nada.

No **prefixo que a compactação envia ao resumidor** a mensagem `tool` ainda não tem forma guardada; ela é renderizada a cada passagem. Um marcador aleatório mudaria o texto, e com ele o `sourceDigest`
da C01 (calculado sobre o texto enviado), a cada passagem sobre o mesmo histórico (I13). Por isso, só ali, o marcador é uma função pura:

`marcador = primeiros 16 hex de sha256( tenant ‖ NUL ‖ sessão ‖ NUL ‖ sha256(conteúdo) ‖ NUL ‖ contador )`

com `contador` começando em 0 e avançando enquanto o conteúdo contiver o marcador candidato (`deterministicBlockMarker`, `harness/src/spill/render.ts`).

## Por que continua não forjável

Um conteúdo só poderia trazer o marcador de antemão se contivesse o hash de si mesmo, que é um ponto fixo inviável de construir; e, se por acaso o contiver, o contador avança. O bloco declara os bytes da
prévia e usa delimitadores com o marcador, então um delimitador ou cabeçalho imitado dentro do conteúdo não fecha nem altera o bloco (I12 inalterada nesse ponto). O escopo (tenant, sessão) impede que o mesmo
conteúdo gere o mesmo bloco em sessões diferentes.

## Onde vale

Somente `pruneToolMessages` (poda do prefixo, fatia 4), junto de `hideExpiry` (sem validade no bloco) e do `put` idempotente com `operationKey = compaction:<sha256 do conteúdo>`. A renderização na chegada
(`prepareToolOutput` sem `marker` injetado) segue com `newBlockMarker` (CSPRNG).
