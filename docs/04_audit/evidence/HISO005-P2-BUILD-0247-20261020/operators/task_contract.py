"""Task contract of HISO005-P2-BUILD-0247, registered before any source edit: SPEC0247 §7 acceptances (MC01–MC09),
§5 stop rules, version-literal migration (§3.7 and §5 'Migração literal') and the scope of the delta. usage: task_contract.py"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

assert sha(PROJECT / SPEC[0]) == SPEC[1]
assert head() == BASE and git('status', '--porcelain', '--untracked-files=no') == ''
lit = subprocess.run(['git', 'grep', '-n', OLD_VERSION, '--', 'scripts', 'tests'], cwd=CANDIDATE, capture_output=True, text=True).stdout.splitlines()
tests_with_literal = sorted({l.split(':')[0] for l in lit if l.startswith('tests/')})
contract = {
 'task': TASK, 'track': 'T3 aprovado (BUILD local)', 'registeredAt': now(),
 'owner': 'Claude Code (executor delegado, sessão lead CONT-20261018-D9EF)',
 'authority': {'spec': SPEC[0], 'specSha256': SPEC[1], 'specTarget': SPEC_TARGET, 'decision': DECISION, 'decisionSha256': sha(PROJECT / DECISION)},
 'base': {'commit': BASE, 'what': 'BUILD0245 (kernel v6 semantic-kernel-v6-tsx-parse, engine bcbb49ab…); a promoção será patch sobre a main que vier, conferindo pré-imagens'},
 'candidate': str(CANDIDATE), 'runtime': str(RUNTIME), 'detached': True,
 'evalRoot': {'path': str(EVAL_ROOT), 'commit': EVAL_COMMIT, 'rule': 'só leitura; 1.410 sha256 antes, durante e depois; medição só com a raiz parada (sem arquivo mudado fora de node_modules/.git nos últimos 120 s e sem build alheio), repetida se mudar'},
 'delta': {
   'C0': 'classificação sintática das alças do wrapper CJS (9 categorias da §3.1, lista fechada de posições que não contam); cada categoria emite UNKNOWN_CJS_EXPORTS no módulo, com a categoria como detalhe, na passagem normal e no census; com ao menos uma, o valor devolvido a todo importador é U (primeira carga e cache)',
   'C1': 'valor rastreado inicial = objeto exports opaco por módulo (identidade por arquivo); não decide if/?:/!/===/!==/+/template; propriedade, chamada, reflexão, chave computada e especificador recusados; checkExport não emite tupla para ele',
   'C2': 'escrita reconhecida substitui; if com condição K1 avalia um ramo; if não decidido: união dos valores no fim de cada ramo (ramo ausente = valor de antes), seguindo maxUnionValues; só em módulo CJS',
   'C3': 'checkExport no fim do topo sobre o valor rastreado, também quando a C0 dá U aos importadores',
   'version': OLD_VERSION + ' → ' + NEW_VERSION + ' (§3.7: base v6 da SPEC0245)'},
 'sourcesToChange': ['scripts/boundary-semantic-engine.mjs (C0–C3 e versão)', 'tests/b6-0247-cjs-export-value.test.js (novo: 71 fixtures do catálogo + T1, T2, T2b, T3, Q3 da R2)'],
 'notChanged': ['limites (SPEC0242)', 'receitas (SPEC0243)', 'perfil de resolução', 'regra global de prova', 'aquisição, resolução e formatos', 'módulos ESM'],
 'literalMigrationsRegisteredBeforeEdit': [{'files': tests_with_literal, 'occurrences': [l for l in lit if l.startswith('tests/')],
   'from': "'" + OLD_VERSION + "'", 'to': "'" + NEW_VERSION + "'",
   'firstFailure': 'rodar esses arquivos com o engine novo antes de trocar o literal; falha preservada em first-red-0247-version-literal'}],
 'stopRules': [
   'PROVEN em fixture dos grupos A, B, D ou V (§5)',
   'tupla ou violação fora da §3.6 (regras 1–4, por causa)',
   'diferença de tupla ou de payload na raiz real, fora a telemetria e o literal de versão (semanticBoundary.kernelVersion) (§3.6 regra 5)',
   'validation false',
   'estouro, ENOBUFS, corte ou erro de worker',
   'obrigatório de revisão que peça código na R2 (parar e reportar)',
   'divergência dos 1.410 inputs da raiz avaliada',
   'contrato SPEC0247 com sha256 diferente de 082ad2f4…'],
 'acceptance': {
   'MC01': 'primeira falha na base: os 18 fixtures do grupo A dão PROVEN',
   'MC02': 'vN: grupo A UNKNOWN, com UNKNOWN_CJS_EXPORTS no módulo escrito (família F3) ou com as tuplas do código alcançado pela junção ou pelo objeto inicial (famílias S10 e INIT)',
   'MC03': 'grupo B: tuplas da base mantidas, mais UNKNOWN_CJS_EXPORTS com a categoria certa onde há alça (inclusive X04 e X05, por nome computado); no importador que lê o valor U (H-top-return), as tuplas da §3.6 regra 2; ESM sem mudança',
   'MC04': 'grupo C PROVEN; grupo D UNKNOWN; nenhum PROVEN novo',
   'MC05': 'grupo V: V-literal mantém a violação; as cinco que somem são listadas tupla a tupla e classificadas como na §3.6',
   'MC06': 'raiz real: tuplas e payload iguais aos da base na mesma época, fora a telemetria e o literal de versão; normal igual a strict; validation true; zero provas; denominadores publicados',
   'MC07': 'limites, perfil e receitas iguais; versão nova',
   'MC08': 'regressões B6 (0228–0245) preservadas; crítica fresca sem obrigatórios; 16 gates Node22; consumidor fresco',
   'MC09': 'promoção só do delta próprio; sem push, deploy ou produção'},
 'extraCases': {'source': 'docs/04_audit/evidence/HISO005-P2-CJS-SOUNDNESS-SPEC-20261020/review-r2/review.json (testsRun)', 'cases': ['T1', 'T2', 'T2b', 'T3', 'Q3'],
                'why': 'lead-review-r3.json: entram como testes do BUILD0247; não estão no catálogo de 71'},
 'mutants': {'mC0': 'sem classificação C0 (nenhuma categoria)', 'mC0r': 'C0 só com raiz, importador recebe o valor rastreado (alternativa R)',
             'mC1': 'valor inicial VOID (v5/v6)', 'mC1s': 'objeto inicial não silencioso no checkExport', 'mC2': 'sem junção (o último ramo vence)',
             'mC3': 'checkExport não roda quando a C0 dá U (alternativa S)',
             'rule': 'cada mutante roda o teste novo com os bytes congelados; precisa morrer (ao menos uma falha)'},
 'resources': {'pg': 'só no certify: ' + PG_NAME + ' em %d; API %d; web %d, conferidos livres' % (PG_PORT, API_PORT, WEB_PORT),
               'npx': 'NO_UPDATE_NOTIFIER=1 e npm_config_update_notifier=false em todo npx/npm; cada execução registrada',
               'forbidden': ['push', 'PR', 'commit na main ou no checkout compartilhado', 'deploy', 'produção', 'dado real', 'rede externa', 'install/lockfile', 'SPEC0246',
                             'ledgers 99/20/30', 'agent_coordination.md', 'empty-artifact-status.json', 'docs/02_spec', 'outra pasta de evidência',
                             'worktrees cvg-d9ef-pr10-20261020, cvg-d9ef-pr9-20261020 e cvg-hiso005-build0245-20261020 (além de copiar node_modules)', 'pkill -f']},
 'review': 'crítico novo, não-fork, só leitura, até 2 rodadas, 1 reparo agrupado entre elas; R2 que peça código: parar e reportar'}
save('task-contract.json', contract)
print(json.dumps(contract['literalMigrationsRegisteredBeforeEdit'], indent=1))
