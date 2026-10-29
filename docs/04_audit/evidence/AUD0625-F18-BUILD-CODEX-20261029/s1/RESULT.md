# F18 S1 — defesa de aprovação sem grant

12694/recibo11, base02c1002a3, branch codex/aud0625-f18-build-20261029. Fatia vertical local, não o fechamento deF18. Execute recusa com INSUFFICIENT_EVIDENCE/approval_unbound quando descriptor/needsApproval/policyREQUIRE exige aprovação mas falta grant. Caminho sem exigência continua delegando. Pre-execute considera as três fontes independentes da exigência; reserva/corpo/settlement existentes preservados.

P3 incorporados antes dafix: R2 exige TOOL_FAILURE+unknown_effect+complete1; R4 exige POLICY_DENIED+corpo0+reserva0+efeitosvazios. Novas RED de needsApproval/policyDecision/approval e nextduplicado/ausente. Baseline seminversão12REDcausais/6controles, zero setupfail. DepoisS1:190casos reportadosverdes,183ordinários+7expectedfail restantesF18,0skip/pendência. R1, needsApproval e3negativosdiretos viraramGREEN. Mutante retira sóafence degrant:3assertivasfalham/1controlePASS. Fonte restaurada byte a byte.

Node22typecheck0/18.351s;lint0/1.867s;formato0. SemsuiteglobalPGDockerCI/push. Nenhumarquivo catalogadoPG/mutation alterado; policy-engine fora do diff. Restam estado privado/monotonicidade/next e7RED, planejadosS2. Revisão independenteD9 e integraçãoDF pendentes; produçãoNO_GO. Não alterar hashdaSPEC aprovada.
