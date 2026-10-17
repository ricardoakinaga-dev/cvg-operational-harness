# Proposta T1 — procedimentos de escalada de sandbox

Esta fatia prepara rastreabilidade para P100-003/P100-024. Preserva as427entradas originais (250STATIC/177UNKNOWN), o denominador44132 e todos os critérios do programa. A triagem de ownership R23 já foi aceita; não é refeita aqui.

[Escopo](scope.json) seleciona149contratos de nove fontes para investigação. Seleção por arquivo não é cobertura: apenas32entradas têm [ligações propostas por símbolo/contrato](semantic-proposals.json), com quatro [procedimentos futuros](procedures.json). As395restantes, incluindo117das fontes selecionadas e todas278fora delas, ficam [explicitamente pendentes](pending-bindings.json). As três UNKNOWN das32propostas continuam UNKNOWN. Fonte-surface não recebe procedimento só por estar no arquivo.

Os procedimentos tratam pairing, modos por chamada, aprovação para uma chamada e textos diagnósticos. A fixture codifica ausência por chave opcional ausente, sem transformar null em undefined. Um retorno de modo ou texto de sugestão nunca é autoridade para executar efeito; policy, approval, tenant, journal e sandbox do CVG continuam obrigatórios. O canal futuro é sintético e não envia solicitação a pessoa/serviço real.

O [gap de vocabulário](mode-vocabulary-gap.json) separa política de arquivos da referência e modos de gate CVG. Não há tradução automática por nome. A fronteira pública equivalente no CVG exige contrato T3 concreto antes de implementação; este pacote não o cria nem o aprova. Correspondência source-lib/ABI e isolamento real por plataforma permanecem sem prova.

Todo procedimento está NOT_RUN. Não há PASSfuncional, aceite semântico, autorização de BUILD ou fechamento de P100-003/P100-024. SPECs0220/0221/0222 continuam aguardando decisão humana; o pedido0222 já foi apresentado e não deve ser reenviado.
