# Handoff — TUI events

`DX100-G01:TUI-EVENT-SURFACES`: `IMPLEMENTED`, aguardando integração e crítico
independente. Nenhum descendente criado. Nenhuma escrita fora de `events/**`.

O [inventário](inventory.json) preserva as 291 variantes/477 campos e 2.279
referências em 1.131 paths Rust pinados. Todas as variantes têm arm nomeado no
dispatcher central; são candidatos estáticos. Os corpos, gates, payloads,
atributos, funções auxiliares e wildcards estão ligados por spans/digests.

O [README](README.md) define as root keys e os IDs de join. O Lead pode ligar
`AppEvent::<nome>` e os paths a comandos/views/census sem alterar este pacote
durante a crítica. A lane não executou census modular, inventário SlashCommand
ou despacho de slash, que continuam do Lead.

Fontes úteis para joins: `codex-rs/tui/src/chatwidget/slash_dispatch.rs` contém
referências de eventos já retidas; `app/event_dispatch.rs` fornece arms/calls;
`app_event_sender.rs` contém filtro de voz e logging; `session_log.rs` contém
consumo de logging e wildcard; `app_backtrack.rs` e seus submódulos contêm
helpers do App fora do prefixo `app/`, que não foram excluídos por path.

Alias explícito/type alias/AppEvent glob: zero no alvo; sintéticos cobrem o
leitor. Globs de módulo: 687 preservados como `OPEN`. Import inheritance,
shadowing, Rust name/type resolution, CFG efetivo, macro expansion, funções
indiretas e reachability permanecem `OPEN`, assim como owner/requisito específico
em `OPEN_LEAD_JOIN`. Não há evidência de runtime nesta entrega.

A [verificação](verification.json) registra determinismo duplo, checagem de
spans, negativos de artefato, probes semânticos de fonte em memória e manifesto
estrito. O [ledger](commands.json) preserva a primeira falha e os comandos/exits
observados. O SHA-256 de `manifest.json` é informado no encerramento externo;
`--check` exige esse manifesto e valida novamente inventário e verificação.

Próxima ação do Lead: integrar os joins de comandos/views/owner/requisitos e
submeter o pacote congelado ao crítico reservado, sem conceder qualificação por
referência lexical. A meta nativa integral, 487+22, seis gaps SDK, cinco limites
externos e G02/G03/G04 continuam obrigatórios. Zero recibos, sem fechamento G01,
sem autoaprovação, sem commit/push/deploy ou atualização de ledgers/claims.
