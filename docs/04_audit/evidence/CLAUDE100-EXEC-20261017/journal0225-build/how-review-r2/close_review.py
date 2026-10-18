from pathlib import Path
import sys,json,hashlib,datetime,subprocess,os,difflib,re
R=Path(__file__).resolve().parent
H=lambda b:hashlib.sha256(b).hexdigest()
def save(n,o):(R/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
def log(argv,out,err='',code=0):
 d=R/'commands';save('commands/'+f'{len(list(d.glob("*.json")))+1:03d}.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':argv,'exitCode':code,'stdout':out,'stderr':err})
rows=json.loads((R/'before.json').read_text());after=[]
for x in rows:
 b=Path(x['path']).read_bytes();s=(R/x['snapshot']).read_bytes()
 after.append(dict(x,after_sha256=H(b),snapshot_sha256=H(s),unchanged=H(b)==x['sha256']==H(s)))
save('beforeafter.json',after)
drift=[x for x in after if not x['unchanged']]
assert all(x['path'].endswith('/docs/08_runtime/agent_coordination.md') for x in drift),drift
for x in drift:
 before=(R/x['snapshot']).read_text();current=Path(x['path']).read_text()
 ops=difflib.SequenceMatcher(None,before.splitlines(keepends=True),current.splitlines(keepends=True)).get_opcodes()
 assert all(op[0] in ['equal','insert'] for op in ops), 'nonadditive coordination drift requires inspection'
 (R/'sources/coord-after.source.txt').write_text(current)
 (R/'coord-concurrent.diff.source.txt').write_text(''.join(difflib.unified_diff(before.splitlines(keepends=True),current.splitlines(keepends=True),fromfile='coord before',tofile='coord after')))
 save('concurrent-drift.json',{'path':x['path'],'before_sha256':x['sha256'],'after_sha256':x['after_sha256'],'assessment':'Lead additive candidate-preparation claim; prior bytes/order preserved, no code/PG authority. HOW/task/freeze andR1 unchanged.','diff':'coord-concurrent.diff.source.txt','after_snapshot':'sources/coord-after.source.txt'})
r1after=[]
for x in json.loads((R/'R1-protected-before.json').read_text()):
 b=Path(x['path']).read_bytes();r1after.append(dict(x,after_sha256=H(b),unchanged=H(b)==x['sha256']))
save('R1-protected-beforeafter.json',r1after);assert all(x['unchanged'] for x in r1after)
obs=json.loads((R/'entry-inspection.json').read_text());T=json.loads((R/'sources/001-task.json.source.txt').read_text())
C=Path('/tmp/cvg-claude100-exec-20261017/runtime-build-closure-candidate')
post={'preimages':[],'protected':[],'git_blobs':[]}
for kind in ['preimages','protected']:
 for x in T[kind]:
  p=C/x['path'];exists=p.is_file();d=H(p.read_bytes()) if exists else None
  post[kind].append(dict(x,observed_exists=exists,observed_sha256=d,match=exists==x.get('exists',True) and d==x['sha256']))
for x in obs['git_blobs']:
 argv=['git','-C',str(C),'show',x['ref']+':'+x['path']];p=subprocess.run(argv,capture_output=True,env=dict(os.environ,GIT_OPTIONAL_LOCKS='0'))
 log(argv,p.stdout.decode(),p.stderr.decode(),p.returncode)
 post['git_blobs'].append(dict(x,after_sha256=H(p.stdout),unchanged=p.returncode==0 and H(p.stdout)==x['sha256']))
for key,args in [('HEAD',['rev-parse','HEAD']),('status',['status','--porcelain=v1','--untracked-files=all'])]:
 argv=['git','-C',str(C)]+args;p=subprocess.run(argv,text=True,capture_output=True,env=dict(os.environ,GIT_OPTIONAL_LOCKS='0'))
 log(argv,p.stdout,p.stderr,p.returncode);assert p.returncode==0;post[key]=p.stdout.strip() if key=='HEAD' else p.stdout
post['migration_inventory']=[p.name for p in sorted((C/'packages/persistence/migrations').glob('*.sql'))]
assert post['HEAD']==T['base_commit'] and post['status']=='' and post['migration_inventory']==T['migration_inventory']
assert all(x['match'] for k in ['preimages','protected'] for x in post[k]) and all(x['unchanged'] for x in post['git_blobs'])
save('entry-beforeafter.json',{'before':'entry-inspection.json','after':post,'all_unchanged':True})
criteria=[
 {'topic':'Autoridade e entrada local','assessment':'ALIGNED_DOCUMENTARY','how_lines':'3-20,101-106','contract':'decision16/10 bindingRule/migrationOrder; entryR1 lines61-124','source':['sources/005-spec-gates.json.source.txt','sources/006-entry-reconciliation.md.source.txt','sources/003-lead-review-acceptance.json.source.txt']},
 {'topic':'Fronteira nativa e queries bounded','assessment':'ALIGNED_DOCUMENTARY','how_lines':'24-45,65-74','contract':'adjustedSPEC sections4,5,7;J04,J05,J08,J12','source':['sources/004-adjusted-spec-proposal.md.source.txt:88-184,281-321','sources/017-operational-execution-postgres.ts.source.txt:1070-1245,1735-1857']},
 {'topic':'Codec e limites','assessment':'ALIGNED_DOCUMENTARY','how_lines':'49-58,91-93','contract':'adjustedSPEC sections4,5,11.1,11.2;J01-J04,J11,J12','source':['sources/004-adjusted-spec-proposal.md.source.txt:88-184,436-467','sources/024-complete-json.ts.source.txt:17-48']},
 {'topic':'Migration,guard,readiness','assessment':'ALIGNED_DOCUMENTARY','how_lines':'26-37,55-69','contract':'adjustedSPEC sections5,6,8;J05-J07,J13','source':['sources/004-adjusted-spec-proposal.md.source.txt:130-177,218-265,323-354','sources/020-0029_controlled_published_kernel.sql.source.txt','sources/018-postgres-migrations.ts.source.txt:20-50']},
 {'topic':'ProvasJ13/J16 e regressões','assessment':'ALIGNED_DOCUMENTARY_NOT_EXECUTED','how_lines':'13-14,86-105','contract':'adjustedSPEC J01-J13/J16 and minimal matrix;entryR1 support/closure conditions','source':['sources/004-adjusted-spec-proposal.md.source.txt:360-467','sources/006-entry-reconciliation.md.source.txt:71-81,113-124']},
 {'topic':'Escopo,pathset,proteções e orçamento','assessment':'MATCHED_STATICALLY','how_lines':'22-45,95-106','contract':'task11paths/9protections;entryR1 before-code conditions;separate future code-review unit','source':['sources/001-task.json.source.txt','entry-inspection.json','entry-beforeafter.json']}
]
conditions=[
 {'phase':'BEFORE_CODE','condition':'Lead records/activates source claim for the new isolated candidate/branch and its11paths; rechecks base/preimages, unchanged0029/loader and reserved0030 against fresh inventory; records copied dependencies/toolchain. This HOW review does not create candidate or resources.'},
 {'phase':'BEFORE_PG_PROVISIONING_OR_PROCESS_EXECUTION','condition':'Lead freezes executableJ01-J13/J16 matrix and runtime/source manifests; registers own synthetic PG/roles/schema/credentials/ports/resource limits/HOME-TMP-config-cache/cleanup and legitimate private fixture identity binding. Preserve path/hash/CWD/UID/mode/argv/Docker checks; no reuse of peer/PARE identities. These details remain a mandatory checklist, not evidence of completed execution.'},
 {'phase':'BEFORE_READINESS_ADMISSION_OR_CREDIT','condition':'Exclusive synthetic cutover, owner separation, immutable binding/receipt and original-reader42501/other required negatives must actually pass. J13 requires real0029/fences and both barriers; J12 requires real error/cleanup preservation and distinct capture/journal limits. No mock/helper or codec-only pass substitutes for public/native proof.'},
 {'phase':'BEFORE_CODE_ROUND_CLOSURE_OR_INTEGRATION','condition':'Scoped source must receive the separately planned code critique plus all mandatory proofs/regressions/currentT2/certification/verifier.43reds and all openP0 remain blocking; no pin/checker/skip weakening or inherited certificate. No PAR-DONE/promotion/release authority is granted by this review.'}
]
result={'task':T['task'],'review':'R2_FINAL_PREPARATION_SCOPED_HOW','reviewed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'ACCEPT_SCOPED_HOW','how_sha256':'0f2fd6f9ea52bac9e6a73bf59e582d27cfd2238bcf72012027027512373fbfdc','task_sha256':'917d416fc6f18dc0b1389bedfe2400a585333f0f7c12e9b5336ec166c649b7e9','adjusted_spec_sha256':T['adjusted_spec_sha256'],'entry_R1_sha256':T['entry_reconciliation_accepted_sha256'],'R1_reopened':False,'mandatory_findings':[],'mandatory_count':0,'assessments':criteria,'informational_findings':[{'id':'R2-I01','severity':'INFO','criterion':'Authority status wording only','source':'sources/000-short-how.md.source.txt:5-6; sources/003-lead-review-acceptance.json.source.txt','finding':'HOW introduction still says entry reconciliation is under review; authenticated R1/Lead receipt already accepts it. Conservative stale wording grants no authority and is not a material HOW divergence. No rework or third preparation review required for this note.'}],'external_conditions':conditions,'acceptance_means':'Concrete technical blueprint fits existing approved scope. It is not code/SQL/runtime/test/resource execution or a new human approval.','BUILD_allowed_now_by_review':False,'PG_provisioning_allowed_by_review':False,'functional_credit':0,'promotion_allowed':False,'new_human_authority':False,'integrity':{'source_artifact_files':len(after),'unchanged':sum(x['unchanged'] for x in after),'concurrent_drift':drift,'preimages_match':11,'new_paths_absent':9,'protected_match':9,'freeze_match':3,'git_blobs_unchanged':3,'R1_artifacts_preserved':len(r1after)},'execution':{'target_import_or_execution':0,'tests_build_SQL_PG_Docker_network_install_provider_process_resources':0,'descendants':0,'source_or_R1_or_ledger_edits':0},'limitations':['Static documentary review only; all implementation andJ-test results remain unobserved/NOT_RUN here.','Queries,SQL guard bodies,readiness implementation and complete fault-propagation paths do not exist as reviewed code yet; promises in the HOW are obligations,not proven runtime behavior.','Resource/credential/role/port/runtime manifest details legitimately remain before-provisioning checklist items.'],'budget':{'preparation_reviews_used':2,'preparation_reviews_remaining':0,'future_code_review':'distinct unit explicitly planned by Lead,not started/consumed here'},'next_action':'Lead closes preparation and completes applicable entry/source/resource checklist; any subsequent code review is the distinct planned unit. No further preparation review is implied.'}
result['informational_findings'].append({'id':'R2-I02','severity':'INFO','criterion':'Concurrent coordination bookkeeping only','source':'concurrent-drift.json;coord-concurrent.diff.source.txt;collector-attempt1.json','finding':'Lead added a candidate-preparation claim during collection, explicitly without code until accepted HOW/checklist. Existing coordination content, HOW/task/freeze/source andR1 remain preserved. This is not implementation evidence or mandatory HOW rework.'})
save('result.json',result)
report="""# R2 final — HOW concreto da SPEC0225

**ACCEPT_SCOPED_HOW — zero divergências materiais obrigatórias.** Aceite do blueprint no SHA-256 `0f2fd6f9ea52bac9e6a73bf59e582d27cfd2238bcf72012027027512373fbfdc`, com task `917d416f…`. A interpretação R1 permanece aceita e intocada; esta revisão não a reabre. Não se aprova execução de BUILD/SQL/PG, código, estado funcional, promoção ou créditoPAR.

Task `C100-FND-JOURNAL-0225-BUILD-001`. Segunda e última revisão de preparação deste orçamento. Nenhum descendente; crítica de código futura é unidade distinta, explicitamente planejada no HOW/task. Não se cria R3 ou ciclo de retrabalho adicional.

## Escopo e autenticidade

Foram confrontados [HOW](sources/000-short-how.md.source.txt), [task](sources/001-task.json.source.txt) e [freeze](sources/002-how-freeze-r1.json.source.txt) contra a [cópia ajustada0225f26c](sources/004-adjusted-spec-proposal.md.source.txt), a [decisão16/10](sources/005-spec-gates.json.source.txt) e a [entradaR1](sources/006-entry-reconciliation.md.source.txt), com seu [aceite peloLead](sources/003-lead-review-acceptance.json.source.txt). A aprovação humana continua vinculada ao original04b92ba4 e somente aos ajustes listados; não há extensão silenciosa a0226/0238, operação mista, hosts ou produto.

[Inspeção independente](entry-inspection.json):3arquivos do freeze exatos;11paths únicos/disjuntos das9proteções, todas as pré-imagens e proteções conferidas. Nove paths novos continuam ausentes; os dois existentes são o adapter nativo e o loader. Base `2f0cc11f7bdda82456f069ac7cc8914cb5335c57` limpa, SQL0029 e registro no loader presentes; inventário completo igual ao da task, sem0030/0031. Os objetos Git0029/loader/builder correspondem aos arquivos de trabalho. Isso prova identidade de fonte, não aplicação de migration ou funcionamento.

## Avaliação do desenho

| Tema | Confronto com o contrato aprovado |
| --- | --- |
| Fronteira e queries | HOW24–45/65–74 mantém o journal PostgreSQL nativo, opção explícita congelada e default legado; codec interno sem barrel público. Detecta legado/expandido/ativado antes de projetar e exige supressão SQL de payload oversized antes do parserJSONB, com overflow distinto de ausência emget/reserve/transitions/RETURNING. Isso corresponde à SPEC§4/§5, linhas88–184; não permite SELECT ilimitado seguido de rejeição só emJS. |
| Codec e limites | HOW49–58/91–93 conserva JSON estrito e canonicalizador existente com parâmetros explícitos1048576/64/root1/1000000. Envelope/quatro campos, ASCII1398104, expandido1398616, SHA/length/base64, UTF-8 fatal/semBOM, scan lexical e recanonicalização seguem§4/§5. Output1MiB e ToolResult8MiB permanecem fronteiras distintas; checkpoint8MiB/contexto32KiB e prova de nós por componente permanecem§11.1/§11.2. |
| Migration/guard | HOW26–37/55–64 escolhe0030 aditiva depois de0029, sem tocar0016/0029/checksums/backfill. Duas colunas e versão imutável preservam0/NULL, payload1 apenasCONFIRMED e atomicidade. Expansão nega1; guard migration-owned SECURITY INVOKER recebe schema/principal confiáveis quotados e binding fixado pelo owner, sem nova tabela de autoridade/GUC/SECURITY DEFINER. É a solução já escolhida em§5/§6.1/§8, não novo desenho de segurança. |
| Readiness e legado | HOW29–34/59–69 verifica schema/role/ACL/guard no mesmo client e identidade por conexão, sem cache cruzado de tenant/schema/role. Principal dedicado sem memberships/super/bypass/ownership/DDL; original-reader resolve tabela viaUSAGE e deve obter42501. Opt-inget0 inspeciona sem adoção;reserve/transitions0 recusam órfão/FAILED/proposal igual, default recusa1. Mantidas as barreiras de§6/J05–J07. |
| Transações/fences | HOW43–45/70–74 preserva composição nativa e lock/recheck/lease antes da escrita. Confirmação repetida exige bytes/hash iguais, sem demoverCONFIRMED ou transformar ACK perdido emretry seguro. A base mostra as portas nativas relevantes no adapter linhas1070–1245/1735–1857. O HOW modifica o adapter dentro do pathset e não reivindica que os helpers atuais já implementemV1. |
| Provas/regressões | HOW13–14/86–105 e task conservamJ01–J13/J16 e só adiamJ14/drill completoJ15. J13 requer triggers/fences0029 reais; positivo unbound não basta. NUL vermelho, PID novo/SIGKILL nos crashpoints distintos, contadores/frames/receipts, J07 isolado e J12 separado permanecem. J16/gates atuais e43reds/P0 não são dispensados; não há repin/checker/skip nem transferência de certificado. |
| Escopo |11paths ficam em persistence:3módulos internos, adapter/loader,0030,4suítes e fixture. Proteções impedem alteração de0016/0029, storepublished, capture/checkpoint/contracts/manifests/lock/checker. A opção comfence na composição sintética não ativa constructorpublished nem autoriza produto/SDK/hosts ou capacidades adicionais. |

O HOW é uma proposta suficientemente delimitada para o contrato existente. Não há obrigação de trazer nesta revisão todos os corpos SQL/queries ou detalhes de infraestrutura ainda não provisionada. Também não se presume que o blueprint tenha implementado qualquer um deles. O [canonicalizador primário](sources/024-complete-json.ts.source.txt), linhas17–48, oferece parâmetros explícitos; isso sustenta a escolha de reutilização sem editarcontracts, não comprova o codec novo.

A promessa de preservar erro primário/cleanup/markUncertain é obrigação de§7/J12, ainda sem prova. A leitura do [wrapper nativo](sources/029-effect-journal.ts.source.txt), linhas372–418, mostra a composição confirm→catch→markUncertain; portanto não se transfere ao código futuro qualquer PASS de propagação de causa só por manter o wrapper. As provas têm de discriminar essa fronteira. Não foi demonstrada, por inspeção do HOW, uma escolha que exija violar seus paths ou enfraquecer o contrato; eventual necessidade de alterar fonte protegida deve ser reconciliada antes da edição, como o próprioHOW102 exige.

## Obrigatórios e observação

**Obrigatórios: nenhum.** O [resultado estruturado](result.json) mantém fontes e avaliações por tema.

**R2-I01 · INFO · status de autoridade:** HOW5–6 ainda diz que a entrada está em revisão; o reciboLead e aR1 já registramACCEPT. A redação é conservadora e desatualizada, sem ampliação de autoridade ou divergência material do HOW. Não exige retrabalho nem terceira revisão de preparação. A decisão desta R2 usa os registros autenticados.

**R2-I02 · INFO · coord concorrente:** o Lead acrescentou claim de preparação da candidata, sem código até HOW aceito/checklist. O [diff](coord-concurrent.diff.source.txt) é somente aditivo e preserva o conteúdo anterior. O [primeiro coletor](collector-attempt1.json) parou preventivamente nesse drift; [antes/depois](concurrent-drift.json) mantêm a baseline e a autoria externa. Não é execução demonstrada nem divergência material do HOW.

## Condições externas mantidas

1. **Antes de código:** Lead efetivar claim de fonte da candidata/branch nova e11paths; revalidar base, pré-imagens,0029/loader e reserva/inventário0030; registrar dependências físicas/ferramentas. Aceitar este HOW satisfaz a avaliação do desenho; não cria a candidata nem conclui esse checklist.
2. **Antes de provisionar PG ou executar processos:** congelar matriz executávelJ01–J13/J16 e manifestos runtime/fonte; registrar recurso sintético próprio, roles/schema/credenciais/portas/limites/HOME-TMP-config-cache/cleanup e binding legítimo da fixture. Conservar checks path/hash/CWD/UID/mode/argv/identidadeDocker; nenhum root/argv arbitrário, containerPARE ou identidade alheia. Esses detalhes podem ser concluídos no checklist previsto, sem inventar execução ou novo requisito de contrato.
3. **Antes da admissão/prova:** cutover exclusivo sintético, owner separado, binding/recibo imutáveis e negativos originais42501/J05–J07 devem passar de fato. Queriesbounded, causa primária, ambas as barreirasJ13 e todas as fronteirasJ12 exigem prova real no ponto correspondente; blueprint/codec isolado/mock não a substitui.
4. **Antes de encerrar rodada/integrar:** crítica de código da unidade distinta planejada, todos os aceites/regressões/gatesT2/certificação/verificador atuais sobre a fonte exata.43reds eP0 continuam bloqueantes enquanto abertos; não enfraquecer pins/checker/seleções nem herdarPASS. Os aceitesPAR dependentes e limites humanos permanecem os daR1; nenhumDONE ou promoção é concedido aqui.

## Evidência, preservação e limites

Somente leitura de fontes/textos/JSON e Git read-only, com hashes e conferência de inventário. Nenhum target/import, teste, BUILD, SQL, PG, Docker, rede, instalação, provider, conta ou recurso de processo foi executado/criado. Escrita somente neste how-review-r2; coord/ledgers/state e fontes permanecemreadonly. Leituras iniciais estão no histórico da ferramenta; a coleta posterior registra stdout/stderr emJSON emcommands, sem criar streams vazios.

[Antes/depois](beforeafter.json):30inputs observados:29 idênticos, incluindo HOW/task/freeze, autoridade e fontes; o único drift é o adendo concorrente de coord documentado acima, sem alteração dos bytes anteriores. [Entrada antes/depois](entry-beforeafter.json):11pré-imagens,9proteções, inventário/base limpa e3objetosGit preservados. [139artefatosR1](R1-protected-beforeafter.json) preservados por hash; verificação de integridade somente, sem reabrir sua avaliação. A nova revisão não altera a interpretação aceita nem seus congelamentos.

Todos os resultados de implementação, SQL aplicado, readiness/ACL efetiva, testesJ e recursos futuros permanecemNOT_RUN/não observados nesta lane. As avaliações acima são de fidelidade do HOW; não são evidência de comportamento. [Manifesto](manifest.json) cobre todos os artefatos próprios, exceto ele mesmo e seu digestSHA256.

Próxima ação: Lead encerrar a preparação e completar os checklists aplicáveis; a futura crítica de código é a unidade distinta já planejada. Orçamento de revisão de preparação2/2 encerrado, sem revisão adicional implícita.
"""
(R/'REPORT.md').write_text(report)
# Only our data artifacts are parsed; no target imports or tests.
for p in R.rglob('*.json'):
 if p.name!='manifest.json':json.loads(p.read_text())
broken=[u for u in re.findall(r'\[[^\]]+\]\(([^)]+)\)',report) if u!='manifest.json' and not (R/u).exists()]
assert not broken,broken
out=json.dumps({'verdict':'ACCEPT_SCOPED_HOW','mandatory':0,'unchanged_inputs':sum(x['unchanged'] for x in after),'concurrent_coord_drift':len(drift),'R1_artifacts_preserved':len(r1after),'preimages_match':11,'protected_match':9,'git_blobs_unchanged':3,'new_empty_files':0},ensure_ascii=False)+'\n'
log(sys.argv,out)
files=[]
for p in sorted(R.rglob('*')):
 if not p.is_file() or p.name in ['manifest.json','manifest.sha256']:continue
 b=p.read_bytes();assert b;files.append({'path':str(p.relative_to(R)),'bytes':len(b),'sha256':H(b)})
save('manifest.json',{'algorithm':'SHA-256','scope':'all how-review-r2 artifacts','excluded':['manifest.json','manifest.sha256'],'files':files})
(R/'manifest.sha256').write_text(H((R/'manifest.json').read_bytes())+'  manifest.json\n')
print(out,end='')
