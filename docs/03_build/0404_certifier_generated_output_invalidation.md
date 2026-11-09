# 0404 — Invalidar resultados gerados antes do produtor nativo

Task `CLOSE-CI-LOCAL-20261023:OUTPUT-FRESHNESS`, achado `CERT-EVIDENCE-STALE-SUBRESULTS`. Base publicada `2e5a64def639ddfebb3f0b81ccc8b8fcf3419d7b`.

## Problema e aceite

O certifier nativo coleta arquivos existentes depois do comando. Quando a primeira etapa de cobertura falha, `&&` não executa cobertura crítica nem mutação. Os JSONs desses dois produtores podem ter vindo de outra rodada ou dos gates externos anteriores. O wrapper atribui o run atual à coleta sem demonstrar que esses produtores executaram. O resultado global observado já era NO_GO; não há comprovação de falso GO.

A correção deve impedir que resultados anteriores dos produtores nativos apareçam como resultados atuais. Um arquivo novo produzido por uma etapa que falhou continua evidência daquela falha; não será apagado depois da execução. Inputs estáticos e evidência histórica ficam intactos.

## HOW fechado

1. No início de `run(entry, ...)`, antes do spawn, invalidar os paths de resultados gerados do próprio gate.
2. A lista vem de `GATE_EVIDENCE_MATRIX` e `GATE_ENVIRONMENT_EVIDENCE_MATRIX`, já revisadas. Para `coverage`, acrescentar somente `certification/critical-coverage.json` e `certification/mutation-guard.json`. Não remover `scripts/critical-coverage-manifest.json`, que é fonte estática.
3. Remover cada path exato com `fs.rmSync(..., {force:true})`, sem modo recursivo. Ausência é normal; erro real de remoção interrompe o produtor, sem executar sobre evidência herdada. Um diretório no path não será apagado recursivamente. Um symlink no último componente é removido, sem seguir seu alvo. O perfil pressupõe workspace/produtor confiáveis, como o certifier nativo atual; não é o novo protocolo contra escritor adversário da SPEC0261.
4. A coleta, schemas, logs, métricas, comandos, timeouts, decisão, matriz de gates, verificador, política de skips, floors e âncoras permanecem os atuais. Após a invalidação, apenas arquivos que o comando criou podem aparecer nos paths de resultados daquele gate. Não implementar reuso, reporter novo, formato v2 ou metadata nova.
5. Preservar a limpeza inicial existente. Ela também protege uma execução que termina antes de chegar ao gate; a nova limpeza é local ao produtor e impede que saídas de etapas anteriores sejam confundidas com as dele.

Alvos: `scripts/phase10-certify.mjs`, novo `scripts/lib/phase10-generated-results.mjs`, novo `tests/phase10-generated-results.test.js`, este contrato. Somente candidata própria; nenhum código no checkout compartilhado, workflow/ci-bar-contract da U08, dependência ou lockfile.

## Barra de verificação

- Reproduzir a falha na função `run` original com um processo Node sintético que termina não-zero: arquivos críticos antigos continuam presentes na base. Não rodar o certify inteiro nem creditar replay como execução real.
- Executar a função `run` real extraída do arquivo revisado, com FS e subprocessos reais em root descartável: falha antes da primeira saída, sucesso integral, falha na etapa intermediária de uma cadeia `&&`, presença de saídas novas e ausência das antigas, duas execuções consecutivas e interrupção por erro de limpeza.
- Conferir todas as entradas da matriz; inputs estáticos e histórico fora da allowlist devem conservar bytes. Não apagar pastas recursivamente nem seguir o alvo de symlink final.
- Regressões de CI/proveniência/cobertura/skip/findings, tipos, lint, formato e scanner no delta. Crítico independente do código e dos oráculos, com fonte congelada e limites declarados.
- Antes de merge: cinco checks obrigatórios verdes no HEAD exato. A prova local é do ciclo de saídas; não substitui unit/PG/E2E/certify da CI composta nem dá aprovação de produção.

## Classificação e gate

T2 de correção de atribuição dentro do contrato nativo vigente: apenas estende a invalidação de saídas já existente. Não muda schema, origem autorizada de prova, significado de PASS, requisitos de verificação ou trust root. A SPEC0170 e a SPEC0261 continuam com suas próprias aprovações; nenhuma é inferida desta tarefa. Se o reparo exigir alterar algum desses contratos, interromper e submeter o delta aplicável antes de BUILD.

Task e claim registrados, WHAT/HOW acima fechados antes de implementar. Gate `IMPLEMENTATION_READY_T2` somente para este recorte. Rollback por PR do delta preserva históricos e não qualifica os resultados antigos. Produção continua NO_GO.
