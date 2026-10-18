# Handoff — worker direto views

Entrega `IMPLEMENTED`, crítica independente pendente. Owner `DX100-U01`; task
`DX100-G01:TUI-KEYMAP-VIEW-SURFACES`. Escrita exclusiva `views/**`, zero filhos,
zero recibos funcionais, sem autoaprovação.

Integrar o [inventário](inventory.json), [verificação](verification.json),
[comandos observados](commands.json) e [manifest estrito](manifest.json) pelo
[contrato congelado](../views-contract.json). Schema/joins e regras de seleção
estão no [README](README.md). O SHA do manifest é fornecido na resposta externa;
o SHA dos contratos também fica no inventário e manifest.

O Lead pode ligar `entry_surface_bindings` aos oito requisitos originais,
`crosslane_references.join_id` a `AppEvent:<name>` e `SlashCommand:<name>`, e
`files.lead_scope_join_id`/`symbols.lead_scope_join_id` ao censo de módulos.
Esses são namespaces explícitos de proposta para join, sem presumir o schema
final das outras lanes. Não foi duplicado seu dispatch/censo completo. Métodos
de compositor e export fornecem pontos de chamada para o join posterior;
referência lexical não é prova de alcance em produção.

Diferenças que precisam ficar abertas: `runtime-action:global.open_warnings`,
`runtime-action:agents.toggle_pin` e `action:global.leader`. Preservar a distinção
entre catálogo UI, inventário runtime e implementação especializada de chords.
Não converter ausência de par em ausência funcional. CFG herdada e módulos
de testes precisam ser reconciliados pela lane `scope`; nomes de arquivo não
justificam descarte. Parser lexical não substitui Rust/Cargo/macros.

O crítico posterior deve conferir o manifest inteiro, controles negativos e
spans contra Git, os vínculos dos oito requisitos e as diferenças acima. Não há
crítico lançado pelo worker. Estado/log/backlog/claims ficam para o Lead, em
cumprimento à restrição expressa de escrita desta delegação.

`next_action`: integrar joins e submeter a crítica fresca, preservando qualquer
omissão real como `OPEN`. Native full goal, 487+22 `NOT_RUN`, seis gaps SDK,
cinco limites externos e G02/G03/G04 continuam obrigatórios. Nenhum target
import/exec/compile/codegen/terminal control, appgate, instalação, rede, conta,
modelo/provider, lock, recurso, candidate, commit, push ou deploy foi realizado.
