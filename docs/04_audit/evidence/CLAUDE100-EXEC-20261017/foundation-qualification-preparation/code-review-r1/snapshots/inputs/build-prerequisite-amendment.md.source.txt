# Pré-build do sandbox observado no primeiro compile

O primeiro `build:runtime` terminouexit1/tsc2. Seu primeiro diagnóstico é
channel-gateway/exam-egress.ts sem resolver `@cvg/sandbox`; o manifesto declara
essa dependência, mas RUNTIME_WORKSPACES não inclui sandbox. Erros de persistence,
agent-core e hosts seguem essa primeira quebra. Os outputs contratos/shared/
platform foram emitidos; não se rotula a compilação completa como aprovada.

Há outro comando existente: `scripts/build-public-workspace.mjs`, que percorre
dependências reais, remove source aliases, mantém noEmitOnError e usa configs
temporárias próprias. Antes de qualquer outro source change, a sequência
ajustada de preparo será esse script com target packages/sandbox, depois o
build:runtime inalterado. Ambos somente na candidata nova e TMP próprios. Nenhum
artefato será copiado de candidata anterior, nenhuma flag/pin será afrouxada.

Esta é uma hipótese nova fundada no erro e nos manifestos, não repetição do mesmo
comando sem alterar pré-requisito. Limite desta adaptação: um pré-build e uma
nova execução do runtime builder. Outro bloqueio exige nova análise, sem editar
scripts/compiler/fixtures fora do scope de dois manifestos.

O contexto empacotado pelo runtime builder ainda não copia sandbox/dist, mesmo
se a compilação posterior concluir. Portanto ele **não será classificado como
imagem/contexto completo ou pronto para deploy**. Essa lacuna de fecho de
workspace pertence a correção separada do builder; nesta etapa medem-se outputs
reais de compilação para testes. Fonte dos dois scripts permanece protegida.
