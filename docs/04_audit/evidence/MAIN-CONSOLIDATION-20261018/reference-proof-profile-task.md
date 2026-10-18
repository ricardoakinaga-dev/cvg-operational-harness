# CI-REFERENCE-PROOF-CLASSIFICATION — T2 de execução de testes

Novo achado de integração de ambiente após R2 APPROVE do código41ab2813. Não reabre nem reinicia o orçamento das duas revisões de lógica já encerradas. Testes reply/failure/tool requerem uma referência externa física, commit768fb1f3 e libs instaladas. O workflow do harness provisiona apenas este repositório e PostgreSQL, portanto não fornece esse recurso. As25provas passam na referência pinada/relocada local; a ausência do recurso é uma barreira real, não skip.

WHAT/HOW: classificar esses três arquivos como `*.integration.ts`, convenção existente das provas nativas, preservando integralmente seu conteúdo. Criar `vitest.reference.config.mts` reutilizando configuração/aliases atuais e incluindo explicitamente só os três arquivos; novo comando `test:differential:reference` com wrapper que exige CVG_DIFFERENTIAL_REFERENCE_ROOT absoluto e executa o Vitest real. Sem fallback, SKIP ou redução de threshold. A identidade e o escopo selados CI_BAR_VERSION/CI_BAR_SCOPE permanecem iguais; testes dependentes de recurso externo novo nunca fizeram parte da main pré-PR4.

Escrita finita somente na candidata: rename3 arquivos diferenciais, novo config e wrapper, um script em package.json, controle em tests/vitest-hermetic.test.ts e documentação deste perfil. Não alterar lógica já aprovada41ab2813, witness, drivers, pins, fonte de produto, contrato público, CI ou skip catalog.

Aceites: (RP01) execução sem recurso sai não-zero antes de testes; (RP02) glob padrão não coleta as provas e perfil dedicado coleta exatamente3; (RP03) mesmas25provas PASS/zero skips com referência física relocada, local original oculto; (RP04) atuais typecheck/lint/formato/certify/CI verdes sem alterar pisos/identidade do gate.

Execuções anteriores ficam preservadas como baselines, não certificados correntes. Interromper somente subprocessos próprios de unit/certify antes dos renames para não gerar árvores mistas; reap/recursos próprios verificados. Recriar apenas os dois PGs sintéticos próprios se a interrupção deixar fixtures, sem tocar em PG/processos dos pares.
