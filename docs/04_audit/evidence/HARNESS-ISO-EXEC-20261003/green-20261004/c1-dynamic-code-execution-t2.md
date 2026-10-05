# C1 — execução de código desconhecida, correção T2

Task HARNESS_ISO_GREEN_20261004/C1_CODE_EXECUTION. BUILD local contínuo autorizado pelo usuário. Mantém o contrato HISO-005 de recusar resolução/capacidade de carregamento desconhecida; não altera a barra, API do programa, policy, dados ou comportamento clínico. Sem provider real, push ou produção.

Node22 reproduziu cinco falsos PASS do checker atual: eval, Function, execFileSync, Worker e VM com loader padrão carregam marcador sintético do produto. Source/runner/resultados físicos em /home/ricardo/.cache/cvg-harness-green-20261004/c1-code-execution-r1/before/results.json; cada caso retornou gatePass true e nativeProductLoaded true. É novo finding P1 de fronteira, não descoberta de escrita clínica ou efeito externo.

Correção exclusivamente na cópia c1-code-execution-candidate: scripts/check-product-boundary.mjs, helper próprio e novo teste. Identificar por AST capacidades de avaliação/constructors dinâmicos, módulos vm/child_process/worker_threads e reflexão que pode adquirir evaluators; propagar aliases/bindings locais e recusar operação/escape desconhecidos. Não avaliar strings de usuário, permitir namespace global desconhecido, diminuir roots, excluir vendor/.d.ts/tests ou inventar resolução. Sem alterar testes originais ou suas asserções.

Verificar positivos neutros e carregamentos identificáveis, negativos originais221 e novos processos Node reais, tipos/lint/formato, after antes/depois source/deps/dist, nova revisão independente e gates integrados/PG/E2E antes de promoção. InstalledINCOMPLETE permanece explícito; cinco negativos recusados não conferem aceite geral de HISO-005. Sem filtro amplo ou interpretação de zero violações como isolamento comprovado.
