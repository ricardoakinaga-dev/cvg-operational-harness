# SPEC0225 — recuperação corrigida; J07 e qualificação continuam abertos

Checkpoint de sessão18/10: HOWJ07 fechado para seis casos; implementação
NÃO INICIADA,26claims/24produzidos. Sem testes/SQL novos após o pedido.
[Retomada e recuperação](session-restart-20261018/CHECKPOINT.md).

Checkpoint privado `0b9357cd`, fonte limpa. Produção em `ceef0497`; a segunda
mudança corrige somente imports e um mock de teste. Sem promoção ao checkout
compartilhado, certificado, release ou crédito117/17.

A revisão independenteR1 retornou REVISE: um P1 de recuperação e uma lacuna
obrigatória de evidênciaJ07. Lead autenticou23snapshots,16fontes de suporte,
116artefatos externos e30artefatos próprios; manifesto2ff751bde6df6156e61e244e81d7d5f210b01af2e6ef34259817de5a68b8604c.
Dois probes foram reproduzidos em cópias separadas, sem mudar os originais.
[Conferência](r1-review-lead-acceptance.json),[parecer selado](code-review-r1/reviewer/verdict.json).
Lagrange foi encerrado; orçamento de código1/2, grupo único de retrabalho1/1
em andamento, sem reset ou segunda revisão iniciada.

| Evidência atual                                                                                             | Resultado observado                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [Conferência Lead](r1-current-lead-audit.json)                                                              | 201nativos e184focais PASS, bindings atuais,25paths reivindicados/24produzidos. Não é revisão independente. |
| [Journal](native-1792339483148-command.json)                                                                | 91PASS/0FAIL/0SKIP,46inputs. Inclui3readers originais/9positivos/12SQL42501/6knownbad de acesso.            |
| [Captura](native-1792339494880-command.json),[contexto](native-1792339503049-command.json)                  | 8e19PASS/0FAIL/0SKIP.                                                                                       |
| [Bound](native-1792339520819-command.json),[reinício público](native-1792339523777-command.json)            | 17e66PASS/0FAIL/0SKIP,50e34inputs.                                                                          |
| [Focais](r1-current-focals-report.json),[tipagem](typecheck-r38-command.json),[lint](lint-r20-command.json) | 184PASS/0FAIL/0PENDING em6arquivos; type/lint exit0.                                                        |
| [Build R9](build-runtime-r9-command.json)                                                                   | 20workspaces compilados; fonte de produção atual.                                                           |
| [Recurso](r1-final-resource-checkpoint.json)                                                                | PG16.15/4d8/55880 idle; schema/roles/clientes0, DBs temporários0,22legadas0 intactas.                       |

R1-01 era um defeito real: o primeiro journal hashava toolInput na ordem recebida;
o checkpoint canônico reordenava chaves e a retomada recusava o mesmo resultado.
A reprodução nativa teve[62PASS/4FAIL](native-1792338747733-command.json) no
reinício e[18PASS/1FAIL](native-1792338826626-command.json) no save-failure.
CONFIRMED e corpo único permaneceram; a falha era de recuperação.

Agora a decisão sanitizada do modo completo é destacada na mesma forma canônica
antes da primeira reserva/dispatch. O modo legado e o arquivo do hash de proposta
ficaram byteidênticos. Não se aceitam hashes incompatíveis ou permutações por
fallback; antigos registros privados com hash de entrada não canônica permanecem
em reconciliação. Nenhuma API, flag, cap, migração ou ACL de produção mudou.

Sete casos nativos com entradas não vazias, incluindo ordem inversa e aninhada,
completaram em PID novo, corpo1/toolCalls1 e valor semântico exato; cinco antes
falhavam. Os outros20inputs vazios da matriz pública foram preservados. A correção
local de R1-01 ainda depende da revisão finalR2 e qualificação composta.
[HOW e claim](r1-grouped-rework-how-and-claim.json),[prova do reparo](r1-input-repair-lead-audit.json).

A suíte completa foi executada no checkpoint anterior428d0021:
[4950PASS/45FAIL/71PENDING](j16-full-unit-report.json), além de uma falha de
pré-condição do recurso bound-fence. [Triagem](j16-full-unit-triage.json).
São43falhas da família de qualificação SDK/compiled e duas regressões adicionais
com causa reproduzida. Não se presume disposição final das43 pelo histórico.
Os71casos condicionais não contam como aprovados. A suíte completa ainda não foi
reexecutada após estas correções; J16 continua não qualificado.

As duas regressões adicionais passaram nos[18focais originais](r1-j16-compat-unit-report.json):
sete arquivos de teste usam o mesmo[barrel público físico](r1-j16-compat-resolution.json)
por caminho relativo, sem dependência de si mesmo; o mockSPEC217 de schema legado
não expandido responde a duas novas consultas de catálogo. Os faults originais
e o erro para SQL desconhecido foram conservados. Checker, manifests e lock não
mudaram. Esse mock não é prova nativaJ07.

A recompilaçãoR9 removeu três módulos históricos gerados: o perfil91 parou na
[pré-condição](r1-input-journal-binding-precondition-failure.json), antes do SQL.
Eles foram[regenerados](r1-input-reader-rebuild.json) com os mesmos três SHA,
sem reescrever o pacote selado; o perfil91 posterior passou. Depois da suíte
completa,[três roles próprias remanescentes](j16-full-unit-resource-inventory.json)
foram removidas por nome/proveniência, sem CASCADE;[banco temporário removido](j16-full-unit-cleanup.json).
Essa limpeza manual não foi apresentada como sucesso do teardown original.

Próxima ação: fechar HOW dos[14inputs J07](j07-native-gap-preparation/plan.json).
Faltam witnesses isolados de migração/expansão/ativação ausentes, wiring real de
host e fleet de processos, com todos os demais pré-requisitos válidos. A proposta
separa construtor, porta nativa, reader antigo em outro PID e bootstrap real;
nenhum desses novos procedimentos foi executado. Não reutilizar credencial nova
entre recursos de admissão nem alterar linhas CONFIRMED para fabricar ausência.

R1-E01 e J16 permanecem abertos; R2 só após o grupo estável e as provas exigidas.
SomenteJ14 e drill completoJ15 foram adiados. Todos os jobs/agentes próprios
terminaram, PG permanece reservado idle. SPEC0238 aguarda a resposta já solicitada;
nenhum novo gate humano foi presumido ou reenviado.99/20/30 readonly sob outro
owner; delta próprio atualizado. Objetivo integral117+17 continua em andamento.
