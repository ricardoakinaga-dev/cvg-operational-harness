# AAA-13 R4 — parecer independente

**APPROVE_R4_CONTROLLED_CORRECTIONS**. Fechados AAA13-C5-F01 e AAA13-C5-F02; AAA13-C3-F01 permanece fechado. Task AAA-13 passa de REWORK para **REVIEW**, aguardando integração do produtor/verificador com execução real dos gates locais. Nenhum DONE, G_QUALITY ou certificado atual concedido.

Três hashes dos scripts conferidos; phase10-certify.mjs inalterado. Em cópia descartável: **37/37 checks PASS**, sendo 9 helpers e 28 pelo CLI público (o total não é exclusivamente CLI). C0 aceita fixture completa; negativos rejeitam com códigos próprios. Acrescentados os dois probes originais do coordenador sem alterar o código de verificação padrão: **39/39 PASS**; R1 rejeita `coverage_raw_invalid:coverage:statements:not_finite`, R2 rejeita `chaos_raw_invalid:not_executed:CHAOS-01:skipped` e demais inconsistências de inventário. Histórico reexecutado: exit 0, 27 hashes.

Inspeção: percentuais finitos e intervalo são exigidos antes da tolerância; estados de chaos explicitamente classificados, cenário obrigatório precisa passar, duplicatas e métricas divergentes rejeitam. A suíte confirma CHAOS-04/05 condicionais a TEST_DATABASE_URL; 01/02/03/06..16 obrigatórios. Validações numéricas dos parsers adjacentes possuem regressões C24–C27.

Evidências em `checks.json`, `negative-validation.json`, `adversarial-results.json` e logs. Reprodução: `python3 docs/04_audit/evidence/AAA/AAA-13/review-coordinator-r4/reproduce.py`. Somente cópias temporárias e evidências desta revisão são escritas. Os artefatos do executor e os pareceres antigos foram preservados.

Limites: suíte global, coverage, Docker e full certify não reexecutados nesta revisão. C0 é teste do verificador com fixture; não demonstra que o produtor completo emite evidência compatível nem que o programa atende à barra AAA. Débitos declarados de SBOM/security/Playwright permanecem registrados como limitações não comprovadas nesta rodada. Hashes não autenticam produtor que controla todos os arquivos.

Próxima tarefa única: [ensaio integrado de certificação local em snapshot isolado](next-task-agent-3.md). Este ensaio está autorizado no recorte sintético; produção/signoff, benchmark comparativo e mudanças das outras frentes continuam fora do escopo.
