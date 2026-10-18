# DecisãoT3 — comparador inicialClaude100

Pedido concreto: aprovar BUILD **local e sintético** de `C100-Q01-QUALIFIER-001`, exatamente conforme a [SPEC0229](../../../02_spec/0229_claude100_initial_qualification.md), SHA-256 `bb42eb61cbd30c5720b00ef3145d9fdac4196b942eb3c42bff1d94acf4fe8243`.

[Revisão independenteR2](g02-g04-review-r2/verdict.json): `ACCEPT_DOCUMENTARY_AND_SPEC_REVIEW_READY`,33/33pins,zero findings novos; três findingsR1 eP3CLI resolvidos. Esse parecer não é decisão humana. Implementação eCQ01–CQ08 permanecemNOT_RUN.

## Resultado autorizado se aprovado

Validador local de manifestos/capturas e comparadorEXACT_JSON/BYTES comCLI, limites, índices confiáveis separados, envelopes vinculando entrada/execução/artefatos e relatórios sem autoaprovação. Escrever somente paths de qualificação propostos na SPEC, em candidata própria, reusando o kitQ03 após qualificado. Executar positivos/negativos e gates aplicáveis com dados sintéticos e revisão independente.

O mecanismo isolado não fechaC100-Q01, M1, família ou obrigação funcional. Não acrescenta runtime, schemaSQL, policy/approval, sandbox, credenciais, serviços/contas reais ou release. A jornadaM1 e os novePAR necessários conservam seus contratos/gates próprios. Os exemploswire são dados fabricados; não há captura funcional ou aprovação real neles.

## Por que requer decisão

A [constituição operacional, D-12/T3](../../../07_agents/AGENTS.md) exige: “T2 + revisão explícita da SPEC pelo usuário antes do BUILD”. O cartãoQ01 permaneceT3; não se infere essa revisão da aprovação do plano ou de uma revisão técnica automática. Este é o contrato concreto já preparado e revisado para a decisão final do usuário sobre esta unidade.

Estado atual:`WAITING_HUMAN_APPROVAL / BUILD_NOT_AUTHORIZED`. Enquanto a decisão estiver pendente, continuar apenas trabalho independente já autorizado, incluindo a certificaçãoT2Q03/SPEC0233 em execução. Uma resposta deve identificarSPEC0229/este escopo; mudança do contrato ou hash exige nova revisão aplicável.
