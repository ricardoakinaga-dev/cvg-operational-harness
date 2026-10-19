# SPEC 0208 — PARE100 execução e baseline T2

- Pedido atual: implementar integralmente 0376/0377/0378 com Gauntlet e orquestração. Objetivo permanece todos os 36 cartões/oito fases, não só esta rodada.
- Tasks desta fatia: P100-001/002, PDSH-031 e AUD0611-G03. Trilha T2: tooling, testes e thresholds; sem alterar contrato público/runtime/policy.
- Estado: BUILD_LOCAL_AUTHORIZED_T2 pelo pedido atual e D-12. A aprovação de uma SPEC T3 futura não é presumida por esta fatia.

## Recon e barreira

O HEAD ca565391 mantém o helper `sleep` sem uso no teste pdsh-031-slice3e1, e o modo per-file configura thresholds globais zero. O número alto de coverage observado não impõe o mínimo agregado. Corrigir ambos é pré-requisito concreto de P100-002.

## Contrato de implementação

1. Remover somente o helper não usado; conservar todos os testes e assertions. Confirmação de baseline por hash antes de integrar no root.
2. Implementar checker puro do relatório Vitest json-summary, exigindo statements≥90, branches≥85, functions≥90, lines≥90 e contagens válidas. Arquivo ausente, estrutura inválida, NaN, total/covered inconsistentes ou percentual impossível falham fechado.
3. Runner per-file executa Vitest com CVG_COVERAGE_PER_FILE=1, Node22, diretório de relatório próprio/fresco, preserva exit do filho e só aceita agregado após sucesso atual do filho e relatório do run. Não reutiliza coverage histórico, não altera threshold/config/source para obter green.
4. O mesmo run deve impor os quatro globs de 100% por arquivo já existentes e o mínimo agregado separado. O Lead liga o script público no package.json e integra CI na task apropriada; o Builder não edita manifest/lock compartilhado.
5. Tests de checker/runner devem rejeitar relatório conhecido-ruim, inexistente, obsoleto ou filho falho e aceitar fixture conhecida-boa. Não testar somente a presença de strings.

## Ownership e pronto

Builder A no worktree: scripts/run-core-coverage.mjs, scripts/coverage-thresholds.mjs, tests/coverage-thresholds.test.js e somente a remoção do helper em pdsh-031-slice3e1.test.ts. Lead: package.json, SPEC/evidência/ledgers, integração e gates amplos. Sem lockfile ou corpo de produção.

Pronto local: critérios C.P100-002 e QA.COVERAGE pelo caminho real, typecheck/lint/testes focados e coverage atual, PG/E2E do candidato, crítica I1 e integridade do baseline. P100-001 só fecha depois do gate completo; PDSH-031 conserva sua carteira original. Certificação completa só em candidata isolada limpa sob claim.

## Recuperação

Não descartar alterações root anteriores nem arquivos de outro agente. Integrar por arquivos próprios somente se os hashes root continuam iguais ao baseline; drift exige rebase da task e novo teste. Evidência do run fica em docs/04_audit/evidence/PARE100-EXEC-20261014/coverage e no diretório de reports próprio.

## Portabilidade documental desta rodada

Task Lead T1/T2: registrar separadamente três relocations exatas de links em cópias congeladas, preservando as vinte relocations HISO/hashes históricos e bytes dos relatórios. O teste deve verificar cada conjunto, unicidade, destino existente e SHA do snapshot registrado; target ausente permanece falha. Nenhum detector de fronteira/segurança muda.

## Inventário Git da candidata — buffer T2

Task P100-001/002: candidateFiles de scripts/ci-bar.mjs falha ENOBUFS antes de filtrar evidência quando git ls-files ultrapassa1MiB. Diagnóstico independente capturou1073144bytes e identidade com buffer16MiB. Fix limitado: maxBuffer16*1024*1024 nas duas execFileSync de inventário, mesmos argumentos/filtros/bytes/IDs; excesso continua falha, nenhuma lista truncada é aceita. Pronto: cinco testes existentes do finalizer rejeitam adulteração/scope/UUID como antes; buffer probe íntegro, type/lint/unit e gates desta rodada. Não há relaxamento de política ou mudança de contrato público.

## Fechamento local — 15/10/2026

P100-001 e P100-002 encerrados `DONE_LOCAL` após I1 independente ACCEPT_LOCAL, sem alteração dos critérios. Limpeza/backup348 e fonte integrada113 conferidos; gatesR4 e integraçãoRoot aprovados. [Parecer e limites](../04_audit/evidence/PARE100-EXEC-20261014/critic-baseline-closure-r1/review.md.source.txt). F-CLI-001 e imposição per-file no CI padrão permanecem em P100-050; nenhum fechamento PDSH/AUD, paridade integral ou release.

## F-CLI-001 — execução explícita de maxWorkers (R6)

Task `P100-050/F-CLI-001`, T2, BUILD local autorizado pela continuidade do programa e D-12. Recon: o runner acrescenta `--maxWorkers=2` antes dos argumentos normalizados; uma opção válida do usuário gera duas ocorrências e o Vitest real recusa antes dos testes. Escopo apenas runner e seus testes existentes, sem configurações, pisos, relatórios ou contratos de runtime.

Contrato: manter2 por omissão; uma opção maxWorkers válida explícita deve produzir exatamente uma ocorrência no argv final, com seu valor. Preservar a validação de opções, a recusa de flags de coverage/config/root/output/error suppression, a exigência de Node22 e as verificações de agregado, per-file, saída do filho e relatório fresco. Duplicata explícita inválida não concede fallback ou aprovação.

Pronto da subtask: reprodução RED antes da mudança; testes existentes preservados; caso padrão e opção explícita nos formatos suportados exercitados por CLI com Vitest real em fixture privada, resultado e hashes; typecheck/lint/testes focados e crítica independente do delta. Gates integrais de integração/PG/E2E/cobertura pertencem à candidata final, sem encerrar P100-050 ou mudar a barra36. Builder só runner/testes; Lead julga e integra.

## F-BUILD-001 — dados JSON no projeto composite de runtime (R8)

Task `P100-050/F-BUILD-001`, T2, BUILD local pela continuidade do programa e D-12. Recon: o build padrão tem resolveJsonModule/composite, mas só inclui src/**/\*.ts; a importação do dado session-event-schemas.v1.json causa TS6307. O build público separado já enumera JSON. Escopo somente scripts/build-runtime.mjs: incluir src/**/\*.json nos inputs de cada projeto gerado, mantendo lista de19workspaces, noEmitOnError, exclusões de testes, NodeNext, manifestos, cópia e recusa de contexto inseguro. Sem alteração de contrato, dependência ou lockfile.

Pronto da subtask: RED e GREEN no mesmo script real em cópia física isolada, Node22 e configs/context/TMPDIR/HOME próprios; verificar correspondência semântica entre JSON fonte e emitido, cada um com SHA próprio; contexto deve copiar o emit byte a byte e propagar alteração somente do JSON sintético na cópia; contexto inseguro continua recusado e testes/fonte não entram no contexto. Preservar falha inicial, parâmetros e todos os asserts existentes; crítica fresca do delta. Não testar apenas string/config nem executar build no W congelado. Gates globais da candidata, integração e imposição per-file continuam em P100-050.

Correção de medição R8: a fonteJSON tem6075bytes e a emissão TypeScript7515bytes, com valoresJSON idênticos. Exigir igualdade crua fonte/emit seria um oráculo impossível sobre o compilador vigente. Preservar hashes separados e validar emissão determinística/propagação e igualdade byte a byte entre emit e contexto. Nenhum piso, requisito funcional ou fronteira é removido.

## F-COV-CI-001 — enforcement padrão de per-file no CI/certify

Task `P100-050/F-COV-CI-001`, T2, continuidade autorizada e D-12; complementa a exigência já registrada de mínimos agregados e quatro globs neutros100% por arquivo. O caminho CI e o subgate coverage de certify não forçam CVG_COVERAGE_PER_FILE; uma variável0 herdada pode desativar o gate. No Vitest4.1.11 pinado, perFile é global para todos os conjuntos e o modo1 vigente zera os mínimos globais; sua combinação requer agregado separado. [Documentação4](https://v4.vitest.dev/config/coverage#coverage-thresholds-perfile) e implementação instalada sustentam o recon, sem upgrade.

BUILD somente nos dois drivers e testes próprios: forçar CVG_COVERAGE_PER_FILE=1 para CIcoverage/certify e phase10coverage, preservando demais variáveis e CVG_TEST_SCOPE; CIcoverage deve validar o relatório atual com validateAggregateCoverage existente além das guardas de escopo/freshness. Phase10 mantém test:coverage && coverage:critical && mutation:guard, incluindo agregado já exigido por critical. Não alterar globs, pisos, inclui/exclui, scripts de manifest, comandos, seals, schemas, versão de contrato, interpretação de outros gates ou dependências. Runner per-file e F-CLI-001 permanecem intactos.

Pronto da subtask: RED de flag padrão/0 antes do reparo, testes CLI reais de orquestração com producer sintético identificado e controles de aggregate/missing/malformed/scope/childfail; Vitest real deve rejeitar arquivo neutro abaixo100 mesmo com agregado bom e rejeitar agregado ruim mesmo com neutros100. Caso bom passa. Observar env do filho e o caminho real CI/coverage do drivercertify em fixtures privadas, com candidatos nãoqualificantes (demaisgates falhos/stubs), sem executar app ou efeito externo. Node22/typecheck/lint/foco e críticaI1 do delta, hashes/proveniência. PG/E2E/cobertura integral/certificação da candidata final continuam obrigatórios e não são substituídos por esses fixtures. Não encerrar P100-050 nem conceder release.

### F-COV-CI-001 R2 — vínculo com emissão atual

RevisãoI1 encontrou P1 herdado: a cópia do snapshot renova o mtime, portanto um relatório fonte histórico pode passar com filho exit0 que não o produziu. A exigência já existente de relatório atual continua. Antes de spawn somente no gate CIcoverage, remover o output gerado coverage/coverage-summary.json da execução anterior, com operação limitada ao arquivo/link e sem recursive; o produtor atual deve emitir o seu próprio relatório. Não mudar comandos, contratos/seals/schema, pisos, core, helpers, outros gates ou histórico de snapshots de outras execuções. Não inferir freshness por diferença de SHA: uma emissão atual com bytes idênticos é válida.

Critério R2: RED/GREEN com histórico bom de2000 e recente, flags ausente/0/garbage, filho0 sem emissão devefalhar/missing; emissão atual idêntica devepassar, filho7 preserva7 e outros gates conservam outputs antigos. Reexecutar regressão afetada, type/lint/format e críticaI1fresca; a prova nativaR1 é histórica para o driver CI R1 e não é transferida ao novo SHA sem reexecução afetada. Phase10 sem novo delta conserva a prova vinculada ao seu SHA. PG/E2E/certificação/cobertura integral e P100050 permanecem abertos. Nenhuma alteração de autoridade0220.

Resultado R2 —15/10: implementação permanece apenas no worktree. RED7FAIL/18PASS→161focoPASS/0skip/8arquivos, type/lint/formatPASS.10casos Vitest real atuais e I1fresco APPROVE_SCOPED_DELTA com25/25+15sondas, controles negativos7/19falhas contra drivers anteriores e16casos antigos preservados.657inputs/19369toolchain/1129outputs críticos revalidados peloLead semdrift;825sentinelas/465pins íntegros. [Aceite limitado](../04_audit/evidence/PARE100-EXEC-20261014/coverage-defaults-r2/lead-acceptance.json). R1REVISE permanece histórico. Não encerraT2 integral/P100050: integração e unit/PG/E2E/cobertura/certificação da candidata final pendentes; toycertify sempreNO_GO e0220humanaPENDING.
