# AUD-0602 — reauditoria e publicação

Task `AUD0602-REMEDIATION-PUBLISH-20261006`, 06/10/2026. [Parecer](../../0602_reauditoria_aud0601_2026-10-06.md). Candidato81f01e8; follow-up8652319 avaliado separadamente. **Casos originais confirmados; PARTIAL / NO_GO por um P1 e um P2 adicionais.** Commit/push autorizados pelo usuário; sem deploy/release/proteção de branch.

- [Síntese estruturada](proof.json) e [fontes/commits](source-manifest.json): suítes canônicas com Node22.23.2 e PostgreSQL obrigatório próprio. 358 arquivos/2.940 PASS com cobertura; PG37 arquivos/298 PASS, zero skips/falhas. Brutos coverage-tests.json.gz/postgres.json.gz e logs homônimos.
- [Cobertura crítica](critical-coverage.json) PASS: mínimo de branches96,48%, barra95% somente branches. Funções channel94,59% são informativas; a AUD-0601 foi imprecisa ao relacioná-las ao mínimo95%. [Resumo da cobertura](coverage-summary.json), [mutation10/10](mutation-guard.json), [skips](skip-inventory.json), [backup/rollback0027](rem21-010-postgres-proof.json). Skip lê também relatórios históricos; não prova execução E2E nova.
- [Smoke18/18](stack-smoke.json), [runtime distroless](image-inspection.json), [escopo do scan](image-scan-scope.json) e [zero achados da imagem](image-secrets.json). Imagem própria reconstruída7d76693f; não se alega digest idêntico ao recebidoa0f647b1. API/worker healthy.
- [Cadeia após restore](restore-chain.json):16 eventos íntegros, metadado/payload adulterados detectados. [Perfil negativo](restore-profile-negative.json): recusa sem NODE_ENV=test. [Pausa com PostgreSQL](pause-postgres-proof.json): corpo0/APPROVED, resume1/EXECUTED, replay1; [restore de controle dessa medição](pause-restore-control.json),21 eventos.
- [HTTPS e âncoras](boundary-probes.json):14 casos inject, três sockets HTTP reais; seis verificações de integridade. Apenas GET/HEAD /live por loopback sem cabeçalhos de proxy fica isento de HTTPS.

## Contraexemplos confirmados

AUD0602-F01/P1: `lead-worker/final-guard-results.json.gz` e log correspondente. Cancelar ou expirar prazo durante a última leitura assíncrona de pausa ainda chama o corpo1; negação vem depois e estado fica UNCERTAIN. Revisor reproduziu o mesmo em `worker-reviewer/results.json.gz` e `guard-filter-validation.json.gz`. Runner agregador exit0 não é PASS do candidato: examine status/asserções. Sem execução PostgreSQL deste novo achado.

AUD0602-F02/P2, herdado: `lead-session/session-boundary-summary.json.gz` e `session-reviewer/receipts/run3/session-boundary-summary.json.gz`. Troca de operador/papel com revoke503 envia cookie novo+limpeza enquanto antigo continua200; se ambos revokes falham, cookie novo exposto também200. Mesma identidade/linhagem e rota logout primária passam. São rotas reais/store PG, perfil test com schemas/admin próprios; composição do contraexemplo com os quatro roles de produção NOT_RUN.

Sessão:13 cenários comportamentais,10 conformes/três variantes do mesmo P2, mais ambiente/cleanup. Worker:35 cenários,27 PASS/8 FAIL brutos; apenas dois FAIL da guarda promovidos. Três de liquidação com falha de dependência são observações conservadoras/body0; dois de shutdown exploratórios; um orçamento com premissa inválida. Adjudicação preservada em `worker-reviewer/adjudication.json.gz`.

## Reprodução e preservação

Fontes/runners estão em `.txt.gz`, byte-exatas ao descompactar, fora da coleta normal: boundary-probes.mjs, loader.mjs, pause-postgres-proof.ts, run-gate.py e fontes dos revisores/leads. Ajustar caminhos de checkout/dependências/output e reservar recursos próprios; credenciais/identidades são sintéticas, limitadas a fixtures loopback. Reportes auxiliares: `session-reviewer/report.md.txt.gz` e `worker-reviewer/report.md.txt.gz`. Nenhuma regra de scanner foi alterada. Logs/resultados brutos compactados e recibos `*.result.json` distinguem comando/gate/asserção.

Preservadas rodadas inválidas: worker com journals reutilizados; observador de lock de sessão incorreto; primeiro runner PG do lead que exigia processed no caso paused; snapshot do array de invocações com referência viva; sonda antiga que ainda afirmava que payload adulterado era válido. Não sustentam novos achados. Fontes/lockfile/registros recebidos preservados, bancos/contêineres próprios removidos, revisores encerrados. Imagem própria fica identificada para reprodução.

E2E/browser/certify/SBOM/licenças locais NOT_RUN. Os25 gates declarados pelo builder não foram todos reemitidos nesta auditoria. CI remoto do novo histórico e infraestrutura real permanecem pendentes; mesmo CI verde não elimina os contraexemplos. Alerta desligado conforme decisão declarada do usuário.

[Follow-up8652319](followup.json):119 testes/12 arquivos e typecheck PASS, dependências/worktree próprios. Reemissão integral dos gates no SHA final segue pendente do CI.

[Publicação verificada](publication.json): push normal exit0, main dc4a3cb→d76691c confirmado por ls-remote.12 commits recebidos e commits de auditoria/empacotamento publicados; recibo e ledgers finais são commit documental subsequente. CI ainda pendente, P1/P2 abertos, sem release.
