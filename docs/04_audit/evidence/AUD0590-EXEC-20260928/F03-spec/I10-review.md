# F03 / SPEC 0163 — crítica independente I10

**Claim:** `AUD0590-F03-SPEC-I10-CRITIQUE-001`  
**Entrada exata:** `docs/02_spec/0163_otel_redaction_boundary.md`, SHA-256 `b528f27f776cdf9796571ed4210c7bafda2fb38367e3bd1ff7244e4473aac77d`, verificada antes e depois desta crítica. Entrada I9 anterior: SHA-256 `ec8d3950b96532f4af8a17a8aa98911791e385921ca78a80ac8b358661684f5f`; revisão I9 SHA-256 `650a9b186f9f38ffb851ac6edc999930a3be91c6fb73adf4709223cc8287f3a2`. Reconciliação: `I9-state-reconciliation.md` SHA-256 `84bfe114e09eeb7410e1f2a615aa9bfafe63342dadb7c1b344029611d3d03b6f`; prova SHA-256 `7dddc0df994cf96b03fc7c2614702e3824e6926f578cb2a7d48bb7eb1302362c`.

**Veredito:** `REVISE` — 0 P0, 0 P1, 1 P2.  
**Confiança:** alta quanto aos hashes, diff e finding de rastreabilidade; média quanto à cadeia histórica completa, que não foi integralmente revalidada nesta rodada.

## Finding

**P2-01 — a declaração de rastreabilidade histórica é mais ampla que a evidência registrada.** O fecho da SPEC afirma que “críticas/respostas I1–I9” estão no pacote e que o veredito/hash de “cada candidato” está no pacote T3. O inventário lido contém revisões I1–I9, respostas separadas I5–I8 e a reconciliação de estado I9; não contém respostas separadas I1–I4 ou I9. O pacote T3 atual (SHA-256 `0d18d75cfa9b761503ca85f0facf6e5c8c1ac83630ebd2437c77718f430a8b46`) identifica o candidato atual e o candidato I9 anterior, não a cadeia de hashes/vereditos I1–I8. A formulação, portanto, não descreve com precisão onde está a trilha histórica completa. I1–I6 não foram revalidados integralmente por hash e conteúdo neste passe; não afirmo que seus registros estejam incorretos, mas o critério de exatidão I1–I9 não ficou provado. Clarificar a referência para distinguir os artefatos realmente existentes e conferir a cadeia histórica antes da decisão T3.

## Verificações concluídas

- O blob `90d7f13:docs/02_spec/0163_otel_redaction_boundary.md` tem SHA-256 `ec8d3950b96532f4af8a17a8aa98911791e385921ca78a80ac8b358661684f5f`, igual à entrada I9 solicitada. A comparação integral com a SPEC atual mostra somente três parágrafos de metadados processuais alterados: estado/caminho do pacote no cabeçalho, gate de crítica/aprovação no passo 1 de rollout e histórico/fecho. O contrato técnico não mudou nesse diff.
- I9 aceitou documentalmente apenas o candidato `ec8d3950b96532f4af8a17a8aa98911791e385921ca78a80ac8b358661684f5f`, sem findings P0/P1/P2. A reconciliação corretamente exige I10 e T3 vinculados ao novo hash. Esse aceite não foi transferido.
- A leitura integral das §§1–6 não encontrou outra contradição material óbvia no contrato técnico. Catálogo `F03-C1`, fronteiras anteriores a SDK e sinks, contexto interno, DTOs, rotas, processo `PROCESS-L1`, prova sintética e limites de rollout permanecem definidos. A trilha T3 continua explícita antes de BUILD; produção permanece `NO_GO`; não há autorização para dados reais, exportação externa, push ou deploy.
- A SPEC não conserva o estado antigo `FRESH_CRITIQUE_PENDING` nem diz que I7 é a crítica mais recente. O pacote T3 lido ainda diz I10 `PENDING`, estado correto antes desta saída; não foi alterado por estar fora dos dois caminhos autorizados e precisa ser reconciliado antes da revisão humana T3.

## Limitações

Não executei testes nem BUILD, não examinei novamente o comportamento do código/runtime e não usei dados reais. A verificação de revisão-readiness é documental. O histórico I1–I6 e as respectivas hashes/cadeias de resposta não foram revalidados integralmente; por isso este parecer não aceita a SPEC para revisão T3.
