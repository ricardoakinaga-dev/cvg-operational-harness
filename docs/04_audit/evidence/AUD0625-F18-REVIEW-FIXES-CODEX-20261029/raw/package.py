from pathlib import Path
import hashlib,json,subprocess,datetime
r=Path('/mnt/dados/cvg-work/aud0625-f18-review-fixes-codex-20261029');c=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029/candidate');e=c/'docs/04_audit/evidence/AUD0625-F18-REVIEW-FIXES-CODEX-20261029';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def copy(p,d):
 d.parent.mkdir(parents=True,exist_ok=True)
 if p.suffix=='.log':
  raw=p.read_bytes();text=raw.decode();assert text.encode()==raw;dump(d.with_suffix('.log.json'),{'encoding':'utf8-json','bytes':len(raw),'sha256':sha(p),'content':text})
 else:d.write_bytes(p.read_bytes())
report=json.loads((r/'final-regressions-vitest.json').read_text());assert report['success'] and report['numFailedTests']==0 and report['numPendingTests']==0
for n in ['final-regressions','final-types','final-lint','final-format']:
 d=json.loads((r/(n+'.json')).read_text());assert d['exit_code']==0 and not d['timed_out'] and d['reaped']
mutants=json.loads((r/'mutations.json').read_text());assert len(mutants['mutations'])==30 and all(x['assertion_failure'] and not x['timeout'] for x in mutants['mutations'])
e.mkdir(exist_ok=False)
for p in r.iterdir():
 if p.is_file():copy(p,e/'raw'/p.name)
for dirname in ['inputs','mutation-diagnostic-fixture']:
 for p in (r/dirname).iterdir():
  if p.is_file():
   dest=e/dirname/p.name
   # The original review is frozen as text, not a relocated Markdown document.
   if dirname=='inputs' and p.suffix=='.md':dest=dest.with_suffix('.md.txt')
   copy(p,dest)
files=['packages/harness/src/kernel/hook-authority.ts','tests/aud0625-f18-approval-admission.test.ts','tests/aud0625-f18-review-regressions.test.ts','tests/aud0625-f18-review-iterative-checkpoint.test.ts']
base='3dc36726d77c717a58a2aa2097628fd767f46798';pins={p:sha(c/p) for p in files};dump(e/'source-post.json',pins)
for p in files:copy(c/p,e/'source'/Path(p+'.txt'))
unchanged=['packages/harness/src/kernel/pipeline.ts','packages/harness/src/kernel/kernel-runtime.ts','packages/harness/src/iterative-runtime.ts','packages/harness/src/iterative-dispatch.ts','scripts/skip-catalog.json','scripts/mutation-manifest.json','package-lock.json','docs/02_spec/0280_aud0625_internal_hook_authority.md']
for p in unchanged:assert (c/p).read_bytes()==subprocess.check_output(['git','show',base+':'+p],cwd=c)
old=c/'docs/04_audit/evidence/AUD0625-F18-BUILD-CODEX-20261029';oldm=json.loads((old/'manifest.sha256.json').read_text());assert all(sha(old/p)==h for p,h in oldm['files'].items())
assert sha(old/'authority/human-decisions-11.json')=='1acc726123ebae527731b39294d93c67f98f0b603b814aac6a3a93482c28bff4'
dump(e/'source-preservation.json',{'base':base,'unchanged':{p:sha(c/p) for p in unchanged},'prior_packet_manifest_unchanged':sha(old/'manifest.sha256.json'),'rebind_required':False,'partial_checkout':True,'dependencies_reused':True,'full_clean_qualification':False})
dump(e/'empty-artifact-status.json',{'schemaVersion':1,'files':[]})
state=json.loads((r/'task.json').read_text());state.update(status='READY_FOR_NEXT_STEP',last_completed_action='P2-1/P2-2 corrected;7 proposed gap controls plusR23 adopted;30 causal mutants and focused regression qualified',next_action='Immutable commit and return to Claude DF for07orD9 independent review; then pollGBrain/claims every60seconds during active session',tests=report['numPassedTests'],files=len(report['testResults']),production='NO_GO');dump(r/'task.json',state);copy(r/'task.json',e/'state.json')
plan=(r/'ExecPlan.md').read_text();plan=plan[:plan.index('Current:')]+f"Current: source complete; {report['numPassedTests']} tests in {len(report['testResults'])} files PASS/0pending, types/lint/format PASS;30mutants assertion-killed and source restored. Initial5RED/13PASS and invalid fixture/oracle attempts retained. Next immutable commit+DF→07/D9, then resume polling.\n";(r/'ExecPlan.md').write_text(plan);(e/'ExecPlan.md').write_text(plan)
duration=json.loads((r/'final-regressions.json').read_text())['duration_seconds']
(e/'RESULT.md').write_text(f'''# F18 — correções da revisão 07 / tarefa14405

Implementação local concluída, pendente de revisão independente 07 ou D9 e integração pelo Claude DF/Opus. Base imutável3dc36726d, branch codex/aud0625-f18-build-20261029. Autoridade: atribuição GBrain14405, ACK14852, revisão07@4ffbda710e, SPEC0280 e recibo11 aprovados anteriormente e inalterados. S1 e S2 anteriores permanecem congelados.

| Item | Correção e evidência |
| --- | --- |
| P2-1 | Uma alegação failed/FAILED ou REJECTED depois de sucesso físico vira threw com unknown_effect explícito e causa preservada. O corpo não se repete; post-hook mantém complete1/fail0/release0 e ledger started→succeeded. Sem aprovação exigida, a resposta e o erro também continuam explicitamente incertos. |
| P2-2 | A transformação que reconstrói uma projeção incompleta é recusada com confirm_failed/unknown_effect, conservando o resultado físico original. Limites de largura, profundidade, classe e cópia serializada cobertos. O marcador privado é identificado por identidade; dados legítimos opaque:true continuam dados. Retorno do próprio outcome permanece válido, inclusive para saída grande. Não há fallback de autoridade/original na projeção. |
| R16/R17/R19/R22/R24/R25/R26 | Sondas propostas da07 adotadas como assertivas ordinárias; testam status inconsistente, falso not_started e uso único, nextduplo em gate, guard/post/end destacados e audit ausente em turno já bloqueado. Os sete mutantes morrem. |
| R23 | Teste com IterativeGovernedRuntime real observa o argumento do beforeDispatch sem substituir pipeline, aprovação, efeito ou callback real. Recebe projeção destacada/congelada, sem grant/reserva/sandbox/executor; um efeito sintético ocorre. Mutante que passa call real morre. |
| P3-1 da S1 | O teste de admissão procura control.approvals pelo nome do plugin, em vez de presumir índice0. |

Resultado final Node22: **{report['numPassedTests']} PASS em {len(report['testResults'])} arquivos, 0 falhas e 0 skip/pendências**, {duration}s/120s. Tipos, lint dos quatro caminhos alterados e formato PASS. **30/30 mutantes mortos por assertivas**, fonte restaurada SHA idêntica:18 controles anteriores +7lacunas +R23 +4mutações P2. Os catálogos skip/mutation e lockfile não mudaram; pipeline/kernel-runtime só foram mutados temporariamente para prova e estão byteidênticos à base, sem rebind necessário.

Baseline anterior à correção:5RED causais/13PASS, sem it.fails e sem falha de setup. Tentativas posteriores com oráculo inválido de status e fixture sem-aprovação ainda exigindo policy foram conservadas; a primeira campanha foi marcada DIAGNOSTIC_NOT_FINAL_CAUSAL_CREDIT e repetida integralmente só depois de57controles verdes. Os relatórios finais são da fonte atual. Nenhuma morte por timeout ou infraestrutura foi creditada.

Ver [fontes](source-post.json), [preservação](source-preservation.json), [autorrevisão](SELF-REVIEW.md) e [estado](state.json). Brutos .log.json são transporte UTF-8 lossless com SHA; entradas originais da revisão ficam em inputs. Checkout parcial e dependências reutilizadas: esta não é barra clean/integral. Nenhum PG/Docker/fullsuite/E2E/certify/push/PR/merge. Scores0625 não reescritos; X01/K08/F05 global e produção NO_GO permanecem separados.

Próximo: DF receber SHA imutável e encaminhar à07/D9. Implementação e testes não são parecer independente nem aceite de integração. Após o retorno, Codex mantém consultas periódicas a GBrain/claims nesta sessão.
''')
(e/'SELF-REVIEW.md').write_text('''# Autorrevisão do reparo F18

Autor avaliando o próprio código; revisão independente posterior é da07/D9. A solução mínima conserva o estado privado e muda apenas a reconciliação do retorno. Não concede writer a kindcontrol nem acrescenta serviço público/contrato de sandbox.

P2-1 precisa manter unknown_effect mesmo sem call.approval; por isso a classificação threw carrega a marca no próprio error, preservando a causa alegada. O RuntimeResult usa o status FAILED existente para threw; não foi inventado um status novo. A primeira asserção que proibia FAILED foi corrigida por contrariar o contrato; a exigência correta é a classificação incerta explícita. O prefixo da resposta dos caminhos que já o acrescentam não é uma confirmação adicional.

P2-2 escolhe a alternativa aprovada de recusar, em vez de restaurar subárvores originais em dados entregues a extensões. Se a observação anterior contém marcador privado, reconstrução (inclusive JSON) não pode mascarar perda; se o próprio retorno introduz valor não projetável, também é recusado. O retorno identidade preserva o original somente no acumulador privado, nunca o entrega ao hook. Um literal opaque:true do usuário não é marcador privado. turn/end já conserva toolResult/contadores originais e só aceita texto/stopReason, com teste adicional de cópia e saída grande.

A fronteira R23 usa instrumentação de teste no módulo apenas para observar o callback real fornecido pelo iterativo; não substitui a decisão governada ou efeito nem adiciona seam público. O mutante isolado prova que o oráculo não depende só do resultado da ferramenta. Os demais sete mutantes do revisor foram aplicados separadamente e mortos por suas novas assertivas.

As primeiras tentativas de teste e a campanha diagnóstica são históricas, não evidência final. A fixture sem-aprovação agora retira a exigência tanto do descritor quanto da política. Caps não foram elevados. Houve pico IO fullavg10~46; tipos iniciais passaram90.477s/120 e controles finais foram repetidos em baixa pressão. Nenhum processo de par foi encerrado.

P3 restantes da revisão (signal como snapshot, DAG repetido opaco e guia amplo de migração de extensões) não foram ampliados nesta correção dos2P2; permanecem limitações conhecidas, sem autoridade do corpo alterada. Pacotes anteriores/hashes/SPEC/receipt/catálogos/lock preservados. Integração e aceite permanecem doDF.
''')
(e/'LEDGER-DELTAS.md').write_text('''# Deltas para integração pelo Claude DF

Os três ledgers canônicos e fontes dos pares ficaram readonly por coordenação. Aplicar os deltas após conferir o commit imutável retornado pelo GBrain.

| Destino | Delta |
| --- | --- |
| docs/99_runtime_state.md | AUD0625-F18-REVIEW-FIXES/14405 READY_FOR_NEXT_STEP: dois P2 corrigidos localmente;57controles focais e30mutantes causais; regressão final no RESULT. Next07/D9review porSHA e integraçãoDF. |
| docs/20_master_execution_log.md | 29/10 Codex, task14405/ACK14852: baseline5RED/13PASS; claims antes de mudanças, doisP2 corrigidos e sondas07+R23 adotadas; brutos/tentativas preservados; código novo sobre3dc36726d sempush; novo pacote evidence/AUD0625-F18-REVIEW-FIXES-CODEX-20261029. |
| docs/30_backlog_master.md | F18S2 P2-1/P2-2 IMPLEMENTED_LOCAL_PENDING_REVIEW; sete lacunas eR23 com evidência causal. A revisão original APPROVE_WITH_FINDINGS não é aprovação do novoSHA; DF deve solicitar novo parecer e qualificar a integração. ProduçãoNO_GO; demaisfrentes inalteradas. |

Monitoramento solicitado pelo Ricardo continua na sessão: consulta periódica de GBrain/claims, execução de tarefas explicitamente atribuídas e retorno ao Opus. Não se afirma daemon ou monitor fora da sessão.
''')
print('PACKET_CREATED',report['numPassedTests'],len(report['testResults']))
