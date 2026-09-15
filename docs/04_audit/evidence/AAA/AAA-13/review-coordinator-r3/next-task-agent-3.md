# Próxima tarefa — Agente 3: AAA-13 / AAA13-C3-F01

Execute somente o rework de AAA-13 conforme `docs/04_audit/evidence/AAA/AAA-13/review-coordinator-r3/REVIEW.md`. Leia AGENTS e runtime/log/backlog, o parecer, a barra AAA-04 v2 tecnicamente congelada e o probe. Não inicie full certify nem altere outras frentes.

Objetivo único: o verificador público não pode qualificar um candidato quando os gates só foram declarados PASS sem evidência obrigatória verificável.

1. Reproduza `qualification-probe.mjs`. Preserve como RED um teste que exija rejeição: hoje o CLI aceita zero gates executados, zero logs e `artifacts=[]`. O self-test N1–N9 passa apesar desse contraexemplo.
2. Defina, em adendo de AAA-13, a matriz gate→artefatos obrigatórios→runner/parser→inventário→vínculo candidateId/runId. Verifique logs/resultados/exit codes, skips obrigatórios e integridade; derive o veredicto dos dados brutos. Impeça omissão e duplicação ambígua de gates/artefatos. Não aceite PASS/exit 0 autodeclarados como prova e não resolva apenas com array não vazio. Registre o limite de confiança: hashes sozinhos não autenticam um produtor que controla todos os arquivos.
3. Corrija o menor escopo em scripts/lib/certification-rules.mjs, scripts/phase10-verify.mjs e scripts/phase10-certify.mjs. Os três paths ficam reservados a você neste rework local; mudanças de package.json/lockfile exigem handoff separado e não estão incluídas. Preserve modo histórico, bytes do arquivo histórico e distinção entre qualificação técnica e signoff humano.
4. Faça regressões no CLI real em fixtures isoladas: manifesto vazio, gate/log ausente, status PASS com dados brutos de falha, skip obrigatório escondido, exit divergente, evidência antiga/candidato divergente e um controle positivo completo. Reexecute N1–N9; nenhum teste deve passar por falha incidental diferente do ataque que pretende comprovar. Não altere certificados compartilhados para testar a rejeição.
5. Publique nova versão de evidência AAA-13, com hash dos scripts, RED/GREEN, comandos/exit codes, mapa finding→teste e validações exigidas pelo AGENTS para código. Respeite slots de gates globais; registre NOT_RUN/BLOCKED quando faltar recurso. Não execute certify completo antes de correção revisada e janela estável.

Ownership documental: seus artefatos de AAA-13 em nova versão, preservando manifesto/reviews anteriores. Não editar runtime/log/backlog/ledger/0327, contratos de outros agentes, .prettierignore ou produto de outras frentes. O coordenador integra seu próximo retorno. Se a correção exigir mudança normativa além da barra vigente ou faltar gate aplicável, entregue adendo e bloqueio preciso; não fabrique autorização.

Entregue IMPLEMENTED ou BLOCKED. Não autoaprovar DONE, não redistribuir Agentes 1/2 e não iniciar AAA-14/15 ou task nova nesta rodada.
