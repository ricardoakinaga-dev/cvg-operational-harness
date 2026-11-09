# SPEC0261 — Reuso de unitários e medição de cobertura no mesmo job

Proposta T3, r3 (correção documental M01 após replanejamento explícito do Lead). Task `CLOSE-CI-LOCAL-20261023:C03`, contribuição à U02 da carteira 0399. Nenhum BUILD de reuso autorizado. Não altera a SPEC0255 nem transfere a aprovação humana dela.

O [anexo normativo r3](0261_ci_same_job_certification_reuse_annex.md) integra o contrato: fecha ambiente, argv, schemas, versões, rota de bytes e denominadores. Os dois documentos são congelados por hash no pacote de revisão; nenhum desses pontos fica delegado ao BUILD. Em divergência descritiva, prevalece o anexo.

## 1. Problema e fonte observada

Na fonte `9a56a9c94db3e46291f2ba1de002763eee89ff39`, a Verify executa unitários e cobertura antes do `certify`, que executa ambos outra vez. `CVG_TEST_SCOPE=core` é imposto inclusive dentro do certifier: os comandos escritos diferem, mas não se deve afirmar que a segunda passagem inclui o produto. A equivalência depende da configuração e do ambiente, não só das contagens.

Recon reproduzível: [relatório do scout](../04_audit/evidence/CLOSE-CI-LOCAL-20261023/ci-reuse-scout/REPORT.md), 42 fontes pinadas; manifesto `82964c531e789bde966adc1d30f3daba16fcc277078df3e7cef34bea98b955e2`, conferido pelo Lead. `ci-bar` tem 35 gates, 34 selados; o contrato atual é `hiso-010-v1-core-sealed`. A fonte contém limiares agregados 90/85/90/90 e pisos por arquivo do núcleo neutro de 100%, além da cobertura crítica de branches de 95%. O novo modo preserva todos.

## 2. WHAT e recorte

Remover somente duas execuções amplas repetidas na CI: unitários e **medição** V8 de cobertura dentro do `certify`. Os resultados são os de produtores anteriores bem-sucedidos no mesmo job, run e tentativa, sobre a mesma fonte e perfil. Não é cache entre runs, jobs ou revisões.

`coverage:critical` e `mutation:guard` continuam executados nativamente dentro de `certify`, além dos gates externos já existentes. PostgreSQL, E2E, chaos, segurança, findings, closures, SBOM, licenças, drift, decisões e proveniência continuam obrigatórios e sem reuso nesta fatia. Plain `npm run certify` continua nativo por padrão.

Decisão semântica solicitada ao usuário: a medição anterior é a que qualifica esta candidata. Não alegar que ela observou o estado posterior do banco após todos os gates. PostgreSQL/E2E continuam observações nativas posteriores. Se for necessária uma segunda observação da suíte inteira, esse perfil deve continuar nativo.

## 3. Fronteira de confiança

Adversário: escritor dos arquivos de evidência depois da execução do produtor, capaz de substituí-los e recalcular hashes. Produtor revisado, runner e serviço GitHub são confiáveis, conforme SPEC0147. Não se promete resistência a runner comprometido.

As âncoras esperadas vêm exclusivamente dos outputs dos steps GitHub anteriores, nunca de arquivo controlado pelo adversário. Consumidor e verificador recebem `CI_CERT_REUSE_STEPS_JSON=${{ toJSON(steps) }}`. Validar apenas os predecessores fixos `runtime`, `install`, `unit` e `coverage` na fase de consumo; a finalização mantém a verificação completa de todos os 34 seals e 35 gates. O receipt de consumo sozinho não autentica seu produtor.

O modo opt-in é `CI_CERT_REUSE_MODE=same-job-v1`. Fora de GitHub Actions confiável, ou com modo presente sem todas as âncoras, recusar explicitamente. Não fazer fallback silencioso para arquivos históricos ou fabricar uma execução nativa. Falha não apaga o motivo original; nova execução nativa é outra execução registrada.

## 4. Perfil de medição e identidade

Um perfil versionado fixa, separadamente para unit e coverage:

- repositório, workflow/ref/path, job, run ID, run attempt, `GITHUB_SHA`, `git HEAD` e candidate ID; os dois identificadores de fonte são necessários;
- argv completo direto pelo Node, expandindo `test:core` com o reporter bound e o output fixo; os arrays exatos e a diferença `--coverage` estão no anexo B. Não usar shell ou wrapper npm no modo v2;
- cwd/root e hashes dos scripts expandidos, config Vitest/Vite, manifesto crítico, skip catalog e lockfile;
- versões reais Node/npm/Vitest/V8 coverage, hashes dos executáveis/entry points de medição e receipt do install confiável;
- escopo `core`, exclusão `products/`, globs de fontes/testes, limiares e inventários completos;
- ambiente relevante explícito: `CI=true`, `CVG_TEST_SCOPE=core`, `CVG_COVERAGE_PER_FILE=1`, `NODE_ENV=test`, variáveis Vite da identidade e do perfil controlado, perfil de userns/bubblewrap e PostgreSQL descartável. Estes defaults são alinhados no produtor e consumidor; qualquer override não previsto para flags de teste/config/coverage é recusado, incluindo `NODE_OPTIONS`;
- serviço PostgreSQL: servidor/porta/database/user, versão e `pg_postmaster_start_time()` capturados por conexão real no produtor e novamente no consumo. `PHASE4A_DISPOSABLE_PG=1` é obrigatório. Troca de serviço/epoch/perfil recusa. O conteúdo do banco não é congelado nem alegado idêntico.

Não persistir URLs com senha, valores de segredos nem hashes de segredos de baixa entropia. A projeção de conexão remove credenciais e parâmetros sensíveis; o papel e a disponibilidade são conferidos pela conexão real. Segredos de autenticação do serviço não são parte da alegação de equivalência dos testes.

O perfil e sua projeção de ambiente passam a ser outputs selados dos produtores. Uma igualdade de contagens, nome de script, mtime ou candidate ID isolado não basta. A lista completa, allowlist e probes estão fechados no anexo B–D antes da T3. O BUILD apenas materializa esses schemas em JSON. Input novo de autoridade exige delta de SPEC e nova revisão, antes de prosseguir.

## 5. Receipt e ciclo dos arquivos

Schemas fechados Producer, Consumer, Profile, InstallReceipt, Discovery, seals v2 e envelope phase10, bem como caps e paths exatos, estão no anexo A–E. O receipt de consumo tem kind `cvg-certification-measurement-reuse-v1`; nenhuma chave extra, duplicata, coerção ou identidade divergente é admitida. Relações produtor/consumidor e ponte de confiança à atestação são normativas.

Antes de executar, cada produtor invalida suas saídas canônicas antigas. Depois do exit0 e da validação original, captura snapshots sob `CI_ARTIFACT_DIR/gate-outputs/{unit,coverage}/`. Fontes do reuso são esses snapshots e os logs originais selados, não os paths de workspace que gates seguintes podem sobrescrever.

O certifier autentica e lê os bytes antes de apagar suas saídas antigas. Retém os buffers autenticados para parsers/critical coverage e publica mirrors verificáveis em paths fixos `certification/reuse/{unit,coverage}/`. Valida hashes após copiar e novamente na finalização. Substituição entre validação e uso deve falhar ou ser incapaz de mudar o buffer consumido; nenhum PASS sobre bytes diferentes do seal.

Logs derivados declaram `# gate`, `# runId`, `# candidateId`, comando real produtor e consumidor e `# origin=REUSED_MEASUREMENT`; preservam o log bruto original em arquivo separado, por hash. O parser não confunde receipt de importação com nova execução de teste. Reconciliar resultado, contadores do JSON e log bruto; falhas, interrupções, TODO/unknown ou skips não admitidos recusam.

## 6. Cobertura, skips e proveniência final

Reutilizar todas as entradas da medição, não apenas `total`. Conferir inventário de fontes e percentuais/contagens; executar cobertura crítica sobre os mesmos bytes autenticados e mutação nativa. Não baixar nem remover piso por arquivo ou grupo crítico.

Após os gates nativos PG/chaos/E2E, reconstruir o skip inventory final a partir do unit JSON importado e dos relatórios nativos novos. Nunca importar o skip inventory anterior como se cobrisse os novos relatórios. Contadores e catálogo continuam vinculados à fonte.

Novo contrato selado `hiso-010-v2-core-same-run-reuse-sealed`, com mesmos IDs/35 gates/34 seals e escopo. A versão e os receipts são verificados também no código independente do job de atestação: relações entre produtor/consumidor, origem, hashes e step outputs. O verificador final recusa mapas parciais, recibos forjados e contratos desconhecidos. `Provenance policy` e a verificação da bundle/workflow/source digest continuam exigidas.

Verificação local de qualificação atual que encontre reuso sem contexto de âncoras confiáveis recusa. Artefato baixado só é promovível pela cadeia de manifesto/bundle externamente verificada. Modo histórico nunca promove reuso antigo a qualificação atual. Novo path gerado precisa de exclusão explícita nos dois coletores de candidata e de inclusão no inventário de evidência; exclusão não pode esconder fonte/config/teste.

## 7. Escrita prevista e compatibilidade

Após T3 e claim de BUILD, além dos adapters/reporters e paths adicionais do anexo F: `.github/workflows/verify.yml`; `scripts/ci-bar{,-contract,-provenance}.mjs`; novo `scripts/lib/ci-certification-reuse.mjs`; `scripts/phase10-{certify,verify}.mjs`; `scripts/lib/{certification-rules,test-log-summaries}.mjs`; testes focais de workflow/contract/bootstrap/provenance/certification/reuse. Nenhuma dependência, lockfile, runtime de aplicação, produto, threshold ou proteção de branch muda.

0260 é alteração de agendamento independente, não dependência do protocolo. O limite de certify de 150min do PR24 é decisão já aprovada e continua limitado. Não alterar histórico/certificados selados existentes; novo contrato é obrigatório para novo modo. Caminho nativo continua compatível com sua versão atual.

## 8. Aceites observáveis

| ID  | Critério e controle que deve falhar                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Fluxo positivo no mesmo job/tentativa/fonte/perfil preserva vereditos; spy de integração observa exatamente duas suítes amplas totais, unit e coverage externos. |
| R02 | Sem opt-in, `certify` continua nativo; sem âncoras, opt-in falha antes de apagar evidência.                                                                      |
| R03 | Variar separadamente repo/workflow/job/run/attempt/SHA/HEAD/candidate/escopo invalida receipt, mesmo com hashes/contagens iguais.                                |
| R04 | Substituição coerente de JSON/log/state e rehash é recusada contra step outputs originais; receipt do consumidor não basta.                                      |
| R05 | Arquivo antigo tocado, link/traversal, extra/duplicata, truncamento, limite ou JSON inválido recusam; preservar prova de falha.                                  |
| R06 | Mudança de argv/config/lock/toolchain/ambiente e serviço/epoch recusa; não aceitar filtros ou override de piso.                                                  |
| R07 | Métricas são rederivadas dos relatórios brutos; mismatch JSON/log, failure/unknown/interrupção e skip não admitido recusam.                                      |
| R08 | Cobertura abaixo do agregado, de qualquer piso por arquivo ou de grupo crítico recusa; mutante sobrevivente/timeout/erro recusa.                                 |
| R09 | `coverage:critical` e `mutation:guard` executam nativamente no certifier; PG/E2E/chaos e demais gates continuam executados.                                      |
| R10 | Skip inventory final inclui relatórios nativos novos e unit importado; relatório antigo de PG/E2E não é aceito.                                                  |
| R11 | Troca entre validação e uso não muda bytes consumidos sem recusa; teste adversarial no ponto de consumo e na finalização.                                        |
| R12 | 35 gates/34 seals, escopo e cinco checks preservados; atestação e verificação independentes validam relações produtor/consumidor no HEAD real.                   |

Node22, tipos/lint/formato, regressões de contratos/proveniência/cobertura/mutação, PG/E2E e certificação integral do candidato composto são obrigatórios antes de merge. Checks locais não substituem CI/atestação remota. Ganho de tempo é medido antes/depois, sem prometer percentual por contar launches.

## 9. Gates e estado

Trilha T3 porque muda a origem e o significado da evidência de certificação. Exige crítica técnica independente sem obrigatórios e revisão explícita do usuário presa ao SHA-256 antes de BUILD. Sem aprovação herdada da SPEC0147/0170/0255. O plano de BUILD executará o perfil/contrato fechado aqui e no anexo; não decidirá novamente schemas, ambiente, denominador ou fonte dos bytes. A T3 cobre também a captura bound de PG/chaos/E2E e JUnit derivado, preservando suas execuções nativas e todos os casos de teste.

Estado: `DRAFT_FOR_M01_CONFORMANCE_R3`. R1 recebeu REVISE com quatro obrigatórios; o anexo rastreia F01–F04. R2 apontou somente M01: faltavam dois paths de inventário na allowlist. O Lead replanejou uma correção documental finita, com os schemas/edges explícitos no anexo E e G. A conferência M01 é contabilizada como terceiro veredito/segundo reparo; não reinicia a revisão ampla nem transfere APPROVE da r2. Outro obrigatório exige decisão humana, sem quarta automática. Recon e HOW proposto não fecham C03/U02, e nenhum resultado de CI atual demonstra essa capacidade. Rollback por PR desativa o opt-in e reemite qualificação nativa; não reetiquetar receipts antigos nem apagar a falha. Release/deploy em produção continuam gates separados.
