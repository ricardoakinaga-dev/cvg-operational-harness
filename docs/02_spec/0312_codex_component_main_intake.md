# SPEC0312 — integração seletiva dos componentes Codex na main publicada

Task `CODEX-INCORPORATION:CURRENT-MAIN-INTAKE`. T2, candidata privada; escopo KR03/KR13 e transporte de assets. **READY_FOR_SCOPED_PRIVATE_BUILD**, sem promoção canônica ou release. Aplica os contratos internos já revisados e a correção de metadados do pedido admitido; não acrescenta API, schema, policy, identidade ou o delta `originalReturns`. Os gates públicos pendentes de0310/0311/0239 continuam próprios.

## Problema e fontes

A revisão `5be0ca7078ceda425a7335eca3c36243dd146ee1` contém três componentes implementados e revisados em bases privadas: transporte de `native/runtime`, intake interno de cleanup e snapshot dos perfis/preços do gateway. Sua certificação nativa está em execução separada. A `main` publicada foi conferida pelo conector GitHub em `a2f345a3b7fac79f8a1506d369b9371f92e187c8`.

O [recon de alvo](../04_audit/evidence/CODEX-INCORPORATION-20261101/main-target-recon/source-comparison.json) encontrou 127 caminhos distintos sob packages/apps/legacy/products, incluindo54 do consumidor. Um merge inteiro carregaria mudanças alheias ao escopo. Os sete paths próprios passaram em `git apply --cached --check` combinado e individual, sobre índice temporário que permaneceu idêntico às 89.160 entradas do alvo. Isso prova aplicabilidade textual; não prova compilação, comportamento ou aceite.

## O que será aplicado

Usar exclusivamente o [patch de sete paths](../04_audit/evidence/CODEX-INCORPORATION-20261101/main-target-recon/own-seven-paths.diff.txt), com digest na [task](../04_audit/evidence/CODEX-INCORPORATION-20261101/current-main-intake/task.json):

- `scripts/build-runtime.mjs`, `scripts/lib/runtime-native-assets.mjs` e `tests/runtime-native-assets.test.js`;
- `packages/harness/src/kernel/host.ts` e `packages/harness/src/__tests__/managed-native-cleanup-intake.test.ts`;
- `packages/model-gateway/src/gateway.ts` e `packages/model-gateway/src/__tests__/aud0625-par-m02-frozen-request.test.ts`.

A cópia será por hunks do patch na candidata própria, preservando o restante do alvo. Não substituir arquivos inteiros com versões do donor. Conflito, pré-requisito ausente ou diferença semântica inesperada interrompe a aplicação para disposição concreta; não amplia os sete paths ou relaxa controles automaticamente.

## Invariantes

1. O runtime build conserva os vinte workspaces e copia apenas os assets nativos previstos, sem seguir links proibidos. O canário de transporte não qualifica um backend ABI.
2. O cleanup conserva a causa primária, executa os demais disposers, mantém suas promises originais e não declara quiescência por timeout. A primitive não implementa o owner completo ou um novo factory.
3. O gateway captura perfis primário/fallback e preços antes da espera; pedido, eventos e resultado descrevem a configuração admitida. Objetos emprestados do host permanecem mutáveis e chamadas futuras observam sua configuração atual.
4. API, barrels, declarações públicas, política e controle de efeitos permanecem nos contratos do alvo. As declarações do módulo interno do host incluem os seams de cleanup já previstos, ausentes dos exports públicos do pacote. Nenhuma capacidade ausente recebe crédito por uma recusa.
5. `package.json`, manifests dos workspaces e lock permanecem byte a byte iguais ao alvo. A identidade dos pacotes instalados precisa ser conferida contra o lock do alvo, incluindo o vínculo de desenvolvimento do sandbox; identidade de versões não é igualdade do lock inteiro.
6. Nenhum path de produto, fonte da candidata5be congelada ou arquivo de outro agente será alterado. O port privado não transfere ownership canônico.

## Como e critério de pronto

Criar worktree privada no commit publicado exato. Checkout reduzido pode servir a compilação e testes focais; a qualificação global exige árvore completa e limpa. Materializar dependências físicas compatíveis com o alvo, sem install, download ou mudança de lock. Aplicar e inspecionar somente o patch congelado; o diff final precisa conter os sete paths e nenhum outro.

Executar typecheck, lint/formato dos paths, testes de assets, cleanup e gateway com seus controles positivos/negativos, build real dos vinte workspaces e consumidor dos pacotes instalados. Reusar os oráculos aprovados, preservando falhas e distinguindo limitações da nova base. Conferir declarations/exports e a origem efetiva dos módulos; não substituir runtime por helpers de teste. Fonte ou oráculo alterado exige registro e disposição proporcional, sem fabricar comparabilidade.

Congelar o resultado e obter revisão CODE independente dos bytes reais deste alvo antes do commit seletivo. Os pareceres das bases anteriores orientam a revisão e não aprovam automaticamente este resultado. Rodar T2 completo, cobertura e certificação do candidato integrado exato com claims próprios, depois de encerrar a certificação atualmente ativa; um certificado de5be não se converte em certificado deste port. Integrar em `main` depende da reconciliação dos holders e dos gates atuais; push exige autorização do usuário.

Estado inicial: código do port **NOT_BUILT** e testes desta base **NOT_RUN**. O pacote mantém o objetivo integral de18 recortes,12 comandos e CQ01–14, sem mudar o catálogo487+22 ou conceder produção.
