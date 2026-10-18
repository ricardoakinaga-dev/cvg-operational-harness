from pathlib import Path
import sys,json,hashlib,subprocess,os,datetime
R=Path(__file__).resolve().parent
H=lambda b:hashlib.sha256(b).hexdigest()
def save(p,o):(R/p).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
def log(argv,out,err='',code=0):
 d=R/'commands';save('commands/'+f'{len(list(d.glob("*.json")))+1:03d}.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':argv,'exitCode':code,'stdout':out,'stderr':err})
blobs=json.loads((R/'git-blobs-before.json').read_text());after=[]
for x in blobs:
 argv=['git','show',x['ref']+':'+x['path']];c=subprocess.run(argv,capture_output=True,env=dict(os.environ,GIT_OPTIONAL_LOCKS='0'))
 log(argv,c.stdout.decode(),c.stderr.decode(),c.returncode)
 after.append(dict(x,after_sha256=H(c.stdout),unchanged=c.returncode==0 and H(c.stdout)==x['sha256']==H((R/x['snapshot']).read_bytes())))
save('git-blobs-beforeafter.json',after)
rows=json.loads((R/'hash-before.json').read_text());checks=[]
for x in rows:
 b=Path(x['path']).read_bytes();s=(R/x['snapshot']).read_bytes();checks.append(dict(x,after_sha256=H(b),snapshot_sha256=H(s),unchanged=H(b)==x['sha256']==H(s)))
save('hash-beforeafter.json',checks)
drift=[x for x in checks if not x['unchanged']]
assert all(x['unchanged'] for x in after)
assert all(x['path'].endswith('/docs/08_runtime/agent_coordination.md') for x in drift),drift
for x in drift:
 before=(R/x['snapshot']).read_bytes();current=Path(x['path']).read_bytes()
 assert current.endswith(before), 'coordination mutation was not purely additive prefix'
 (R/'sources/coordination-after.source.txt').write_bytes(current)
 save('concurrent-drift.json',{'path':x['path'],'before_sha256':x['sha256'],'after_sha256':H(current),'assessment':'Additive prefix for unrelated C100-BUILD-CLOSURE-HYGIENE claim; all prior bytes and primary user attribution remain intact. No reviewer write.','diff':'coordination-concurrent.diff.source.txt','after_snapshot':'sources/coordination-after.source.txt'})
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
criteria=[
 {'id':'ER01','assessment':'SATISFIED_DOCUMENTARY','sources':['sources/005-spec-gates.json.source.txt:5-6,51-63','sources/GIT-a72422be-postgres-migrations.ts.source.txt:20-50','independent-primary-observations.json','documentary-inspection.json'],'rationale':'Frozen hashes/pairs authenticated; persistent a724 clean and registered0029; current candidate divergence recorded as informational.'},
 {'id':'ER02','assessment':'SATISFIED_DOCUMENTARY','sources':['sources/005-spec-gates.json.source.txt:5-6,56-61','sources/008-0379_roadmap_paridade_100_deepseek.md.source.txt:95,99','sources/009-0380_backlog_paridade_100_deepseek.md.source.txt:59,199','sources/001-entry-reconciliation.md.source.txt:42-70'],'rationale':'Branch-level integration is a bounded technical interpretation; source and installation must keep0029 before0030 before0031; dependent delivery/acceptance edge retained.'},
 {'id':'ER03','assessment':'SATISFIED_DOCUMENTARY','sources':['sources/007-adjusted-spec-proposal.md.source.txt:325-329,395-398,425-434','sources/017-REPORT.md.source.txt:5,24,33-35','sources/001-entry-reconciliation.md.source.txt:55-86','sources/044-gate-debt.json.source.txt'],'rationale':'Prior reviewed root/support prerequisites explicitly replaced only for local entry; old failures,43reds,current full qualification debt retained.'},
 {'id':'ER04','assessment':'SATISFIED_DOCUMENTARY','sources':['sources/005-spec-gates.json.source.txt:56-61','sources/007-adjusted-spec-proposal.md.source.txt:88-126,360-467','sources/001-entry-reconciliation.md.source.txt:99-124'],'rationale':'Existing adjusted contract and tests preserved in full by reference; no new schema/security/API choice or relaxed guard.'},
 {'id':'ER05','assessment':'SATISFIED_DOCUMENTARY','sources':['sources/001-entry-reconciliation.md.source.txt:38-51,77-86,137-139','sources/009-0380_backlog_paridade_100_deepseek.md.source.txt:175-200','sources/014-lead-review-acceptance.json.source.txt:10-13'],'rationale':'No canonical PAR status changes, promotion, DONE or functional credit; scoped builder approval does not qualify BR5.'},
 {'id':'ER06','assessment':'SATISFIED_DOCUMENTARY','sources':['sources/001-entry-reconciliation.md.source.txt:94-104,119-124,134-139','documentary-inspection.json','sources/000-task.json.source.txt'],'rationale':'Future HOW/pathset/preimages/resources/claims/acceptances are required before edits; all four document links resolve and frozen formatter/link receipts authenticate; no gates rerun.'}
]
external=[
 {'when':'BEFORE_ANY_FUTURE_CODE_EDIT','condition':'Lead records distinct task/claim and reviewed short HOW, concrete disjoint pathset/preimages, pinned0217/source and default loader, reserved0030 and refreshed migration inventory. Candidate must include unchanged0029 SQL/loader before0030; collision/drift blocks without silent renumbering.'},
 {'when':'BEFORE_CANDIDATE_CREATION_OR_RESOURCE_USE','condition':'Revalidate exact source5e3b plus builder937792 identity and scoped builder acceptance; current worktree has advanced to2f0cc11f. Own candidate/branch and explicit ownership required. Own synthetic loopback PG, roles/schema/resource binding/ports/limits/cleanup must be registered before creation. This report creates/claims none.'},
 {'when':'BEFORE_USING_A_TEST_RESULT_AS_EVIDENCE','condition':'Demonstrate support validity for that exact proof, preserving primary failure/cleanup/error propagation, real process/resource identities, assertions, native0029 guards and distinct J01/J08/J09/J10/J13/J16 paths. Prior TH06/recovery remain failed; neither75/93 historical focal passes nor BR1-BR4 approve global support.'},
 {'when':'BEFORE_CODE_ROUND_CLOSURE_OR_SHARED_PROMOTION','condition':'All mandatory adjusted0225 tests plus current regressions/T2/standardPG/E2E/coverage/certification/verifier as applicable must qualify on exact source. Retain43boundary failures/7bindings/6files and legitimate resource-binding gaps as P0 until resolved under their own scope. No checker/pin weakening or inherited PASS; BR5/global qualification remains open.'},
 {'when':'BEFORE_CANONICAL_CARD_ACCEPTANCE','condition':'Owner reconciles canonical G01 T1 record/evidence without this critic changing0380. PAR-K01 still requires I1-I12 across three modes, architecture and restart; PAR-K03 still depends onK01 for delivery/functional acceptance and its PostgreSQL crash/retry criteria. Branch preservation does not satisfy those gates.'},
 {'when':'IF_SCOPE_CHANGES','condition':'Any expansion beyond human-approved original0225 plus listed adjustments, including new schema/security/public contract/operation mix, requires its own applicable human gate. No repeat0225 gate is needed solely for this entry interpretation.0226 stays deferred;0031 belongs to0221;0238 is not authorized by this review.'}
]
result={'task':'C100-FND-JOURNAL-ENTRY-RECONCILE-001','round':'R1','reviewed_at':now,'role':'fresh independent technical critic; no authorship or descendants','verdict':'ACCEPT_LOCAL_ENTRY_RECONCILIATION','scope':'Technical interpretation of proposed local entry only; no BUILD approval or functional assessment','document_sha256':'4a44de25a1f902c748eb69e9f19e7409b88adb6d461e5ecfdf524e26686060bf','mandatory_findings':[],'mandatory_count':0,'criteria':criteria,'informational_findings':[{'id':'R1-I01','severity':'INFO','criterion':'ER01','source':'commands/017.json;commands/034.json;independent-primary-observations.json','finding':'Runtime closure candidate HEAD is now2f0cc11f7bdda82456f069ac7cc8914cb5335c57, clean; proposal collector recorded5e3b plus uncommitted builder. Current diff from5e3b remains builder-only and its digest is937792b3...; historical receipt is not a current identity assertion. Reconfirm at future entry; no source/proposal rewrite requested.'}],'external_conditions':external,'BUILD_allowed_now':False,'BUILD_ENTRY_READY':False,'functional_credit':0,'PAR_K01_DONE':False,'PAR_G01_closed_by_review':False,'promotion_allowed':False,'new_human_authority':False,'old_failures_budgets_preserved':True,'execution':{'method':'read-only Git/file/JSON/hash/link-target inspection','apps_tests_SQL_PG_Docker_network_install_build_gates_probes_provider_accounts':0,'descendants':0,'source_writes':0,'shared_coord_ledgers_state_writes':0,'new_empty_stream_files':0},'integrity':{'files':len(checks),'files_unchanged':sum(x['unchanged'] for x in checks),'concurrent_drift':drift,'git_blobs':len(after),'git_blobs_unchanged':sum(x['unchanged'] for x in after),'primary_pairs':13,'frozen_artifacts':7},'limitations':['No runtime behavior, DB migration application or test/gate success was independently executed.','Human authority is evidenced by the persisted decision record and primary approved texts; no original chat transcript independently authenticated.','Current resource eligibility, future HOW/pathset and global qualification remain external; historical receipts are not transferred.'],'budget':{'review_rounds_used':1,'remaining_rereview':1,'lead_grouped_rework_max':1,'descendants':0},'next_action':'Lead incorporates scoped interpretation into its own entry checklist/HOW and resolves applicable external conditions; do not execute BUILD from this report.'}
result['informational_findings'].append({'id':'R1-I02','severity':'INFO','criteria':['ER01','ER06'],'source':'concurrent-drift.json;coordination-concurrent.diff.source.txt;collector-attempt1.json','finding':'Shared coordination gained an unrelated additive prefix during review; old bytes/claims and primary user attribution are unchanged. Initial collector stopped conservatively; baseline retained and drift recorded, no weakening of frozen criteria.'})
save('result.json',result)
report="""# Revisão técnica independente R1 — entrada local da SPEC0225

**ACCEPT_LOCAL_ENTRY_RECONCILIATION — zero obrigatórios.** Aceite restrito à interpretação técnica da proposta SHA-256 `4a44de25a1f902c748eb69e9f19e7409b88adb6d461e5ecfdf524e26686060bf`. `BUILD_allowed_now=false`, `BUILD_ENTRY_READY=false`, crédito funcional0. Não aprova BUILD, promoção, PAR-G01/PAR-K01/DONE nem estado funcional.

Task `C100-FND-JOURNAL-ENTRY-RECONCILE-001`, R1, crítico fresco sem participação na autoria e sem descendentes. Os critérios ER01–ER06 do congelamento foram mantidos. Nenhuma correção da proposta, fonte ou SPEC foi feita. Uma eventual R2 permanece limitada ao único retrabalho agrupado do Lead; este aceite não cria outro ciclo de implementação.

## Fundamentação e condições humanas

A [decisão humana16/10](sources/005-spec-gates.json.source.txt), linhas5–6 e51–63, vincula a aprovação ao original0225 `04b92ba4...`, admite apenas os ajustes listados com revisão técnica independente e exige0029 integrada primeiro no PAR-G01, depois0030/0225 e0031/0221, com inventário reconfirmado antes de cada BUILD. Não especifica promoção a `main` como condição de qualquer edição local. A [SPEC original](sources/006-0225_pare100_complete_tool_result_journal.md.source.txt), §2, linhas35–37, situa sua fonte no worktree isolado; §8/§10 exigem inventário, claim, revisão humana e task/recurso, sem cláusula explícita root-before-local. A decisão posterior concede somente seu escopo ajustado; o banner histórico do original não é uma nova recusa.

O [roadmap0379](sources/008-0379_roadmap_paridade_100_deepseek.md.source.txt), linhas95 e99, prevê dependentes começarem sobre contratos congelados e consolidação em branch própria com0029. O [0380](sources/009-0380_backlog_paridade_100_deepseek.md.source.txt), linhas98–105, distingue a preservação T1; linhas175–200 conservam os aceites funcionais e a dependênciaK03→K01. A leitura aceita é específica: integração de fonte0029+loader na branch persistente pode anteceder0030 local, enquanto entrega/aceite deK03 continuam subordinados aK01. Não se interpreta todo `Depende de` como dispensável nem todo contrato congelado como funcionalmente aprovado.

Essa conclusão é **interpretação técnica apoiada nas fontes**, não nova decisão humana nem conclusão herdada do scout. Seu follow-up foi lido como argumento a refutar; os textos acima, os objetos Git e o inventário foram inspecionados diretamente. O [registro primário D1–D7](sources/038-decisions-d1-d7.json.source.txt) mantém a proibição de BUILD T3/T4 sem SPEC/revisão própria e a separação da produção. Nenhuma condição humana contrária à interpretação limitada foi localizada no corpus examinado; isso não é uma autorização geral por ausência de proibição.

## Pressupostos anteriores tratados expressamente

A [cópia ajustada](sources/007-adjusted-spec-proposal.md.source.txt), §8 linhas325–329, §10 linhas395–398 e §11 linhas425–434, e a [R2](sources/017-REPORT.md.source.txt), linhas5/24/33–35, realmente mantiveram0029 ausente no root e suporteTH06 sem aceite como pré-requisitos. Eles não foram ignorados ou reclassificados como aprovação.

A proposta, linhas55–81, substitui expressamente a exigência técnica root-before-local por presença/registro0029 imutáveis na futura candidata e instalação ordenada. Linhas48–49/67–70 tratam a conclusão deK01 como condição de entrega/aceite, preservando seus contratos por hash para trabalho local. Linhas71–76 substituem qualificação global presumida do helper por validade demonstrada da prova concreta; TH06/recovery continuam reprovados. Linhas77–81 conservam todos os gates de encerramento,43reds e dívidaP0. São três distinções explícitas; nenhuma equivale a aceitar suporte inválido ou a remover uma guarda de segurança.

A [dívida registrada](sources/044-gate-debt.json.source.txt), linhas5–26, e os [relatórios de qualificação](sources/043-REPORT.md.source.txt) e [diagnósticos](sources/045-REPORT.md.source.txt) permanecem evidência histórica de bloqueios, não PASS desta revisão. O [aceite do builder](sources/014-lead-review-acceptance.json.source.txt), linhas10–13, e sua [crítica primária](sources/046-REPORT.md.source.txt), linhas1/17–19, limitam-se aBR1–BR4; BR5 e integração global permanecem não qualificados.

## ER01–ER06

| Critério | Juízo sobre o artefato e evidência |
| --- | --- |
| ER01 | Satisfeito documentalmente.7arquivos do freeze e13pares fonte/snapshot exatos em [inspeção](documentary-inspection.json). Git independente confirma a724 limpo, ref persistente e Git comum no root; SQL0029 e loader coexistem em a724 e5e3b. Divergência posterior da candidata registrada abaixo. |
| ER02 | Satisfeito documentalmente. Decisão humana linhas5–6/56–61;0379 linhas95/99;0380 linha59/199; proposta linhas63–70.0030 não pode preceder0029 na fonte ou instalação;0031 permanece posterior. Aceites dependentes não são antecipados. |
| ER03 | Satisfeito documentalmente. Cópia/R2 versus proposta linhas55–86: mudança de entrada nomeada e motivada;43reds, suporte inválido, falhas anteriores e gates globais continuam abertos. Não se transfere certificado ou orçamento de tentativa FAILED. |
| ER04 | Satisfeito documentalmente. Proposta linhas99–124 remete integralmente à cópia ajustada: opt-in, colunas/versão externas, corte exclusivo, principal/schema, não adoção0, guards/locks/tenant. Journal1MiB/base641398104/envelope1398616; capture/checkpoint8MiB e contexto32KiB. J01–J13/J16, matrizJ05–J07, crashpoints e fronteirasJ12 permanecem; apenasJ14/drill completoJ15 adiados como aprovado. Guard de nós é provado separadamente no componente, sem aumento do cap público. |
| ER05 | Satisfeito documentalmente. Proposta linhas38–51/77–86/137–139,0380 linhas175–200 e aceiteBR1–BR4 não concedem promoção, conclusãoPAR ou crédito funcional. Não houve escrita no0380. |
| ER06 | Satisfeito documentalmente para a reconciliação T1. Task e budget registrados; proposta linhas94–104/119–124 exige aceites/HOW/paths/pré-imagens/claims/recursos antes da execução futura. Quatro links locais resolvidos independentemente; recibos de formato/links do pacote correspondem aos hashes congelados, sem rerun de gates. Não é aceite do HOW futuro ainda inexistente. |

## Achados obrigatórios e observação factual

**Obrigatórios: nenhum.** Severidade/critério/fonte constam de cada achado estruturado em [result.json](result.json); as observações são informativas:

- **R1-I01 · INFO · ER01:** o coletor da proposta observou a candidata do builder em5e3b com builder modificado. A leitura atual encontra `2f0cc11f7bdda82456f069ac7cc8914cb5335c57`, limpa. Seu delta contra5e3b continua apenas `scripts/build-runtime.mjs`, com SHA `937792b348686c07da8dcc4ef2c2ad89f1970fcbc90240fa15e05755bc1ea034`, exatamente o builder proposto. Fonte: [observações independentes](independent-primary-observations.json), comandos017/034/035 e objetos Git preservados. É evolução posterior à coleta, não refutação da base5e3b+builder. Revalidar na entrada; não modificar o congelamento nem herdar qualificação desse novo HEAD.

- **R1-I02 · INFO · ER01/ER06:** durante o fechamento, coord ganhou um prefixo aditivo da task alheia C100-BUILD-CLOSURE-HYGIENE. Todos os bytes anteriores, inclusive a atribuição do commit ao usuário e o claim desta revisão, foram preservados. [Diff concorrente](coordination-concurrent.diff.source.txt) e [recibo](concurrent-drift.json); o [primeiro coletor](collector-attempt1.json) parou por precaução, antes de emitir veredito/manifesto. Não houve retrabalho da proposta nem consumo de R2.

## Condições externas ainda necessárias

1. **Antes de editar código:** Lead registrar task/claim/HOW específico revisável, paths concretos disjuntos, pré-imagens e contratos0217 por fonte/hash; reconfirmar inventário/reserva0030 e0029+loader sem drift na candidata. Colisão ou drift bloqueiam; sem renumeração silenciosa. Respeitar integrador/ownership dos recursos compartilhados.
2. **Antes de criar candidata/recursos:** conferir base5e3b+builder937792 e aceite limitado do builder; reclamar candidata/branch próprias e PG sintético loopback próprio, roles/schema/identidades, portas, limites e cleanup. A revisão não cria nem reserva esses recursos.0238 continua fora da autoridade deste pacote;0226 adiada e0031 reservada à0221.
3. **Antes de usar provas:** demonstrar validade do suporte na prova correspondente, inclusive causa primária, cleanup, propagação de falha, processos/identidades reais e asserts. Não usar o helper reprovado nem75/93focais históricos como qualificação; manter0029/J13 reais, J16 e crashpoints distintos. Readiness/cutover/negativos42501 precedem admissão no schema novo, como na cópia ajustada.
4. **Antes de encerrar rodada com código/promover:** todos os obrigatórios0225 e regressões/gatesT2/certificação/verificador atuais na fonte exata; resolver ou manter bloqueantes43falhas/7bindings/6arquivos e gaps de atribuição legítima. BR5 e qualificação global permanecem abertos. Não editar checker/pins, enfraquecer testes ou declarar DONE para atravessar esse bloqueio. Reparos alheios exigem escopo/HOW próprios.
5. **Para aceite canônico:** owner reconcilia registroG01 T1 em seus próprios arquivos; esta revisão não o encerra. K01 ainda exige I1–I12 nos três modos, arquitetura e restart; K03 conserva dependência e seus aceites de crash/retry em PostgreSQL. A leitura local não dispensa nenhum desses aceites. Ampliação além do original+ajustes requer seu gate humano aplicável; não há razão para repetir a aprovação0225 só por esta interpretação.

## Método, integridade e limites

Somente Git read-only, leitura de texto/JSON, resolução local de links e SHA-256. Nenhuma aplicação/import de código-alvo, teste, SQL/PG, Docker, rede, instalação, BUILD, gate, probe, conta/provider ou descendente. Escrita exclusivamente neste review-r1; coord/ledgers/state entregues ao Lead por este handoff, conforme a restrição expressa do usuário. Comandos de coleta com stdout/stderr embutidos em [commands](commands/001.json); strings vazias ficam no JSON, sem novos arquivos de streams vazios. As leituras iniciais de instruções/pacote precederam o coletor local e permanecem no histórico da ferramenta, conforme [claim](claim.json); não se inventaram logs retroativos.

[Antes/depois](hash-beforeafter.json):47arquivos observados:46 permanecem idênticos, incluindo proposta, freeze, fontes decisórias e snapshots externos. O único drift é o prefixo aditivo concorrente de coord, documentado acima sem alterar a baseline; [cinco objetos Git](git-blobs-beforeafter.json) também idênticos. SQL0029 SHA `a738b4031d4ef06bfc5508cb9c459d7133d419b3271962f4ea9b1a808965745d`; loader SHA `9c63f4f46efa0dd09f2d7978a6393e59f69c75ca6267f6a045022ac40a85abe8`, registro linha49. Inventário nos três diretórios não contém0030/0031; root e main continuam sem0029. Isso demonstra fonte preservada, não aplicação da migration ou funcionamento.

Recibos de formato/links e relatórios anteriores são evidência persistida examinada, sem execução repetida nesta lane. A decisão humana foi autenticada contra o registro persistido e os textos aprovados; não houve autenticação independente do transcript original. Não se verificaram runtime, elegibilidade dos recursos futuros ou sucesso de qualquerJ. [Manifesto](manifest.json) cobre todos os artefatos próprios, exceto ele mesmo e seu digest; hashes do relatório/manifesto são entregues separadamente.

Próxima ação: Lead incorporar a interpretação limitada ao seu checklist/HOW e satisfazer as condições externas aplicáveis. Nenhum BUILD decorre desta entrega isolada.
"""
# Resolve the snapshot for D1-D7 from the recorded source map, avoiding index assumptions.
for x in rows:
 if x['path'].endswith('/PARE100-GAP-20261016/decisions-d1-d7.json'):
  report=report.replace('sources/038-decisions-d1-d7.json.source.txt',x['snapshot'])
(R/'REPORT.md').write_text(report)
# Ensure local explicit report links and all JSON artifacts are readable; no target code run.
import re
badlinks=[]
for link in re.findall(r'\[[^\]]+\]\(([^)]+)\)',report):
 if link!='manifest.json' and not (R/link.split('#')[0]).exists():badlinks.append(link)
assert not badlinks,badlinks
json_count=0
for p in R.rglob('*.json'):
 if p.name=='manifest.json':continue
 json.loads(p.read_text());json_count+=1
out=json.dumps({'verdict':result['verdict'],'mandatory':0,'source_files_unchanged':sum(x['unchanged'] for x in checks),'concurrent_drift_count':len(drift),'git_blobs_unchanged':len(after),'local_report_links_valid':True,'json_artifacts_readable':json_count},ensure_ascii=False)
log(sys.argv,out)
files=[]
for p in sorted(R.rglob('*')):
 if not p.is_file() or p.name in ['manifest.json','manifest.sha256']:continue
 b=p.read_bytes();assert len(b)>0,str(p)
 files.append({'path':str(p.relative_to(R)),'bytes':len(b),'sha256':H(b)})
save('manifest.json',{'algorithm':'SHA-256','scope':'all review-r1 artifacts','excluded':['manifest.json','manifest.sha256'],'files':files})
md=H((R/'manifest.json').read_bytes());rd=H((R/'REPORT.md').read_bytes())
(R/'manifest.sha256').write_text(md+'  manifest.json\n')
print(out)
