# Decisão T3 — BUILD local do qualificador CodeX

Task DX100-Q01-QUALIFIER-001. Estado **WAITING_HUMAN_APPROVAL**, sem código da implementação iniciado. A [SPEC0231](../../../../../02_spec/0231_codex100_initial_qualification.md) está congelada no SHA **e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af**. A [baseline509](catalog-baseline-proposal.v1.json) tem SHA **33087dcbf76007ef251a2115b6da31a3d0a0bf0681a41ec9d22c44e49f888ea2**.

Escopo concreto: criar CLI CodeX e perfil fechado do catálogo; compartilhar o qualificador C100 existente, preservando seu default; impedir alias numérico na comparação JSON CodeX e preservar provas por bytes; testar integridade/origem/autoridade/erro/efeito/paths/compatibilidade pelos12aceites QK. A lista de arquivos e as regras completas estão na SPEC. O [plano condicional](build-plan-proposal.json) define quatro marcos de implementação/verificação em candidata própria.

A [revisão independente R2](review-r2/review.json) ficou READY_FOR_HUMAN_T3_REVIEW/zero findings, após corrigir o P1 que rejeitaria os22controles CROSS_CUTTING. O [Lead reconferiu17inputs congelados](SPEC-Lead-readiness.json); não houve alteração de semântica depois dessa revisão. QK e funções novas permanecem NOT_RUN até BUILD/verificação reais.

A aprovação solicitada é para esse BUILD local e seus gates, sem código de runtime/SDK de aplicação, schema SQL, provider, política/approval institucional, produto, default0226, push ou deploy. Regras de comparação funcional futuras e seus recibos não são aprovados por criar o mecanismo. A primeira jornada CQ01–14, os49cartões e todas as487obrigações funcionais+22controles continuam obrigatórios; este enabler não os substitui.

Motivo da revisão humana: [AGENTS.md, governança proporcional](../../../../../07_agents/AGENTS.md) exige, na trilhaT3, “T2 + revisão explícita da SPEC pelo usuário antes do BUILD”. O cartão Q01 éT3 e esta unidade acrescenta contrato local de qualificação CodeX. O pedido de implementar o programa não é tratado como revisão de uma SPEC que ainda não existia.

Depois da decisão: registrar ator/resposta/escopo/hash e gate aplicável; conferir claims/pré-imagens/recursos; preparar candidata isolada; implementar os deltas autorizados; executar controles e gates Node22; crítica independente do candidato; integração seletiva somente com pré-imagens/gates atuais. Bloqueio de baseline/HISO/B6 permanece explícito, sem mudar checker, bar ou pins para obterverde. Todos os processos de referência/sonda desta rodada já foram encerrados e suas evidências preservadas.
