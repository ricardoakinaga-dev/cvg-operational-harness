# Perfil de referência dos clientes SDK — HOW proposto

O próximo resultado útil é observar os clientes Python e TypeScript reais do pin
`8d9f6466ff0294785d56f55b1fe363d132fe4133` diante de subprocessos sintéticos
controlados. O perfil permite distinguir envio, resultado, EOF, cancelamento e
saída do processo. A preparação T1 não executou os SDKs nem o compilador.

Os contratos canônicos estão em [perfil](execution-profile.json),
[dependências](dependency-proposal.json), [captura e contenção](containment-and-observer.json)
e [casos](cases.json). A [cobertura](coverage.json) conserva os 44 contratos,
incluindo todos os que este primeiro perfil ainda não exerce.

## Identidade e fronteira

O hash do ELF do intérprete identifica um executável; os hashes da fonte SDK,
dependências, configuração, driver, loader e observador identificam os demais
inputs. Uma versão informada pelo peer sintético é dado de teste. O cliente
Python não é o binário Codex e a fixture não é seu app-server real.
O TypeScript usará um perfil de transpile com TS5.9.2 e loader restrito,
explicitamente distinto do bundle tsup publicado e de sua superfície de tipos.
Essas distinções impedem transferir uma prova local para a distribuição oficial.

## Ordem de execução e stops

1. Adquirir apenas os sete artefatos exatos da proposta em cache privado,
   conferir digests/metadata/closure e selar a árvore extraída. Não instalar.
2. Preparar os drivers e fixtures concretos e conferir os pré-requisitos de
   namespace/cgroup/loader/observador. Conferir os campos gerados e parser de
   erro usados nas fixtures Python. Nenhum placeholder entra em execução.
3. Congelar os arquivos novos e o argv/env/mounts; qualificar o compilador em
   contenção antes de transpile. Selar o emit e conferir ausência de imports
   externos não selecionados. Parar se houver dependência ou diagnóstico aberto.
4. Executar cada caso uma vez, serialmente, com limite finito e sem retries.
   Guardar todas as falhas e bytes parciais. Erro de admissão não vira skip.
5. Conferir captura e limpeza por observador independente do SDK e da fixture,
   revisar os resultados e só então aceitar observações do cliente no seu escopo.

O gate de cada estágio é uma precondição verificável antes do seguinte. Este
documento não registra que os estágios já ocorreram. As tarefas seguintes são
reversíveis e locais sob o pedido integral, com claim e HOW concretos; qualquer
novo contrato público continua sujeito ao gate próprio.

## Significado dos resultados

O aceite literal do handler Python permanece um fato do cliente, separado do
approval institucional. EOF ou retorno parcial TypeScript não cria terminal
nativo. Cancelamento, sinal e close não provam que não houve efeito ou que um
descendente foi recolhido. Os recibos funcionais continuam zero.

A SPEC0239 e seus oito anexos continuam aguardando a decisão T3 já solicitada;
esta preparação não concede BUILD nativo nem substitui a qualificação dos
owners de persistência. O catálogo 487+22 permanece inalterado. A referência
com o Codex CLI real, wheel/npm distribuídos, outras plataformas, typecheck e
todos os contratos ainda abertos permanecem obrigatórios no programa.
