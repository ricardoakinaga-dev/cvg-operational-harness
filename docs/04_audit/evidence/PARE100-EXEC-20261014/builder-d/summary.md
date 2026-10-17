# Builder D — SPEC0212 — IMPLEMENTED

Lane limitada a P100-012 / CTL-W01–W03, no worktree autorizado. SPEC0212 permanece no SHA-256 `559e7da51d49f9e4ba7c1405a95d9ef2d61256e901d3b26c36f20276d551db4b`; autorização explícita no `../lead/t3-user-approval.json`. Estado de implementação `IMPLEMENTED`, aguardando crítica independente e integração/gates do Lead. Não há DONE, aceite de paridade ou release.

A fábrica encaminha as instâncias pause/effects aos dois perfis e sandbox ao iterativo. O kernel valida modo/flags/deadline/root do grant, captura uma cópia readonly congelada e entrega sandboxHandle ao contexto. O shell exige esse handle, mantém a confinagem por realpath, repassa grants ao runner/default runContained e limita timeout à solicitação/limites/deadline concedido; execute direto sem handle rejeita. Não foram fabricados grants nem ampliadas autoridades.

started síncrono/assíncrono que falha retorna not_started/INSUFFICIENT_EVIDENCE sem body/finished. finished síncrono/assíncrono que falha após efeito retorna o outcome existente threw, erro fixo `unknown_effect: effect_settlement_failed`, duração preservada, antes de post-execute/publicação. Approval fica UNCERTAIN. Um checkpoint iterativo com essa falha específica é preservado ao reentrar; a decisão incerta não repete o efeito. Os demais estados, códigos públicos, policy, aprovação, journal e schemas permanecem fora da mudança.

## Evidências executadas

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Baseline antes do patch | 50 FAIL / 18 PASS de 68 testes novos | `red-controls.json` / `red-controls.log` |
| Probe público antes do patch | 2 FAIL | `red-probe.json` / `red-probe.log` |
| Primeiro reteste | 2 FAIL demonstraram replay no checkpoint iterativo | `green-controls-1.log` |
| Regressão focada final | 132/132 PASS em 8 arquivos, sem skips | `unit-final.json` / `unit-final.log` |
| Probe público final, expectativas preservadas | 2/2 PASS | `probe-final.json` / `probe-final.log` |
| Typecheck focado com probe e seu grafo importado | 11 entradas, 408 dependências, zero diagnósticos | `typecheck-final.json` / `typecheck-final.log` |
| Lint focado | exit 0 | `lint-final.json`; rawlog vazio preservado |
| Formato focado | exit 0 | `format-check-final.json` / `format-check-final.log` |
| Diff check focado | exit 0 | `integrity-final.json`; rawlog vazio preservado |

Todas as execuções registradas por run.py usam Node22 PATH `/home/ricardo/.nvm/versions/node/v22.23.2/bin`. Cada JSON de comando registra argv, cwd, timestamps, exit real e hash do rawlog. `candidate-files.json` contém os hashes finais da SPEC e dos 11 arquivos de código/teste desta lane; `source-manifest.json` é o registro do comando gerador e `source-manifest.log` preserva seu payload integral. Uma tentativa de atualizar o claim usando o JSON de comando como inventário falhou antes da escrita; `claim-handoff.log` preserva a falha e `claim-handoff-final.json` registra a correção.

Os testes finais cobrem pausa e falhas de pause pelos dois perfis, lifecycle e publicação, falhas sync/async de started/finished, settlement dos resultados succeeded/failed/threw/deadline/cancelled com duração original, approval incerto, ausência/negação/indisponibilidade/throw/handle inválido de sandbox, handle congelado separado da fonte, grants não ampliáveis por JSON/mutação e shell aprovado pelo entrypoint público. Os testes de shell existentes receberam fixtures explícitas de grant sintético para manter as mesmas provas de validação/mapeamento. O teste antigo que esperava succeeded apesar de finished rejeitado foi corrigido para o novo comportamento aprovado, e sua falha original permanece em `green-controls-2.log`.

## Self-review e handoff

Self-review distinto em `self-review.log`, não independente: contrato fora do campo opcional aditivo em ToolExecutionContext igual a HEAD; diff/probe inspecionados, expectativas de replay preservadas; nenhum arquivo de SDK/replayexecutor/snapshot/pins/manifest/config/lock/ledger compartilhado editado diretamente por esta lane. Nenhuma mudança de root/reference, rede/provider, dado real, clínica/finanças, commit, push ou deploy.

A primeira execução do probe ainda apontava ao diretório Builder B e gravou seus dois outputs sintéticos de baseline (`pause-probe-actual.json` e `effects-probe-actual.json`). O caminho foi corrigido em public-controls.probe.ts para Builder D antes dos retestes; nenhuma expectativa alterada. Lead deve preservar essa ocorrência e os outputs anteriores. `lead-findings.json` também preserva o TS2367 observado no SDK durante typecheck-1/2; ele não reapareceu no typecheck final após a alteração concorrente da lane SDK. Builder D não editou o SDK.

Lead assume PUBLIC_API/public-surface pins, ledgers, integração e gates amplos de unit/coverage/PG/E2E/cert; esses procedimentos não foram executados por esta lane. Crítica fresh independente NOT_RUN e CTL-W04 ainda aberto. Falha de capacidade prévia na revisão documental da SPEC não foi reclassificada nem convertida em autoaprovação. Próxima ação: congelar candidata integrada, executar I1 e gates do Lead contra a SPEC imutável, sem liberar produção. Runner injetado prova repasse de grants e ordem, não isolamento nativo/Landlock; a reivindicação de contenção completa permanece fora desta lane em P100-024.
