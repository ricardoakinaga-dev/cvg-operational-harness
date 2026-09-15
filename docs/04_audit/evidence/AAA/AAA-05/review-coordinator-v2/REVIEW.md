# Auditoria do retorno do Agente 2 — contrato v2 e errata

Parecer: **REWORK para AAA-05 v2**, hash `2e8738e62926e67ea455f6930003bb836ce224ab95f0f878d6b4424c4a323568`. Revisão direta do coordenador, que não escreveu o contrato nem o código candidato. A próxima tarefa é somente [AAA-05 v3](next-task-agent-2.md).

As correções textuais de separação dos hashes, FAILED terminal e referência AAA-03 rev2 foram confirmadas. A v1 preservada confere com `8db1541f…`. Isso não basta para congelar a v2:

1. **AAA05-C2-F01 / P1:** A1 afirma equivalência dos canonicalizadores para entradas válidas. O [probe executado](canonical-probe.mjs) demonstra o contrário: metadata `{ "2": "two", "10": "ten" }` é aceita pelo schema; o runtime serializa `10,2`, o canal serializa `2,10`, gerando hashes diferentes. O contrato §1.1 também promete rejeitar undefined e normalizar Date, enquanto o canonicalizador compartilhado omite membros undefined, usa null em arrays e rejeita Date. Definir comportamento normativo e registrar o gap atual em AAA-12, com compatibilidade para hashes persistidos; não afirmar que a integração já satisfaz o binding.
2. **AAA05-C2-F02 / P2:** O retry correto depende de `release`, ausente na interface publicada em §3. A frase de §4 que torna CONFIRMED/FAILED imutáveis “exceto resolveUncertain” contradiz FAILED terminal. Completar assinatura e precondições; resolução não pode reabrir terminal. Comparar a porta normativa com a real, inclusive o parâmetro actor proposto.
3. **AAA05-C2-F03 / P2:** A5 propõe migration única 0012 e adapter runtime implementado pelo Agente 1. As decisões D05-1/2 já registram 0012 canal, 0013 runtime e implementação SQL pelo Agente 2 sob handoff. Corrigir referência/versão do plano, mantendo reserva separada de autorização BUILD.

AAA-12: os 12 hashes conferem. Ambos os digests foram recalculados: legado `33aa2807…`, canônico `ae9c2b60…`. **AAA12-R3-F01 fechado como errata comprovada.** Parecer anterior APPROVE preservado somente no escopo host-local. AAA12-R3-F02 continua aberto; o requisito foi incorporado ao aceite canônico de AAA-21. Novo risco de canonicalização e cobertura crítica permanecem rastreados em AAA-12.

AAA-16: parecer independente APPROVE e log 11/84 PASS, sem skips na contagem e exit 0 conferidos. Aceite técnico local registrado; dependências e gates ainda impedem encerramento. Não reexecutamos PostgreSQL nem a suíte completa nesta rodada; não houve necessidade de repetir a prova funcional para auditar uma alteração documental. Fsync desligado não prova durabilidade física.

Validação direta: probe Node/tsx exit 0 ao confirmar contraexemplo; hashes/digests e logs em [checks.json](checks.json). Nenhum código do produto ou contrato do autor foi editado; evidências anteriores preservadas. Nenhum gate concedido.
