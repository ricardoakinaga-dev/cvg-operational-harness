from pathlib import Path
import sys,json,hashlib,datetime,re
R=Path(__file__).resolve().parent
H=lambda b:hashlib.sha256(b).hexdigest()
def save(n,o):(R/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
inputs=[]
for x in json.loads((R/'before.json').read_text()):
 b=Path(x['path']).read_bytes();s=(R/x['snapshot']).read_bytes();inputs.append(dict(x,after_sha256=H(b),snapshot_sha256=H(s),unchanged=H(b)==x['sha256']==H(s)))
assert all(x['unchanged'] for x in inputs);save('beforeafter.json',inputs)
sealed=[]
for x in json.loads((R/'sealed-before.json').read_text()):
 b=Path(x['path']).read_bytes();sealed.append(dict(x,after_sha256=H(b),unchanged=H(b)==x['sha256'] and len(b)==x['bytes']))
assert all(x['unchanged'] for x in sealed);save('sealed-beforeafter.json',sealed)
receipt=json.loads((R/'sources/00-format-correction.json.source.txt').read_text())
pairs=[x for x in receipt['pairs'] if 'original' in x]
sem=json.loads((R/'semantic-inspection.json').read_text())
assert all(x['exact_formatter_output'] and x.get('structural_identity',x.get('markdown_structure_identity',False)) for x in sem['pairs'])
forced=json.loads((R/'forced-format-command.json').read_text());assert forced['exitCode']==0 and '--ignore-path' in forced['argv'] and '/dev/null' in forced['argv']
candidate=json.loads((R/'candidate-static-inspection.json').read_text())
result={'kind':'CORRECTION_ADDENDUM_TO_SEALED_R2_NO_NEW_REVIEW_ROUND','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'ACCEPT_SCOPED_HOW','applies_to':'Formatted current sibling HOW/task plus formatted entry/task, semantically identical to the frozen original inputs','mandatory_findings':[],'mandatory_count':0,'ER06_correction':{'prior_default_formatter_receipts':'INVALID_AS_PROOF_OF_FILE_FORMATTING: evidence paths ignored,exit0 did not mean files were checked','prior_original_files':'preserved; no retrospective formatting PASS asserted','current_formatted_siblings':'ACTUALLY_CHECKED_WITH_IGNORE_PATH_DEV_NULL_EXIT0','semantic_identity':'4 exact formatter outputs;2JSON structural equality;2Markdown AST equal after source-metadata/text-softbreak normalization, code/inlineCode/list numbering/URLs/structure preserved; diffs manually reviewed','links':'Original/formatted targets identical;3entry targets exist,HOW has0Markdown link targets;receipt records0broken for both'},'current_input_bindings':pairs,'preserved_seals':{'R1_manifest_sha256':'48608b3f80d6ec6911e6b5dcfe2182aa3984ea07b31f7f8e54b456faac15660b','R2_manifest_sha256':'83502b94e581db610025f570c20c0b98dd3e01e8bebbe0a122ffcbd14537e291','R1_artifacts':139,'R2_artifacts':77,'manifest_and_digest_files':4,'all_preserved':True},'candidate_static_evidence':{'head':candidate['HEAD'],'clean':candidate['status']=='','preimages_matched':11,'protections_matched':9,'0030_0031_absent':not any(x.startswith(('0030','0031')) for x in candidate['migration_inventory']),'physical_dependency_sample':'TypeScript lib payload same SHA,different inode; no full dependency tree attestation','PG_SQL':'No PG/SQL action or inspection by critic; receipt declares implementation_started=false,PG_created=false'},'inputs_unchanged':len(inputs),'no_new_human_authority':True,'functional_credit':0,'BUILD_executed_or_approved_by_addendum':False,'PG_executed_or_approved_by_addendum':False,'preparation_review_rounds_remaining':0,'future_code_review':'separate planned unit, not started','remaining_conditions':'Original R2 source/resource/runtime-manifest/identity/readiness/proof/gate checklists still apply; no broad execution follows from this addendum. No repeat approval needed for byte-only formatting with verified semantic identity.','execution':{'read_only_formatter_check':1,'formatter_JSON_Markdown_data_inspection':True,'target_test_build_SQL_PG_Docker_network_install_provider_process_resources':0,'descendants':0,'writes_outside_addendum':0},'limitations':['Formatting evidence is for the four named formatted siblings only.','Semantic AST inspection uses formatter parser plus separately inspected textual diffs; no behavioral execution.','Runtime readiness, effectivePG privileges and allJtests remain unproved here.']}
save('result.json',result)
report="""# Adendo de correção ER06 — R2 selada

**ACCEPT_SCOPED_HOW mantido para os siblings formatados; zero obrigatórios.** Este adendo corrige a evidência de formato e vincula os novos bytes à mesma semântica aprovada. Não é nova rodada, não reabre a R1 nem modifica o relatório/result/manifesto da R2 selada. O orçamento de preparação permanece2/2.

## Correção explícita

A avaliação anterior usou recibos de Prettier com exit0 sem comprovar que os arquivos tinham sido examinados. **Esse uso como evidência de formato foi inadequado.** Os caminhos de evidence eram ignorados; os recibos originais não satisfaziam o subcritério de formatação de ER06. Permanecem registros históricos de uma checagem ignorada, sem PASS retroativo para os originais.

Os [recibos corretivos](sources/00-format-correction.json.source.txt) identificam quatro arquivos não formatados e quatro siblings novos, com os originais preservados. Repeti somente o [check direcionado dos quatro siblings](forced-format-command.json), com `--ignore-path /dev/null --check`: exit0, stdout confirma formato, stderr vazio registrado no JSON. Esta é evidência de execução de formato nos novos arquivos, sem gate amplo ou teste de produto.

**ER06 fica corrigido para os inputs correntes formatados**, em conjunto com as demais condições já registradas emR1/R2; não se altera a autoridade humana, a SPECf26c, a interpretação de entrada ou o conteúdo do HOW.

## Identidade dos quatro pares

| Input corrente | SHA-256 |
| --- | --- |
| `foundation0225-entry-reconciliation/entry-reconciliation.formatted.md` | `50ff49d4503463b62406ed63d12b7a9cd53d0683820e418f104d321676cdda5f` |
| `foundation0225-entry-reconciliation/task.formatted.json` | `56662b0082f1c361b28d7f985d3facf4b6b40bf77d014b8b6aa3d89137d61701` |
| `journal0225-build/short-how.formatted.md` | `f33c7fbfeecdbd2252fa45af626fb8b0f04cc7d9df259cbb9abb7d7b8019b2d0` |
| `journal0225-build/task.formatted.json` | `40ac249d7d7600bf788af7d9d55ee9fab2051b0261c42297e3c9397ca820091d` |

[Hashes dos pares](pair-hash-inspection.json): todos os oito digests coincidem com o recibo; os originais continuam nos hashes congelados. A [inspeção semântica](semantic-inspection.json) confirma que cada sibling é exatamente a saída determinística do formatter sobre seu original.

Os dois JSONs têm igualdade estrutural. Os dois Markdown têm árvores sintáticas iguais após remover somente metadados de posição/raw e normalizar espaços/quebras suaves em nós de texto; estrutura, numeração de listas, código/inlineCode, destinos de links e valores são conservados. A [inspeção mais estrita](semantic-inspection-stronger-command.json) preserva também os atributos start/end de listas. Os quatro diffs foram lidos: no entry há redistribuição de espaços/quebras no parágrafo das condições; no HOW há uma indentação de continuação; nos JSONs há compactação de arrays. Nenhuma condição de0029→0030→0031, guarda, testeJ13/J16, aceite dependente ou dívidaP0 desapareceu.

Os destinos de links permanecem iguais e resolvem localmente: três no entry, nenhum linkMarkdown no HOW. Os recibos do Lead registram zero links quebrados para ambos. Os originais e seus seals não foram editados para obter esse resultado. Os bindings completos original→corrente constam do [resultado](result.json); o aceite do desenho passa a esses siblings por identidade semântica demonstrada, sem fingir que seus hashes são os mesmos.

## Candidata e alcance

O [recibo de preparação](sources/01-candidate-preparation.json.source.txt) foi lido como registro, não como autoridade. [Inspeção estática própria](candidate-static-inspection.json) confirma a candidata nova em2f0cc11f limpa,11pré-imagens/9proteções exatas, inventário0029 presente e0030/0031 ausentes. Um payloadTypeScript coincide por hash e difere por inode da base, apoiando a cópia física nessa amostra; não se afirma auditoria de toda a árvore de dependências.

O recibo declara `implementation_started=false` e `PG_created=false`; não inspecionei Docker/PG/processos para atestar ausência global. Nenhuma fonte, SQL ou teste foi executado/editado por esta correção. Node foi usado somente para formatter e análise de documentos. Não houve instalação, rede, provider, processo de aplicação, recurso de processo ou descendente.

Claims/checklists de fonte, manifestos runtime, recursos/identidades/roles/schema/portas/cleanup, readiness, provas e gates de encerramento continuam os daR2. Nenhum novo BUILD/PG ou crédito funcional é concedido por este adendo. A futura crítica de código permanece unidade distinta. A correção de formato, sem mudança semântica, não exige repetir decisão humana.

## Preservação e entrega

[Antes/depois dos inputs](beforeafter.json):16arquivos idênticos. [Seals preservados](sealed-beforeafter.json):139artefatosR1,77artefatosR2 e seus quatro arquivos de manifesto/digest idênticos. A R2 original continua vinculada ao manifesto `83502b94e581db610025f570c20c0b98dd3e01e8bebbe0a122ffcbd14537e291`; a R1 conserva seu manifesto anterior.

Este adendo tem [manifesto próprio](manifest.json), cobrindo somente os novos artefatos deste subdiretório, exceto seu próprio manifesto/digest. O manifesto anterior continua autenticando o conjunto histórico selado; não é reescrito para incluir o adendo posterior. Escrita exclusiva emformat-addendum dentro do how-review-r2 autorizado.

Próxima ação: Lead usar os quatro siblings correntes e este adendo no checklist antes de código, preservando todos os limites daR2. Nenhum retrabalho de conteúdo ou terceira revisão foi criado.
"""
(R/'REPORT.md').write_text(report)
for p in R.rglob('*.json'):
 if p.name!='manifest.json':json.loads(p.read_text())
bad=[u for u in re.findall(r'\[[^\]]+\]\(([^)]+)\)',report) if u!='manifest.json' and not (R/u).is_file()]
assert not bad,bad
out=json.dumps({'verdict':'ACCEPT_SCOPED_HOW','ER06':'CORRECTED_FOR_FORMATTED_CURRENT_INPUTS','mandatory':0,'semantic_pairs':4,'unchanged_inputs':len(inputs),'sealed_files_unchanged':len(sealed),'target_tests_SQL_PG_builds':0},ensure_ascii=False)+'\n'
save('addendum-command.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':sys.argv,'exitCode':0,'stdout':out,'stderr':''})
files=[]
for p in sorted(R.rglob('*')):
 if not p.is_file() or p.name in ['manifest.json','manifest.sha256']:continue
 b=p.read_bytes();assert b;files.append({'path':str(p.relative_to(R)),'bytes':len(b),'sha256':H(b)})
save('manifest.json',{'algorithm':'SHA-256','scope':'format-addendum only; extends sealedR2 without mutation','parent_R2_manifest_sha256':result['preserved_seals']['R2_manifest_sha256'],'excludes':['manifest.json','manifest.sha256'],'files':files})
(R/'manifest.sha256').write_text(H((R/'manifest.json').read_bytes())+'  manifest.json\n')
print(out,end='')
