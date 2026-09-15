# Limitações e ressalvas — AAA-34 / agent-runtime

1. **Nenhum código de produção foi alterado.** `runtime.ts`, `effect-journal.ts`,
   `proposal.ts`, `contracts.ts` e `index.ts` foram lidos e usados como estão
   (hashes em `manifest.json`). As mudanças desta lane são exclusivamente
   arquivos de teste em `packages/agent-runtime/src/__tests__/`.
2. **Ajuste de determinismo em teste de outra lane.** O teste pré-existente
   `AAA-10 T-08` (`runtime-journal.test.ts`, arquivo não rastreado de outra
   lane) era flaky: a corrida de dois `runTurn` podia terminar com
   `approval_confirm_failed` no perdedor em vez de `operation_in_progress`.
   A correção foi apenas de teste (o vencedor segura o lease `EFFECT_STARTED`
   antes de o perdedor tentar a mesma `operationKey`), preservando as asserções
   originais de efeito único. Não houve alteração de produção; o
   comportamento observado de replay com registro `CONFIRMED` e aprovação sem
   reserva é coberto como negação honesta em
   `runtime-execution-recovery.test.ts`.
3. **Ramos defensivos inalcançáveis.** O `runtime.ts` contém guardas que não são
   alcançáveis pela API pública (callsites validam antes). Isso limita o branch
   bruto de `runtime.ts` a 96,87% e o caminho crítico de replay a 94,87%; 37/37
   dos ramos alcançáveis de replay estão cobertos. Lista completa em
   `critical-branch-table.md`.
4. **Estabilidade de coverage do lock de arquivo.** O `FileEffectJournal` usa
   polling de lock; conforme o timing, 1–3 statements do caminho de lock podem
   aparecer cobertos ou não (variação observada de 98,4% a 99,6% em
   `effect-journal.ts`). Os números do `after/` são os de uma execução verde
   registrada.
5. **`FileEffectJournal` é single-host por construção** (documentado no próprio
   módulo) e não substitui o adapter PostgreSQL, que está fora do escopo desta
   task. Nenhuma durabilidade física/multi-host é alegada.
6. **Sem mutação.** A seleção e execução de mutantes pertence à lane AAA-12;
   nenhuma medição de mutação é apresentada aqui.
7. **Denominador de coverage.** Medição restrita a
   `packages/agent-runtime/src/**/*.ts` (web, bootstraps e adapters PostgreSQL
   excluídos conforme `vitest.config.mts` e AAA-04 §9.1). `vitest.config.mts` e
   `package.json` não foram editados (há modificações pré-existentes de outras
   lanes no `package.json`, preservadas).
8. **Ambiente Node.** Execução em Node `v24.20.0` (ambiente local); o alvo CI é
   Node 22 e não foi revalidado nesta task. Nenhuma alegação de qualificação em
   Node 22 é feita.
9. **Sem canais/gateways.** O caso de `hashVersion` inválido citado no pedido
   pertence ao `channel-gateway` (fora do escopo `agent-runtime`); o adapter de
   arquivo do runtime não possui `hashVersion`. Nada foi coberto além do
   pacote autorizado.
10. **Outras lanes concorrentes.** Arquivos de `apps/api` e de outros pacotes
    mudaram durante a execução; o `npm test` final é de `2026-09-13T04:19Z` com
    zero falhas. Nenhum artefato de outra lane foi revertido ou editado.
11. **Sem dados reais, ações reais, commit, push, deploy ou `npm install`.**
    Todas as fixtures são sintéticas; relógios foram injetados; diretórios de
    journal usam `mkdtemp` único.
