from pathlib import Path
import json,hashlib,datetime
O=Path(__file__).parent; P=O.parent; R=Path('/home/ricardo/Área de trabalho/cvg-operational-harness'); D=P/'certification-r4-worktree'
def j(n):return json.loads((O/n).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest() if Path(p).is_file() else None
claim={'role':'critic I1 fresh-context','descendants':0,'mode':'audit-only','task':'original-criteria local closure P100-001/P100-002','readonly':[str(R),str(D),str(P/'worktree')],'exclusive_write':str(O),'authority':'explicit current user instruction; overrides repository ledger/claim writes','network':False,'real_environment':False,'database_or_services':False,'install_or_certify':False,'broad_tests':False}
(O/'claim.json').write_text(json.dumps(claim,indent=2,ensure_ascii=False)+'\n')
findings=[{'id':'F-CLI-001','severity':'LOW','blocking_local_closure':False,'confidence':'HIGH','title':'Optional --maxWorkers value duplicated by public runner','source':str(D/'scripts/run-core-coverage.mjs'),'lines':[121,122],'observed':'--maxWorkers=2 is added internally and allowed --maxWorkers=1 is appended; real Vitest 4.1.11 exits 1 before execution with Expected a single value ... [2, 1].','evidence':['real-good.stderr.log','real-good.stdout.log','focused-checker-runner.stdout.log'],'recommendation':'Resolve one worker-count option before spawning child; add real CLI regression. Preserve hard coverage options.','why_nonblocking':'Original P100-002 acceptance is current local quality gates; default unfiltered public runner succeeded and real negative coverage cases failed. Failure rejects execution and does not yield false success.'}]
limits=[
'CI default coverage does not itself select CVG_COVERAGE_PER_FILE=1: ci-bar contract invokes test:core --coverage; ci-bar env seals core scope but not per-file flag; verify.yml has no flag. R4 driver explicitly supplies flag=1. Acceptance is for this proven local baseline and protected test:coverage:per-file entry, not universal mandatory per-file enforcement in every CI/default certify invocation.',
'R3 unit terminated with SIGSEGV/139; unknown cause remains. R4 same candidateId passed. Neither erased nor diagnosed by this audit.',
'R4 unit retains 4116 PASS / 1 skip. PG021 supplement has 1 PASS in certification-r1-worktree with identical test hash, not a replacement R4 unit report or full-candidate R4 requalification.',
'983 historical baseline invariant applies to cleanup time. Current ROOT has 28 changed baseline paths, all within exact 113-path integration plan; current bytes are checked against D, not old baseline.',
'Other 113 integrated files are identified by hash only, not semantically approved wholesale. No full parity, PDSH-031/AUD closure, release, production, or Python218/R6 qualification is granted.',
'Whole-repository mutation fingerprint was not taken. Scoped before/after hashes cover 2487 relevant paths; 364 inspected inputs have a separate hash inventory. No operations wrote outside the authorized output directory.'
]
criteria=[
{'id':'C.P100-001.cleanup','source':'frozen scope/0378 P100-001; SPEC0207 ready','status':'PASS','evidence':'348 unique paths absent ROOT/D/W; 348 archive members/2060261 bytes match manifest SHA256; authorial declaration unchanged'},
{'id':'C.P100-001.integrity','source':'SPEC0207 ready; user temporal clarification','status':'PASS','evidence':'historical raw post-cleanup-integrity has 983/zero changes; 28 current differences are all in 113-path integration; all 113 match D and ROOT; 30/30 backups verified'},
{'id':'C.P100-001.T2','source':'frozen scope/0378 P100-001 ready','status':'PASS','evidence':'R4 type/lint/unit/PG/E2E raw reports verified; ROOT type/lint/boundary/SDK/platform builds exit0 and actual runtime/compiled smoke content checked'},
{'id':'C.P100-002.gates','source':'frozen scope/0378 P100-002 ready; SPEC0208','status':'PASS','evidence':'R4 16 gates PASS and logs bound; unit4116/1skip,PG302/0skip,E2E12/0skip; unused helper is sole diff in PDSH test'},
{'id':'C.P100-002.coverage','source':'frozen scope/0378 P100-002 ready; SPEC0208 clauses2-5','status':'PASS','evidence':'aggregate94.08/90.59/95.91/94.95; 50 covered core files100%; 81 focused tests; actual Vitest good control passes and each of four core bad cases rejects despite passing aggregate; successful Vitest with bad aggregate rejected by runner; certificate verifier rejects each bad dimension'},
{'id':'C.P100-002.scope','source':'frozen scope/0378 P100-002 ready; current user scope','status':'PASS','evidence':'cleanup rechecked; PDSH/AUD original statuses untouched; local-only decision; historical failures/skips preserved'}
]
raw=j('r4-raw-check.json'); sent=j('mutation-sentinel.json'); extra=j('additional-checks.json')
result={'schema_version':1,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'I1 fresh-context independent critic','descendants':0,'decision':'ACCEPT_LOCAL','tasks':{'P100-001':{'decision':'ACCEPT_LOCAL','may_close_as':'DONE_LOCAL'},'P100-002':{'decision':'ACCEPT_LOCAL','may_close_as':'DONE_LOCAL'}},'scope':'ONLY original local closure criteria; no integral parity acceptance','candidateId':raw['candidateId'],'criteria':criteria,'blocking_findings':[],'nonblocking_findings':findings,'limitations':limits,'checks_executed':['read-only source and raw evidence audit','348 backup-member hashes and path absence','113 D/ROOT integration identities and 30 preimage backups','R4 report assertion recount / 50-file core coverage / log-artifact hashes','actual verifyGateEvidence on R4 result/manifest returns []','isolated Node22 focused checker/runner suite81PASS','six isolated real Vitest V8 cases: good, four core-bad, aggregate-bad','four aggregate-dimension known-bad certificate checks','root raw smoke transcript and T1 logs inspection','2487-path pre/post hash comparison'], 'checks_not_executed':['no broad suite / coverage of actual project rerun','no PostgreSQL/E2E/services/network/env real','no install/certify/build of ROOT/D/W','no Python218 or R6 qualification','no parity measurement or release certification'], 'mutation_sentinel':sent,'evidence':{n:sha(O/n) for n in ['inputs-before.json','inputs-after.json','inputs-inspected.json','cleanup-check.json','integration-check.json','r4-raw-check.json','additional-checks.json','probe-results.json','certificate-negative-results.json','mutation-sentinel.json']},'repository_writes':False,'prior_builder_or_critic_acceptance_used_as_correctness_evidence':False,'recommended_next_action':'Lead may record DONE_LOCAL for only P100-001/P100-002; record optional CLI defect separately and retain all local/release/CI limitations.'}
(O/'result.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
review=f'''# Parecer I1 — fechamento local da baseline

**ACCEPT_LOCAL para P100-001 e P100-002; ambos podem encerrar `DONE_LOCAL` pelo critério original.** Não há achado bloqueante nesse escopo. A decisão não aceita paridade integral nem concede aprovação semântica a todo o código integrado.

Crítico fresh-context I1, sem descendentes e sem autoria da implementação. Auditoria somente leitura de ROOT/D/W. A escrita desta rodada ficou exclusivamente em `{O}`. Nenhum ledger, claim compartilhado ou código do projeto foi alterado; a restrição expressa do usuário prevaleceu sobre a atualização operacional usual. Relatos e decisões anteriores de builders/críticos não sustentam este veredito. `acceptance-r2.json` foi tratado como metadado de integração/classificação a conferir contra comandos, hashes e transcritos, não como aceite independente.

## Barra original e resultado

A barra foi extraída do snapshot `W/docs/04_audit/evidence/PARE100-EXEC-20261014/scope/0378_backlog_paridade_integral.md`, somente P100-001/002, e das SPECs0207/0208 do ROOT. Não houve ampliação para os36cartões/paridade integral, nem redução dos quatro globs ou dos pisos90/85/90/90.

| Critério | Resultado e observação objetiva |
| --- | --- |
| Remoção exata/reversível | PASS:348 paths únicos,2.060.261 bytes,348 membros do backup com tamanho e SHA256 corretos. Os348 continuam ausentes em ROOT,D,W. |
| Preservação | PASS: `vite-env.d.ts` mantém SHA256 `51efb1dfc2420acd736238634174a375c6f79052def2466c6a22f1ea1d8947fd`. O registro bruto pós-limpeza preserva983inputs sem mudança naquele momento. Hoje28dessespaths diferem; todos pertencem à integração113, portanto não são atribuídos à limpeza nem rejeitados por exigir a baseline antiga. |
| Integração | PASS:113/113paths do plano batem por SHA256 com D e ROOT;30/30preimages existentes têm backup íntegro. Isso prova identidade, não aprovação universal de comportamento. |
| Gates locais atuais | PASS:16gates doR4, todos com logs de hash correto; verificador real `verifyGateEvidence` retorna lista vazia de falhas. Unit4116PASS/1skip;PG302PASS/0skip;E2E12/0skip/0flaky, recontados nos relatórios brutos. |
| Lint/helper | PASS:diff entre backup pré-integração e testeROOT remove apenas o helper `sleep` não usado; assertions/corpo dos testes preservados. LintR4 e ROOT exit0. |
| Coverage agregado | PASS:statements94,08;branches90,59;functions95,91;lines94,95. Checker valida contagens/somas e relatório atual; certificado aplica `evaluateGlobalCoverage` independentemente do exit0 do Vitest. |
|100%porarquivo | PASS nos quatro globs e denominador existentes:contracts5,harness30,orchestrator4,agent-runtime11, total50arquivos, quatro dimensões100%. R4driver fornece explicitamente `CVG_COVERAGE_PER_FILE=1`. |
| IntegraçãoROOT em execução | PASS nos registros de type/lint/boundary/buildSDK/buildplatform. Smoke inicial é somente import; smoke runtime e compiled contêm turnoCOMPLETED,modelCalls1,toolCalls0 e seis eventos na ordem esperada. O compiled registra resolução pública para SDK/harness/contracts em `dist`, sem NodeOptions. |
| T1/registro | Logs do reparoT1 têm exit0, links/higiene sem erros. Este parecer fornece evidência para o Lead registrar o fechamento; não edita status de outras carteiras. |

## Verificações pequenas independentes

Executei em subárvore sintética deste output o Node22.23.2/Vitest4.1.11 já instalado, sem install, serviços, banco ou rede. Copiei runner/checker/teste e config; a única adição na config foi `cacheDir` local para manter caches aqui. Thresholds, include e exclude originais foram preservados. Links de dependências são somente leitura; `node_modules`/caches graváveis pertencem ao output.

A suíte focada original passou **81/81**, incluindo relatórios ruins/ausentes/stale/futuros/symlinks, contagens inválidas e preservação de exit/sinal do filho. Não a tratei como prova de instrumentação: executei mais seis casos com V8 real e o runner público copiado byte a byte. O controle bom passa. Cada um dos quatro pacotes, com arquivo a33,33%lines/50%functions/statements/branches, é rejeitado apesar do agregado ainda passar (98,26/98,33/99,09/90). No caso agregado ruim, o Vitest termina com sucesso por cumprir os globs100%; o runner então recusa16,66%statements/9,09%functions/13,04%lines. Logs e relatórios estão preservados em `real-default-*` e `probe-results.json`.

Também invoquei o módulo real do certificador sobre os artefatosR4: nenhum erro no controle bom. Em quatro cópias em memória, uma dimensão por vez foi reduzida a0 com contagens e hashes atualizados, preservando o exit0 bruto. O checker e o verificador real do certificado rejeitaram cada caso com `coverage_global_below_threshold:<dimension>`. Não basta confiar no exit0 bruto. Ver `certificate-negative-results.json`.

## Achado concreto não bloqueante

**F-CLI-001 — baixo, confiança alta:** `run-core-coverage.mjs` inclui internamente `--maxWorkers=2` e também permite encaminhar `--maxWorkers=1`. O Vitest real recusa a duplicação (`Expected a single value ... [2, 1]`) antes de executar. A primeira tentativa está preservada em `real-good.stderr.log`; não foi reclassificada como teste de coverage ruim. Repeti os controles sem esse argumento opcional, pelo caminho padrão, e obtive os resultados acima. A suíte com filho sintético não detecta essa incompatibilidade. Recomendo resolver a opção única e acrescentar regressão real da CLI. O defeito falha fechado; não falseia os gates locais ou o pronto original dos dois cartões.

## Limites que permanecem

O CI padrão **não seleciona automaticamente**100%porarquivo: `ci-bar-contract.mjs` chama `test:core --coverage`, `ci-bar.mjs` impõe escopo core mas não a flag per-file, e `verify.yml` não a define. O caminho `test:coverage:per-file` protege a flag e impõe ambos os pisos; o R4 efetivamente forneceu flag1. Portanto aceito esta baseline local comprovada, sem afirmar que qualquer invocação padrão deCI/certify esteja selada para100%porarquivo. A integração futura/geral doCI não foi incluída como novo requisito bloqueante do encerramento local original.

R3continuaFAIL porSIGSEGV/139, candidato `{raw['candidateId']}`, causaUNKNOWN. R4da mesma fonte passou; isso não diagnostica nem apaga oR3. Os4116PASS/1skip doR4 ficam intactos. O suplementoSKIP-PG-021 tem1PASS separado e testhash idêntico aoD; foi executado em `certification-r1-worktree`, não é um novo relatório unitárioR4 nem certificação integral daquele candidato.

Não reexecutei testes amplos, PG/E2E, certify ou builds do projeto. As evidências desses gates são os artefatos brutos preservados, validados por identidade e conteúdo. Este aceite não encerra PDSH-031/AUD, não prova paridade integral, não concede release, produção ou integrações reais. `CONDITIONAL_GO/AAA_CONTROLLED` permanece somente local. Python218 e R6 não recebem nenhuma evidência ou aceite deste parecer.

## Integridade e artefatos

`inputs-before.json` e `inputs-after.json`: **2.487paths monitorados, zero drift**, incluindo os348ausentes por árvore. O sentinel é de inputs relevantes, não um freeze de toda a árvore compartilhada. `inputs-inspected.json` lista364inputs com SHA256 e método; hashes das evidências derivadas constam no `result.json`. Inputs suplementares lidos após o snapshot principal receberam hashes próprios no inventário e serão reconferidos no encerramento. O arquivoXML deE2E e o manifesto crítico, não copiados no espelhoR4artifacts, foram lidos deD e seus hashes coincidem com o manifestoR4; não são evidência ausente.

Evidências reproduzíveis: `cleanup-check.json`, `integration-check.json`, `r4-raw-check.json`, `additional-checks.json`, `probe-results.json`, `certificate-negative-results.json` e scripts locais. Recomendo ao Lead registrar **somente P100-001/P100-002 comoDONE_LOCAL**, manter as limitações e tratarF-CLI-001 separadamente.
'''
(O/'review.md').write_text(review)
# Verify every semantically inspected input again, including supplemental ones.
ins=j('inputs-inspected.json'); drift=[{'path':p,'before':v['sha256'],'after':sha(p)} for p,v in ins.items() if sha(p)!=v['sha256']]
(O/'inspected-inputs-final-check.json').write_text(json.dumps({'count':len(ins),'drift':drift,'pass':not drift},indent=2)+'\n')
assert not drift
print('result',sha(O/'result.json'),'review',sha(O/'review.md'),'inspected final',len(ins),'no drift')
