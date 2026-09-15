# AAA-08 rework — parecer independente

**APPROVE para a correção controlada; AAA08-C1-F01 fechado.** Cinco hashes do candidato conferidos. Reexecutados **6 arquivos / 62 testes PASS**, exit 0 (policy, runtime e chaos sem PostgreSQL). O [probe de aceite](binding-acceptance.mjs), com expectativas de sucesso da correção, retornou exit 0 e confirmou DENY/action_capability_mismatch/zero chamadas para os três casos. Não usamos o exit 1 do probe antigo como prova isolada.

Inspeção: mapa completo para 21 capabilities, nomes canônicos e alias read restrito às seis capabilities de leitura. Checagem tenant → resource → action → grants/role/documentos. Os chamadores inspecionados usam nomes canônicos; fixtures de leitura usam read. Não foi identificado outro alias legítimo no escopo inspecionado. Regressores mantêm draft executável no falso, cancel exigindo aprovação, confirm/reschedule sem grant e policy de tenant sem ampliar o binding.

Adendo `d67fc9155207659c6ee9c874c7ce17a2d187b5ea86b13c1b99144da24099b54f` aprovado como **AAA03-R-ACT-v1**, composto com AAA-03 rev2 `9df1a05fdf36293d02e006917f191f0c96e8c1109e4a10d1e9fc49f5d9ef3ff7`. Ambos ficam tecnicamente congelados pelo registro `review.json`, sem modificar bytes. T-22 usa “read” como abreviação de capability de leitura, não introduz enum novo. A declaração PROPOSED no arquivo do autor descreve sua submissão; este parecer registra o aceite posterior. Alterações futuras exigem nova versão/revisão.

AAA-08 permanece REVIEW para qualificação integral, com **correção funcional aprovada**: coverage global relatada ainda abaixo da barra v2; effectScope/negação de adapter real pertence à integração AAA-09. Não fechar F15 em produção nem fingir gate humano. O relatório antigo que dizia server.ts não formatado/AAA-05 aguardando revisão está superado por evidências já integradas.

AAA-03 passa a VERIFIED documental com composição rev2 + adendo aprovada, AAA-04/05 já VERIFIED documentais. Isso torna os insumos técnicos de AAA-07 disponíveis. [Próxima tarefa única](next-task-agent-1.md): lifecycle de aprovação em ambiente local sintético, sem antecipar alterações do runtime ou SQL. Nenhum DONE, gate humano/produção ou aprovação retroativa concedido.

Suite completa e gates globais do executor são históricos; nesta auditoria reexecutamos o recorte diretamente afetado. Nenhum código do produto foi editado pelo coordenador. As frentes dos Agentes 2/3 ficam preservadas.
