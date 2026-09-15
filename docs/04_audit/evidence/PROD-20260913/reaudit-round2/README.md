# Proveniência da reauditoria M1

Recorte RA-M1-01..08, dados sintéticos. Contrato: `docs/02_spec/prod20260913_m1_reaudit_contract.md`. Relatório canônico: `docs/04_audit/0562_prod_m1_reaudit_2026-09-13.md`.

1. Entrada copiada de tracked + untracked não ignorados, sem reset da árvore compartilhada; hashes M1 conferidos separadamente em `m1-hash-audit.json`.
2. Críticos iniciais com contexto novo produziram negativos e sentinels. Logs RED do líder: 5 falhas/18 passes (readiness + worker), builder UI: 10 falhas/3 passes; persistência: 7 falhas/23 passes. Falhas de setup são descritas nos respectivos relatórios, não contadas como defeitos de produto.
3. Correções locais registradas antes do BUILD, proprietários de arquivos separados. Evidências anteriores não reescritas.
4. Candidato final copiado para diretório isolado, 2.659 arquivos em `candidate-manifest.json`. Dependências privadas copiadas; a qualificação inicial usa essas dependências; depois foi feito `npm ci` e build em terceiro diretório novo, ambos PASS. Node22.23.2; PostgreSQL16 descartável, conexão loopback, bancos separados para líder/builders/críticos. Não há dado de paciente real.
5. Gates do líder usam o candidato final; `npm test` roda em segunda cópia idêntica sem TEST_DATABASE_URL; cobertura e gate PostgreSQL usam banco descartável. Saídas geradas/cache não entram no fingerprint de fontes.
6. Crítico final distinto dos builders executou regressões e matriz adicional; contexto não inteiramente fresco limita parecer a CONDITIONAL PASS. Experiência neutralizada somente na cópia do crítico. Sentinel: 2.659 arquivos, zero alterações.

Comandos principais: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run test:coverage`, `npm run test:postgres`, `npm run test:worker:startup`, `npm run test:e2e`. Logs e JSONs de exit code são preservados no manifesto final. A lista explícita de test:postgres agora inclui journey-task-atomicity.test.ts.

Cobertura segue o denominador de vitest.config.mts: exclui UI, bootstraps e diversos adapters SQL; não comprova sozinha os 95% críticos ou a barra AAA. O perfil de grants do preflight corresponde ao contrato SIU vigente nas tabelas críticas, não a uma auditoria exaustiva de todo catálogo SQL. Docker: acesso ao daemon negado; sem imagem construída. Sem produção, homologação, restore físico, mutação integral ou benchmark State of Art.

A configuração E2E permite reutilizar servidores fora de CI. A primeira execução atingiu outro aplicativo na porta padrão e falhou; o gate válido usa CVG_API_PORT/CVG_WEB_PORT exclusivos, CI=1 e retries=0 (6/6 PASS). Não atualizar baselines para mascarar falhas. Manifesto de fontes do snapshot fica preservado; registros operacionais/docs posteriores diferem intencionalmente. `product-delta.patch` usa bytes iniciais conferidos contra input-manifest.json.
