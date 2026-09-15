# Agente 3 — AAA-13: validar resultados brutos antes de qualificar

Execute exclusivamente AAA-13 / AAA13-C5-F01 e AAA13-C5-F02 como uma tarefa de rework dos parsers. Leia AGENTS, runtime/log/backlog e o parecer adjacente. O coordenador fechou AAA13-C3-F01 (evidência ausente); não reabra nem repita essa hipótese sem nova evidência.

## Escopo e autorização

Correção local controlada/sintética dos três paths já reservados: `scripts/lib/certification-rules.mjs`, `scripts/phase10-verify.mjs`, `scripts/phase10-certify.mjs` (este último somente se necessário para emitir dados compatíveis). Evidência nova no diretório AAA-13. Preserve versões anteriores. Não editar package.json/lockfile, produto das outras frentes, contratos congelados ou registros compartilhados; não executar full certify, Docker, benchmark, deploy ou ações reais nesta task.

## RED e critérios congelados

1. Reproduza R1/R2 do coordenador (`reproduce.py`, `injected-cases.txt`); preserve RED. R1 e R2 são fixtures com hashes coerentes, não ataques de hash adulterado. Hoje ambos retornam exit 0 sem failures; C0 deve continuar aceito.
2. Coverage: valide presença e tipo numérico finito, intervalo 0–100 de cada `pct` antes de tolerância/comparação com métricas declaradas. Ausência, null, string numérica, objeto, negativo e >100 devem rejeitar com código específico. Inclua cada uma das quatro dimensões, comparação divergente e controle válido. Não invente nem reduza pisos de qualidade; este aceite trata de validade dos resultados.
3. Chaos: use estados explicitamente suportados pelo produtor real e inventário inequívoco. Apenas assertions efetivamente executadas contam como execução; aprovação exige cenários obrigatórios aprovados. Rejeite status desconhecido/ausente, skipped/pending em cenário obrigatório, zero passed e resultados contraditórios/duplicados que escondam skip ou falha. Fixe o conjunto obrigatório conforme a suíte/contrato existente, sem aceitar 14 IDs arbitrários como substituição. Preserve falha dominante. Demonstre controles válidos com formato real do runner.
4. Inspecione os demais parsers alterados no R3 para a mesma classe de coerção/campo obrigatório ou inventário inconsistente. Corrija apenas defeitos dessa classe comprovados por teste; registre outros débitos sem ampliar a task. Não imponha formato sintético incompatível com produtores reais.
5. Exercite os negativos pelo CLI real com código específico (falha incidental não vale); C0 e N1–N9/C1–C9 precisam continuar PASS. Preserve verificação histórica de 27 hashes e rejeição do certificado legado no modo atual. Use cópia descartável para não sobrescrever certificados compartilhados.

## Entrega

Manifesto e hashes novos; RED/GREEN; casos e códigos esperados/observados; diff; comandos/exit codes; regressões e gates locais disponíveis, limites explícitos. Sem reduzir limiares ou autoaprovar DONE. Entregue IMPLEMENTED_PENDING_INDEPENDENT_REVIEW ou BLOCKED com causa objetiva; aguarde auditoria antes de qualquer outra task. Coordenador integra os registros e decide a janela de certificação.
