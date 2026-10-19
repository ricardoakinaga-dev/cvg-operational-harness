import json, subprocess, hashlib, sys, datetime
C='/mnt/ia/cvg-c100-integration-20261018'
def git(*a): return subprocess.run(['git',*a],cwd=C,capture_output=True).stdout
def h(rev,p):
    r=subprocess.run(['git','show',f'{rev}:{p}'],cwd=C,capture_output=True)
    return hashlib.sha256(r.stdout).hexdigest() if r.returncode==0 else None
M='12cd269c'; OURS='6cb965ff'; THEIRS='219061a3'; BASE='ca565391'; R4='38f3e18d'
def rec(p, kind, resolution, rationale, extra=None):
    d={'path':p,'conflict':kind,'baseCa565391':h(BASE,p),'r4_38f3e18d':h(R4,p),'oursRoot6cb965ff':h(OURS,p),'theirsC100_219061a3':h(THEIRS,p),'merged12cd269c':h(M,p),'resolution':resolution,'rationale':rationale}
    if extra: d.update(extra)
    return d
items=[]
ev=[l.split('\t') for l in open('/mnt/ia/cvg-c100-integration-runtime-20261018/merge-work/evidence-siblings.tsv').read().splitlines()]
for orig,osha,sib,ssha in ev:
    d=rec(orig,'add/add (evidência histórica PARE100)','ROOT_BYTES_IN_PLACE_PLUS_SIBLING','As duas cópias foram gravadas em paralelo (checkout principal e worktree PARE100) e diferem só em timestamp de microssegundos ou num caminho /tmp. A versão do root fica no caminho original porque é a referenciada por hash em manifestos do root (HISO005/CLAUDE100/CODEX100); a da worktree a72422be é preservada byte a byte no caminho irmão.',{'siblingPath':sib,'siblingSha256':ssha})
    assert d['merged12cd269c']==osha and h(M,sib)==ssha
    items.append(d)
code_theirs=['packages/platform/src/controlled-execution-plan.ts','packages/platform/src/controlled-kernel-adapters.ts','packages/platform/src/controlled-kernel-execution.ts','packages/platform/src/plugin-execution-core.ts','packages/platform/src/test-lab.ts','scripts/run-core-coverage.mjs','tests/architecture/platform-kernel-delegation.test.ts','tests/coverage-thresholds.test.js','tests/differential/cvg-reply.ts','tests/differential/reference-agent-driver.mjs','tests/differential/reply-differential.test.ts']
for p in code_theirs:
    kind='content' if p=='packages/platform/src/test-lab.ts' else 'add/add'
    d=rec(p,kind,'THEIRS (Claude100)','O root está byte a byte na versão R4 (integration/root-r4/plan.json, source_sha256) e não mudou depois de 38f3e18d; a linha Claude100 evoluiu a partir da R4. Merge de três vias com base efetiva R4 = lado Claude100.')
    assert d['oursRoot6cb965ff']==d['r4_38f3e18d'] and d['merged12cd269c']==d['theirsC100_219061a3']
    items.append(d)
for p in ['tests/pare100-compiled-kernel-boundary.test.js','tests/pare100-sdk-boundary-qualification.test.js','tests/replay/execute-fixture.ts']:
    d=rec(p,'add/add','OURS (root, migração SPEC0228/165d8c0c)','O lado Claude100 é idêntico à R4 (38f3e18d); só o root mudou depois (165d8c0c). Merge de três vias com base R4 sem conflito = versão do root.')
    assert d['theirsC100_219061a3']==d['r4_38f3e18d'] and d['merged12cd269c']==d['oursRoot6cb965ff']
    items.append(d)
items.append(rec('tests/doc-source-moves.test.js','add/add','MERGE_3WAY_R4_BASE + hunk combinado','Root (SPEC0233) trocou a verificação inline por assertFrozenDocTarget (prefixo, append, hashes antes/depois); a linha Claude100 acrescentou a prova de proveniência do amendment PARE100 (bytes originais 0207, prefixo, afterSHA256). Os dois verificam os mesmos hashes b03badb2…/6f936605…; o hunk mantém as duas verificações em sequência, sem remover nenhuma asserção.'))
for p in ['docs/99_runtime_state.md','docs/20_master_execution_log.md','docs/30_backlog_master.md','docs/08_runtime/agent_coordination.md','docs/02_spec/0190_spec_validation.md']:
    d=rec(p,'content','OURS (root)','Todas as linhas que a linha Claude100 acrescentou desde ca565391 já existem no root (entradas PARE100 gravadas também no checkout principal); a Claude100 não editou ledgers depois de a72422be. Resultado byte a byte igual ao root; nenhuma linha de nenhum lado perdida (verificação por multiconjunto).')
    assert d['merged12cd269c']==d['oursRoot6cb965ff']
    items.append(d)
items.append(rec('docs/architecture/PUBLIC_API.md','content','HUNK1 OURS + HUNK2 THEIRS','Hunk 1: o root reescreveu o parágrafo de índice (ADR-010, glossário, backlog 0370, plano 0374) e a Claude100 não tocou nele. Hunk 2: a Claude100 acrescentou a seção SPEC0217 e o root nada. Resultado = 38f3e18d + mudança do root + seção SPEC0217. Observação: o texto SPEC0217 diz "sem promoção ao checkout principal"; fica como veio, para o Lead decidir se atualiza.'))
items.append(rec('docs/04_audit/evidence/empty-artifact-status.json','content','UNION (merge de três vias com base R4; 835 registros)','Catálogo de artefatos vazios: 352 registros comuns idênticos, 341 só do root, 142 só da Claude100, nenhum removido e nenhum com metadados divergentes. Ordem do merge textual de três vias com base 38f3e18d.'))
auto=[rec('packages/harness/src/iterative-runtime.ts','auto-merge incorreto (sem marcador)','THEIRS (Claude100) - correção do auto-merge','O merge do git com base ca565391 manteve as duas cópias de um bloco de 52 linhas (leitura do resultado pendente / effect_settlement_failed) que a worktree PARE100 moveu da linha ~1070 para ~870 depois da R4. Com a base efetiva R4 (o root continua na R4) o resultado é exatamente o lado Claude100, sem duplicação.')]
inherited=[{'path':'package-lock.json','note':'Auto-merge = lado Claude100. Diferença contra o root: só 2 linhas em packages/persistence devDependencies (@cvg/harness-orchestrator 0.1.0 workspace e typescript ^6.0.3 já presente na raiz), vindas de 5e3b51bd. Sem install, sem pacote externo novo; node_modules copiado do root resolve as duas.','sha256Root':h(OURS,'package-lock.json'),'sha256Merged':h(M,'package-lock.json')},{'path':'packages/persistence/package.json','note':'Mesmo delta de devDependencies (5e3b51bd).'}]
out={'task':'C100-FND-ROOT-INTEGRATION-20261018','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
'candidate':{'worktree':C,'branch':'integrate/c100-foundation-20261018'},
'commits':{'rootHead':'6cb965ffafbca54e5078201e3d880433ad3e6f18','cherryPick':{'source':'ae5538cf8229752110b49e86405cc0d3ccb92585','result':git('rev-parse','e2f5479c').decode().strip(),'conflicts':0},'merge':{'theirs':'219061a3468b963e2a1b61de4d94e93e2bf3de3d','result':git('rev-parse',M).decode().strip(),'gitMergeBase':'ca565391ac52033d6f59b06237a45beb986e1c12'}},
'method':{'effectiveBase':'38f3e18da9649f5dd1a466e85f9a3b4a226978b0','why':'38f3e18d (root) e a72422be (Claude100) são dois snapshots do mesmo trabalho PARE100: o root recebeu a integração R4 (docs/04_audit/evidence/PARE100-EXEC-20261014/integration/root-r4/plan.json, 113 arquivos, todos com root==R4) e a worktree continuou a partir dela. O merge-base do git (ca565391) não enxerga isso; por isso todo path alterado pelos dois lados com pontas diferentes (40) foi refeito com git merge-file usando a versão 38f3e18d como base e comparado com o resultado do git.','pathsBothSidesChangedWithDifferentTips':40,'r4PlanFilesChecked':113,'r4PlanFilesRevertedOrMismerged':0,'rootOnlyAdditionsKept':'27 paths que só o root adicionou (deploy on-prem, 0379/0380, teste telegram relay) permanecem; nenhum deles existia na worktree.','lineContainment':'Para ledgers, 0190, PUBLIC_API e os 4 testes: todas as linhas acrescentadas por cada lado desde a base estão no resultado, exceto 1 linha do root em doc-source-moves (a chamada inline substituída pela forma combinada que chama a mesma função).'},
'conflictCount':{'total':32,'byType':{'add/add evidência PARE100':10,'add/add código/teste':14,'content docs/ledgers':6,'content código':1,'content catálogo':1}},
'conflicts':items,'autoMergeCorrections':auto,'inheritedNonConflict':inherited}
json.dump(out,open(sys.argv[1],'w'),indent=2,ensure_ascii=False)
print(len(items),'conflict records')
