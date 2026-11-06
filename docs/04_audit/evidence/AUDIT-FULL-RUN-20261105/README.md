# AUDIT-FULL-RUN-20261105

Bateria completa da auditoria de 05/11/2026 em clone descartável de `d394d71a4`, com Node 22.23.2 e PostgreSQL em contêiner próprio. Não há dado real. O relatório com notas está fora do repositório, no Claude Docs: https://claude.ai/artifact/7rHkerLqzhGKR3rj8M3Zp2

- `gate-summary.txt`: código de saída de cada gate da bateria principal.
- `phase10-result-extract.json`: decisão, métricas e gates do `certify` (`CONDITIONAL_GO` / `AAA_CONTROLLED`).
- `x_certification_self-test.log`: falha real; 33 casos de CLI não executam porque a fixture não copia `scripts/lib/test-log-summaries.mjs`.
- `selftest-fixed.log`: diagnóstico com essa linha aplicada apenas no clone; 43 de 43. A correção não foi aplicada neste repositório.
- `native-original-tail.log` e `native-repinned-tail.log`: `test:boundary:native` com o pin atual (52 falhas) e com o pin de `/usr/bin/git` ajustado só no clone (79 de 79).
- `test_e2e_rem21-014.log` e `rem21-rerun.log`: sem navegadores e depois com Firefox e WebKit instalados. WebKit 0/6 por falta de bibliotecas do host.
- `image-smoke.log`: smoke endurecido da imagem, PASS. O gate `image` da summary falhou por chamada sem `init`, erro do auditor.
- `x_certify_phase4a.log`: `critics: BLOCK`, esperado sem novos pareceres para o candidato atual.
