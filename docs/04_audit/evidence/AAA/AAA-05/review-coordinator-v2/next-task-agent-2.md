# Próxima tarefa — Agente 2: AAA-05 v3

Execute somente a correção documental AAA-05 v3, respondendo ao parecer `docs/04_audit/evidence/AAA/AAA-05/review-coordinator-v2/REVIEW.md`. Não inicie adapters SQL, migrations ou correções de código nesta rodada.

Leia AGENTS, runtime/log/backlog, o parecer e `checks.json`, o contrato AAA-03 rev2 `9df1a05f…` e `coordinatorDecisions` do ledger. Preserve os candidatos e as evidências anteriores.

Objetivo: entregar um contrato e handoff consistentes, que possam ser revisados por hash sem decisões técnicas contraditórias.

1. C2-F01: execute o probe do parecer. Corrija a afirmação de equivalência: metadata válida com chaves "2"/"10" já diverge. Defina a canonicalização compartilhada como alvo normativo, com regras exatas para chaves, undefined, arrays, Date e budgets. Diferencie alvo de comportamento implementado. Documente em AAA-12 a mudança de algoritmo ainda pendente e a política proposta para hashes persistidos (versão/migração ou recusa explícita; nunca apagar journal ou permitir reenvio para contornar conflito). Especifique o teste de binding da projeção completa, sem alterar código agora.
2. C2-F02: inclua `release` na interface com parâmetros, retorno, precondições e fencing. Remova a exceção que permite interpretar `resolveUncertain` como reabertura de CONFIRMED/FAILED; explique replay idempotente de reconciliação. Compare a porta do documento com a interface real, identificando explicitamente diferenças propostas, incluindo actor.
3. C2-F03: alinhe §§0/3/10/14 e o handoff SQL às decisões D05-1/2: migrations 0012 canal e 0013 runtime; SQL implementado pelo Agente 2 sob handoff, especificação runtime e outbox.ts/postgres.ts com Agente 1. Preserve A5 antigo como histórico, mas publique substituição inequívoca; não crie terceira fonte de decisão.

Ownership desta rodada: docs/02_spec/aaa_data_api_contract.md e seus próprios artefatos em docs/04_audit/evidence/AAA/AAA-05/; pode acrescentar handoff documental próprio em AAA-12 para o gap, sem editar manifestos/reviews históricos. Sem escrita em runtime/log/backlog/ledger/0327, contratos de outros agentes ou produto. O coordenador integra seu retorno.

Entregue: v2 preservada com hash original; v3 formatada antes do hash final; manifesto novo por versão com path/SHA-256; mapa C2-F01..F03 → seção/evidência; diff v2→v3; pedido de revisão independente. Confirme que os 12 hashes de código de AAA-12 continuam intactos. Não autoaprovar DONE nem congelar SPEC. Retorne IMPLEMENTED ou BLOCKED com bloqueio concreto. Não redistribua outras frentes nem inicie AAA-17/21.
