# AUD-0601 — evidência da entrega de produção

Task `AUD0601-PRODUCTION-DELIVERY-20261006`, 06/10/2026. [Parecer completo](../../0601_auditoria_entrega_producao_2026-10-06.md). Código congelado `dc4a3cbbfddf91646d794e9165e524032df04c9c`; complemento documental local `210d8e1`. **Entrega parcial; produção NO_GO.** Nenhum commit, push, deploy ou mudança de configuração remota.

## Resultados e identificação

- [Síntese estruturada](proof.json) e [hashes das fontes](source-manifest.json): checkout isolado/dependências próprias, Node 22.23.2, PostgreSQL 16 obrigatório. Suíte: 358 arquivos/2.925 PASS, zero skips; PG: 37 arquivos/296 PASS. Relatórios `full.json.gz`/`postgres.json.gz`, logs homônimos e recibos `*.result.json` preservam os resultados canônicos.
- [Verify final](verify-final.json), [falha de cobertura crítica](verify-failure-summary.json), [Security](security-jobs.json), [checks publicados](check-runs.json), [main](main-final.json), [CodeQL](codeql-before.json), [environments](environments.json) e [deployments](deployments.json). Verify FAIL em `channel`: funções 94,59%, branches 94,85%, mínimo 95%. Main sem proteção, zero environments/deployments registrados. Log remoto em `verify-failed.log.gz` e trecho crítico em `verify-critical-excerpt.log.gz`.
- [Smoke canônico da imagem recebida](stack-smoke.json): 16/16 PASS. [Identidade das imagens](image-binding.json) e [inspeção runtime](image-inspection.json): API/worker presentes, distroless, uid 10001, sem shell/package manager nos caminhos inspecionados. Digests recebidos/reconstruídos diferem; arquivos executáveis/dependências comparados são iguais, com diferenças documentadas de metadados de build. [Gitleaks](image-secrets.json): zero, regras padrão excluem node_modules.
- [Restore no perfil test](restore-proof-test-profile.json): dump/restore real, 16 eventos, cabeças/contagens iguais e metadado adulterado detectado. `restore-proof.result.json` preserva FAIL401 sem NODE_ENV; `restore-proof-test-profile.result.json` preserva PASS com NODE_ENV=test. São recursos próprios sintéticos, sem backup agendado de produção.
- [Alerta desligado](alert-disabled.json): live/ready200 e `stop_alert.disabled`. A decisão declarada do usuário é respeitada.

## Achados comprovados

| ID | Severidade | Evidência e critério |
| --- | --- | --- |
| F01 | P1 | [Pausa PostgreSQL](pause-postgres-proof.json): paused=true, corpo chamado uma vez e aprovação EXECUTED. `criterionPass:false` apesar de o runner ter exit0; não confundir conclusão da medição com aprovação do critério. |
| F02 | P1 | `session-reviewer/pg-observations.json.gz`: rotação A→B, logoutA200/loggedOut=true, B ainda recebe200. |
| F03 | P2 | Mesmo relatório PostgreSQL: revoke indisponível, logout503 limpa cookie e a sessão continua utilizável. |
| F04 | P2 | [Worker unhealthy](worker-health.json) enquanto processo/heartbeat estão vivos. Sonda é a expressão original da API; só tempos/retries foram acelerados. [Primeiro snapshot](worker-health-first-observation.json) ainda estava starting. |
| F05 | P2 | `lead-worker/heartbeat-results.json.gz`: um evento gera deltas [0,1,1,1], soma3 com callbacks sobrepostos. |
| F06 | P2 | [Sonda da cadeia](audit-chain-probe.json): payload adulterado conserva valid=true e headHash, com payloadMismatches=1; adulteração de metadado é detectada. Modo report é intencional, mas fornece integridade parcial do conteúdo. |
| F07 | P3 | Receita de restore sem NODE_ENV falha401; a prova sintética só passa no perfil test. |

Dois revisores de autoria distinta: `session-reviewer/review.md.txt` (47 PASS/1 FAIL próprio, mais PostgreSQL real FAIL por duas asserções contratuais) e `worker-reviewer/report.md.txt` (33 sondas, 24 PASS/9 FAIL brutos, quatro falhas sustentam dois achados; cinco inconclusivas/suplementares). O lead reproduziu as falhas aceitas de pausa/heartbeat e executou a sonda PostgreSQL de sessão. Revisores não alegam prova PostgreSQL própria do worker; essa confirmação está separada no lead.

## Reprodução, limites e preservação

Sondas e runners foram arquivados como `.txt` para não entrarem na coleta normal: `loader.mjs.txt`, `audit-chain-probe.mjs.txt`, `pause-postgres-proof.ts.txt`, `instrumented-stack-smoke.ts.txt`, `run-gate.py.txt`, fontes/testes dos revisores e `lead-worker/probes.mjs.txt`. Para repetir, ajustar somente caminhos de checkout/dependências/output e reservar recursos próprios. Credenciais/identidades nas sondas são sintéticas; não reutilizar em produção. Consulte comandos nos recibos, manifests e cabeçalhos dos runners; os logs referidos por recibos estão compactados com `.gz` quando aplicável.

Primeira instrumentação de pausa usou assinatura errada de setPaused: artefatos `*.runner-setup-attempt.txt` registram erro do runner e não são prova contra o candidato. Medição corrigida: `pause-postgres-confirmed.result.json`, [critério de pausa](pause-postgres-proof.json) e [restore de controle após limpar a pausa](pause-restore-control-confirmed.json). O FAIL401 da receita original também foi mantido.

Código/lockfile compartilhados intactos; registros anteriores preservados. PostgreSQL próprio e contêineres descartáveis dos smokes removidos; revisores encerrados. Imagem de auditoria permanece identificada para reprodução. Certify/E2E/SBOM/licenças locais, implantação real, proteção de branch e publicação Git não foram executados. A ausência de environments/deployments do GitHub não prova inexistência de toda infraestrutura externa. A decisão de alerta desligado não foi classificada como defeito.

[Preservação e concorrência](preservation.json): ao encerrar, HEAD local já era d3ca659 após novos commits de outra sessão. O candidato auditado continua dc4a3cb; não foram incluídas nem validadas as correções concorrentes. Sufixos dos três ledgers recebidos foram preservados byte-exatos.

Preparação para publicação na AUD-0602: duas fontes com credenciais explicitamente sintéticas foram conservadas em `.txt.gz`, byte-exatas ao descompactar, porque a heurística generic-api-key as marcava. [Mapa de arquivamento](source-archival.json) guarda nomes e hashes originais. Nenhuma regra de scanner foi alterada. O manifesto anterior também foi conservado compactado; a reprodução dessas duas fontes requer descompactação.
