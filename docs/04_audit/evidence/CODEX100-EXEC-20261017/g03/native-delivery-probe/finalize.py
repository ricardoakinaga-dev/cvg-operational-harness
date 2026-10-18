import pathlib,json,hashlib,shutil,datetime,subprocess
repo=pathlib.Path('/home/ricardo/Área de trabalho/cvg-operational-harness');p=repo/'docs/04_audit/evidence/CODEX100-EXEC-20261017/g03/native-delivery-probe';w=pathlib.Path('/tmp/cvg-codex100-exec-20261017/native-delivery-probe')
def digest(x):return hashlib.sha256(x.read_bytes()).hexdigest()
def save(base,n,v):(base/n).write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
summary=json.loads((w/'output/summary.json').read_text());provenance=json.loads((w/'provenance.json').read_text())
checks=json.loads((w/'inputs-after-execution.json').read_text());assert checks['unchanged']
assert digest(w/'probe.mjs')==provenance['bundle']['sha256']
k=json.loads((w/'output/kernel-proof.json').read_text());host=json.loads((w/'host-namespaces.json').read_text());assert all(host[n]!=k['namespaces'][n] for n in host)
assert summary['gateReached'] and summary['nextContextContainsNonce'] and not summary['actualResponseRequestContainsNonce']
assert not any(summary[f] for f in ['initialInputContainsNonce','staticDecisionsContainNonce','firstContextContainsNonce'])
# Examine terminal state of all three OWNED scopes; never query or stop another job.
terminal=[]
for root in [w/'attempt-1',w/'attempt-2',w]:
 unit=json.loads((root/'scope-command.json').read_text())['unit'];r=subprocess.run(['/usr/bin/systemctl','--user','show',unit,'--property=ActiveState,SubState,ControlGroup,TasksCurrent'],capture_output=True,text=True,timeout=5)
 assert ('ActiveState=inactive' in r.stdout or (r.returncode and 'could not be found' in r.stderr)),(unit,r.stdout,r.stderr)
 terminal.append({'unit':unit,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
metaChecks=[]
pre=json.loads((w/'prebuild-source-hashes.json').read_text())
for f,h in pre.items():
 if f.startswith(str(repo/'packages')):
  now=digest(pathlib.Path(f));assert now==h,f
  if f.endswith('/package.json'):metaChecks.append({'path':f,'sha256Before':h,'sha256After':now})
postTools=[]
for t in provenance['toolHashes']:
 now=digest(pathlib.Path(t['path']));assert now==t['sha256'];postTools.append({**t,'sha256After':now})
extraTools=[]
for f in ['/usr/bin/bwrap','/usr/bin/systemd-run','/usr/bin/systemctl','/usr/bin/python3']:
 real=pathlib.Path(f).resolve();extraTools.append({'path':f,'realpath':str(real),'sha256PostExecution':digest(real)})
libraries=json.loads((w/'target-command.json').read_text())['libraries']
for t in libraries:t['sha256PostExecution']=digest(pathlib.Path(t['realpath']))
save(w,'postflight.json',{'sourceInputsUnchanged':checks['unchanged'],'packageFilesUnchanged':sum(f.startswith(str(repo/'packages')) for f in pre),'workspacePackageMetadata':metaChecks,'toolsBeforeAfter':postTools,'containmentToolsPostExecution':extraTools,'librariesPostExecution':libraries,'bundleSha256After':digest(w/'probe.mjs'),'metafileSha256':digest(w/'metafile.json'),'allNamespaceIdentitiesDiffer':True,'ownScopeTerminal':terminal})
raw=p/'raw';raw.mkdir(exist_ok=True)
for entry in w.iterdir():
 if entry.name=='output' or entry.name.startswith('attempt-'):
  shutil.copytree(entry,raw/entry.name,dirs_exist_ok=True)
 elif entry.is_file():shutil.copy2(entry,raw/entry.name)
selected=[i for i in provenance['inputs'] if pathlib.Path(i['path']).name in ['createOperationalHarness.ts','step-store.ts','context-engine.ts','iterative-runtime.ts','iterative-dispatch.ts','contracts.ts','execution-v2.ts']]
rows='\n'.join('| `'+str(pathlib.Path(i['path']).relative_to(repo))+'` | `'+i['sha256Before']+'` |' for i in selected)
report=f'''# DX100-G03 — observação nativa de entrega de tool result

Resultado: **DIAGNOSTIC_COMPLETED / OBSERVED_RESPONSE_DELIVERY_GAP**. O nonce nasceu exclusivamente no corpo de `ToolDefinition.execute` READ/NONE e chegou à segunda `StepContext`, incluindo `observations`. **Não chegou ao pedido real `ModelGateway.complete` de propósito RESPONSE.** Isto é uma medição do fonte atual, sem conclusão de paridade, qualidade da resposta ou qualificação Codex.

## Prova executada

- Nonce sintético: `{summary['nonce']}`.
- Uma execução READ bem-sucedida, duas decisões, uma chamada real ao gateway sintético, um pedido RESPONSE; runtime `COMPLETED`, alvo e launcher exit 0.
- Script existente `ScriptedOrchestrator`: CALL_TOOL e depois RESPOND com `responseIntent` constante. Nenhum `responseText` nem nonce fornecido às decisões.
- `ModelGateway.complete` captura imediatamente `JSON.stringify(request)`, campos do pedido e estado do AbortSignal recebidos do kernel; retorna texto constante sem nonce. O helper não monta o pedido de saída e não acrescenta observações à composição.
- [Pedido bruto real](raw/output/actual-model-requests.json): duas mensagens (system com instrução/intenção fixa e user), contexto inicial vazio, orçamento/correlationId/purpose/signal do runtime. Nenhum nonce em nenhum campo. O sinal é registrado por metadados porque AbortSignal não possui serialização JSON útil.
- [Contextos reais das decisões](raw/output/decision-contexts.json), [retorno da ferramenta](raw/output/tool-calls.json), [resultado](raw/output/runtime-result.json), [checkpoint nativo](raw/output/checkpoint.json), [steps](raw/output/steps.json), [auditoria](raw/output/audits.json) e [resumo](raw/output/summary.json) retidos.
- Controle de contaminação: input inicial, contexto da primeira decisão, decisões estáticas e resposta constante não contêm o nonce. O helper só usa a variável observada `born` nos oráculos posteriores; nenhum callback decisor/gateway consulta seu valor. A próxima observação contém o nonce recebido pelo pipeline real.

## Fonte e proveniência

Factory absoluta: `{repo}/packages/harness/src/createOperationalHarness.ts`; `execute(input.runtimeProfile='iterative')`, `InMemoryExecutionStepStore` e `DefaultContextEngine` existentes. Não se instancia uma cópia de runtime no helper. A factory sem seleção explícita continua `single_pass` (medido em [stimulus](raw/output/stimulus.json)); não há adoção do perfil iterativo como default.

Node executado: `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`, confirmado dentro do namespace como `v22.23.2`. esbuild instalado **0.28.2**, API confiável, zero plugins, bundle ESM para Node22, aliases de workspace explicitamente apontados a `packages/*/src/index.ts`. Todos os {len(provenance['inputs'])} inputs do metafile foram hashados antes/depois do bundle e depois da execução; todos idênticos, sem input `dist`, dependência externa apenas builtin `node:`. Entrypoint externo é o helper `probe.ts`, que importa a factory de fonte exata. Tipos ToolDefinition/ModelRequest/RuntimeInput vêm dos contratos de fonte, eliminados pelo esbuild; não houve typecheck nem gates de app.

Bundle executado e retido: [probe.mjs](raw/probe.mjs), SHA-256 `{provenance['bundle']['sha256']}` ({(w/'probe.mjs').stat().st_size} bytes). [Metafile](raw/metafile.json), [inputs/aliases/tools](raw/provenance.json), [comparação pós-execução](raw/inputs-after-execution.json) e [postflight](raw/postflight.json) contêm caminhos absolutos e hashes integrais. Os manifests de workspace e todos os arquivos de packages também permaneceram idênticos ao snapshot pré-bundle.

| Fonte relativa à raiz `{repo}` | SHA-256 antes = depois |
| --- | --- |
{rows}

## Contenção e encerramento

O scope próprio `{terminal[-1]['unit']}` estava ativo **antes de lançar o alvo**. O guard verificou `MemoryMax=2147483648`, `CPUQuotaPerSecUSec=1s`, `TasksMax=128`, `RuntimeMaxUSec=2min` via systemd e os arquivos vivos cgroup2 `memory.max=2147483648`, `cpu.max=100000 100000`, `pids.max=128`. O bundle repetiu a verificação dos limites antes de chamar a factory. O harness alvo só executou dentro de bwrap `--unshare-all --clearenv --cap-drop ALL --die-with-parent --new-session`, com sete identidades de namespace distintas do host e somente loopback com zero tráfego observado.

Montagens: projeção readonly do repositório em `/repo/packages` e `/repo/package.json`, Node, bundle, bibliotecas ELF necessárias e limites cgroup readonly; `/work` é exclusivamente o output próprio; `/tmp` privado, `/proc` do namespace e `/dev` mínimo. Não se expõe a home do host, .git, configs, secrets, socket de sessão nem node_modules. Ambiente alvo: PATH=/nonexistent, LANG=C, PWD=/work. Nenhuma chamada de subprocesso é feita pelo helper alvo; processos auxiliares pertencem somente à contenção/supervisão, sem subagentes.

[Comando exato](raw/target-command.json), [scope ativo](raw/live-scope.json), [limites pré-alvo](raw/live-cgroup-before-target.json), [prova kernel](raw/output/kernel-proof.json), stdout/stderr e [scope terminal](raw/terminal-scope.json) preservados. Timeout próprio100s do alvo,115s do launcher, RuntimeMax120s; cleanup só consulta/para a unidade de nome próprio em caso de necessidade. Todos os três scopes próprios estão inactive/dead, ControlGroup vazio; sem job/resource próprio vivo. Nenhum processo/sessão de referência ou outra lane foi consultado ou alterado.

## Falhas preservadas

[attempt-1](raw/attempt-1/target.stderr.log) e [attempt-2](raw/attempt-2/target.stderr.log) terminaram exit1 na verificação do ambiente, **antes da factory**. O bwrap acrescenta `PWD=/work` depois de limpar o ambiente; o guard inicial esperava somente PATH/LANG. A segunda tentativa apenas imprimiu o ambiente efetivo e confirmou exatamente essas três variáveis, home ausente e `/run/user` ausente. A terceira valida também PWD com valor exato `/work`. Nenhum limite, namespace ou montagem foi relaxado. Bundles, metafiles, hashes e saídas das duas falhas estão preservados. `Result=success` de scope não substitui o exit1 registrado nesses alvos. Stderr vazio da execução final é artefato esperado com exit0, retido byte a byte.

## Limite e continuidade

Diagnóstico isolado do checkout atual, sem aprovação transferida da candidata0224, sem adoção/default da0226 adiada, sem feature/API/gate change. Nenhum Codex reference foi executado ou esperado artificialmente. **Todos os estados do catálogo continuam NOT_RUN e functional_receipts=0.** App, testes e lock não foram editados; nenhum vitest/full gates/install/rede/modelo/conta/PG/Docker/Codex CLI/commit/push/deploy.

`last_completed_action`: medição nativa executada e evidência selada. `status`: COMPLETED_DIAGNOSTIC. `next_action`: Lead avaliar o gap observado para eventual SPEC futura com gate próprio; nenhuma implementação autorizada por esta evidência. Ledgers, backlog, catálogos e continuidade compartilhados readonly por write scope explícito; este parágrafo é o delta de handoff ao Lead.

Helpers: [probe.ts](probe.ts), [build.mjs](build.mjs), [guard.py](guard.py), [run.py](run.py), [finalize.py](finalize.py). Contrato original preservado: [contract.json](contract.json). Claim local e fechamento: [claim.json](claim.json). Manifest de hashes e lista de arquivos: [manifest.json](manifest.json).
'''
(p/'REPORT.md').write_text(report)
claim=json.loads((p/'claim.json').read_text());claim.update(status='COMPLETED_DIAGNOSTIC',completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),last_completed_action='Executed native delivery probe: next StepContext yes, actual RESPONSE request no',next_action='Lead review only; no feature approval',own_resources='ALL_CLOSED',scope_job_terminal_status=terminal);save(p,'claim.json',claim)
files=[{'path':str(x.relative_to(p)),'bytes':x.stat().st_size,'sha256':digest(x)} for x in sorted(p.rglob('*')) if x.is_file() and x.name!='manifest.json']
save(p,'manifest.json',{'task':claim['task'],'status':'COMPLETED_DIAGNOSTIC','finding':'NEXT_CONTEXT_YES_RESPONSE_REQUEST_NO','functional_receipts':0,'catalog_statuses':'NOT_RUN','source_inputs':len(provenance['inputs']),'source_unchanged':True,'own_resources':'ALL_CLOSED','contract_sha256':digest(p/'contract.json'),'files':files,'manifest_excludes_itself':True,'preexisting_file':'contract.json','changed_files':[i['path'] for i in files if i['path']!='contract.json']+['manifest.json']})
print(json.dumps({'files':len(files)+1,'bytes':sum(f['bytes'] for f in files),'finding':'NEXT_CONTEXT_YES_RESPONSE_REQUEST_NO','scope_status':'ALL_3_INACTIVE_DEAD','manifest':str(p/'manifest.json')}))
