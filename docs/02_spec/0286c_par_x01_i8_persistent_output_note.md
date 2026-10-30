# Nota 0286c — I8 no modo persistente (PAR-X01)

Data: 30/10/2026. Autor: Claude DF, coordenação, que não é autor do X01. Natureza: **disposição técnica de interpretação**, sem mudar o texto aprovado da [SPEC 0286](0286_par_x01_single_subprocess_service.md) nem o recibo `human-decisions-19`. A Codex não exigiu novo gate humano (re-revisão `AUD0625-REVIEW-X01-FIX-CODEX-20261030`, a79a4a415, fato GBrain 25013).

## O ponto

A I8 diz: "Tetos por stream (`maxOutputBytes`) e de stdin (`maxStdinBytes`) são aplicados sobre bytes; excesso encerra o lançamento com `output_limit` e `truncated`. Filas de leitura e escrita têm teto e backpressure."

Na correção do F3 (6fc4da8dc, `REVIEW-FIX-RESULT.md`), a 07 decidiu:

- **oneshot:** o teto é cumulativo sobre a saída retida. O excesso encerra com `output_limit` e `truncated: true`. Sem mudança.
- **persistent:** a saída não é retida, porque é entregue ao consumidor. O teto vale para a **fila** de cada stream: nenhum pedaço passa do teto, e um bloco maior é cortado nele e o resto volta ao stream. Se o consumidor para de ler, o backpressure segura o payload até o `lifetimeMs`, que encerra com `timeout` e `truncated: false`.

## Disposição

A decisão da 07 é a leitura correta da I8 e fica registrada assim:

1. O "excesso" que encerra com `output_limit` é **saída que seria descartada ou retida além do teto**. No oneshot isso é a saída acumulada. No persistent nenhum byte é descartado nem acumulado além do teto da fila, então não há excesso nesse sentido, e `truncated: false` é verdadeiro.
2. A segunda frase da I8 (teto e backpressure nas filas) é o que rege o persistent. Ela vale com teto duro por pedaço e por fila, e o teste da 07 fixa isso.
3. Um consumidor parado é limitado pelo `lifetimeMs` (`timeout`). Ele nunca causa crescimento sem limite nem perda silenciosa.
4. O comentário de tipo que liga `truncated` só ao oneshot deve dizer isso explicitamente. Ajuste de texto para a próxima fatia do X01, sem mudança de comportamento.

## O que pediria decisão nova do Ricardo

Duas mudanças desse comportamento seriam decisão nova, não interpretação:

- um teto **cumulativo** no persistent, que mataria um MCP ou LSP de vida longa na primeira rodada grande de saída;
- um **prazo de leitor parado** menor que o `lifetimeMs`.

Nenhuma das duas está pedida.
