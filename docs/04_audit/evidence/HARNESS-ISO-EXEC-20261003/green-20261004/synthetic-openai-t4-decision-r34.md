# Decisão T4 — execução OpenAI exclusivamente sintética — R34

Estado: WAITING_HUMAN_APPROVAL; nenhuma autorização de execução externa registrada. Preparação readonly em 2026-10-05T18:52:31.947186+00:00.

## Ação concreta

Executar somente o runner já implementado `runSyntheticOpenAIPacket`, no candidato local congelado, com OpenAI/modelo `gpt-6-luna`, os 20 bindings de fixtures do pacote e chave privada carregada em memória do `.env` do repositório. Sem modelos/canais reais além desta chamada OpenAI específica, sem dado real, ferramentas, mensagens para terceiros, ação clínica, prontuário, piloto, push, release ou implantação. O organizador padrão, o conteúdo clínico e qualquer entrada desconhecida continuam NO_MODEL.

No máximo 20 chamadas de organização; 2.048 tokens de saída por chamada; 32.768 bytes por requisição; timeout 60 segundos; zero retries. O runner interrompe na primeira falha, dúvida, erro de fonte ou divergência da referência proposta. Guardar apenas IDs, hashes, status/categorias e uso de tokens; não persistir chave, headers, prompts ou respostas textuais. A qualificação humana/clínica continua NOT_RUN, mesmo se o teste externo passar.

## Congelamento

- [Pacote JSON exato](synthetic-openai-execution-packet-r34.json): SHA-256 `44a42656e3a32fe2ee75b79cba9be657f413c7c1ea1908bb79ef0cd2ee1e9a91`.
- Bundle de fonte conferido pela API existente: `5c59dccf6bc1282017f07fe2d7373178d49f5e92ea1bf6bd2bce0ac66b58610e`.
- Corpus: `ac8e3de6e2e972cc65af2d8b841b6c8e4d2386e8933bd8e8fb54a88847f217a2`; prompt: `c7c241ba8a65299fb8c93bcd68df7ab9c50930cf72a030a7d62e45667a62365f`.
- [Manifesto adicional de runtime/ferramentas](synthetic-openai-runtime-input-manifest-r34.json): SHA-256 `b9e76681924af9e3a5d6d6226a09a2703f4634f908aca8173339c20e8fb79171`; 871 arquivos físicos e binário Node22. Não contém `.env` ou chave. Revalidar antes de I/O; divergência impede execução.
- O recibo humano exige `AUTHORIZE_SYNTHETIC_EXTERNAL_EXECUTION`, hash do pacote, identidade humana, referência desta decisão, instante e executionId; não foi criado pela preparação.

## Evidência local e limites

[Certificação R26](final-r26-native-certify-local-pass.json): 16/16 gates PASS, 5.735 testes/413 arquivos, zero skips, AAA_CONTROLLED/CONDITIONAL_GO. [Variante sem produto](final-neutral-r25-local-pass.json): 5.100/385 PASS com PostgreSQL/cobertura; totais sobrepostos, não somados. [Segurança dos nove deltas](security-nine-delta-fresh-review-r26.json) e [consumidor compilado](product-compiled-fresh-review-r32.json) têm ACEITE independente limitado aos seus escopos.

A fronteira instalada completa permanece INCOMPLETE/8.882 diagnósticos; [140 papéis first-party aceitos](firstparty-frontier-fresh-review-r27.json) não são dispensa de closure. Esta decisão de teste não aceita HISO-005, não promove código no checkout compartilhado nem libera produção. A evidência do incidente documental R25 permanece arquivada; R26 passou após recuperar o congelamento.

## Decisão solicitada

Autorizar ou recusar a EXECUÇÃO externa deste pacote exato, somente neste escopo sintético. BUILD aprovado anteriormente não é esse recibo. A exigência vem da [D-12 / T4](../../../../07_agents/AGENTS.md) e do item 7 da [emenda sintética aprovada](synthetic-openai-amendment.md): “a execução externa é aprovada pelo pacote T4 concreto, congelado e hash-bound”.
