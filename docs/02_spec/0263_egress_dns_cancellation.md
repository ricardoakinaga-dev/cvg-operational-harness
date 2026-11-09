# SPEC0263 — cancelamento durante DNS e entre hops

R2, 23/10/2026. Task `PROD0624-U06-DNS-001`, unidade U06 do0399,
pai HISO-011. Estado `PROPOSED_FOR_TECHNICAL_REVIEW`, T3.
**Nenhum BUILD nesta etapa.** HISO-005/HISO-006 continuam pré-requisitos;
aprovação desta proposta não os conclui nem dispensa. A SPEC0248 excluiu
packages/shared de seu escopo; não estender sua autoridade a este delta.

## 1. Problema demonstrado e escopo

Fonte `9a56a9c94db3e46291f2ba1de002763eee89ff39`.
[Caracterizações atuais](../04_audit/evidence/PROD0624-EXEC-20261023/u06/dns-baseline-result.json):
controle válido conclui e endereço privado é recusado; sinal previamente
abortado ainda chega ao fetch injetado. Abort durante DNS inicial ou de um
redirect não encerra a promise na janela observada; liberar o lookup permite
entrar no fetch injetado. Não é prova de envio real: nenhum socket/DNS externo
foi aberto. O transporte real pode recusar o sinal ao entrar.

O guard aguarda lookup sem sinal e não revalida cancelamento por hop.
Providers aguardam esse guard; canais fazem race no caller, mas o trabalho
abandonado continua. Exam-egress resolve antes do efeito e depois novamente
no guard, devendo compartilhar o mesmo prazo.

Alteração finita: shared/ssrf e seus callers atuais, com testes. Preservar
orçamento/modelo/custo, limites de bytes e status da0248, pinning/Host/SNI,
allowlists/protocolos, allowLoopbackOnly e máximo de redirects existentes.
Não autoriza rede privada adicional, retry de efeito incerto, modelo clínico
ou alteração de política de workspace. Não muda limite para obter testes verdes.

## 2. Contexto único da operação

Usar o AbortSignal já composto pelo caller uma única vez antes da operação.
Seu timeout continua absoluto: DNS, hops, dispatch e recepção consomem o
mesmo prazo; nenhum hop cria ou renova timeout. Não criar outro campo público
de deadline, relógio ou novo limite nesta fatia.

- `resolveAndGuardOutboundUrl` ganha `signal?: AbortSignal` em seu terceiro
  argumento de dependências. `EgressDns.lookup(hostname)` permanece compatível.
- `fetchWithSsrfGuard` extrai `init.signal`, valida quando presente e o passa
  para toda resolução e espera. Os demais argumentos e BoundFetchImpl
  permanecem compatíveis; init entregue ao transporte conserva esse sinal.
- Ausência de sinal preserva o perfil legado sem garantia nova de prazo.
  Os callers geridos abaixo devem passar o sinal; não usar ausência como
  fallback depois de erro. Sinal presente mas inválido é TypeError antes de I/O.
- Providers OpenAI-compatible/Ollama reutilizam o sinal de
  combineTimeoutSignal(request.signal,request.timeoutMs). Canais
  Evolution/Chatwoot reutilizam o timeout atual criado antes do guard.
  Não ampliar CanonicalOutboundMessage com sinal novo nesta proposta.
- Exam-egress passa seu sinal combinado também à resolução preliminar,
  além do fetch posterior. Seu tratamento atual de recusa/falha e efeito
  journalizado permanece; cancelamento não solta lease permitindo reenvio
  de operação que pode ter produzido efeito.

Não tratar timeout de uma consulta DNS como permissão para repetir a operação.
Não usar cancelamento global do resolver, que poderia atingir outro caller.

## 3. Espera e decisão de dispatch

Um helper interno recebe thunk e sinal. Primeiro verifica pre-abort; depois
INSTALA o listener e relê aborted ANTES de invocar o thunk. Só invoca se ainda
ativo. Captura throw síncrono, resolve thenables como promise e instala os
handlers de fulfillment/rejection também se o thunk abortar sincronamente
durante sua invocação. Esse abort pode liquidar a promise pública, mas não
pode pular a observação do resultado/rejeição retornado pelo thunk. O settler
é idempotente e remove seu listener em toda saída. Uma rejeição tardia
continua observada, sem unhandledRejection; nenhuma continuação perdedora
inicia novo trabalho. Testar explicitamente thunk que aborta sincronamente e
retorna promise que permanece pendente, além de throw síncrono.

Aplicar esse helper à resolução DNS e à espera pelo fetch de cada hop.
O guard revalida o sinal após cada await e imediatamente antes de invocar
fetchImpl/boundFetchImpl, sem await entre a última verificação e a invocação.
Com sinal abortado, nem DNS novo nem entrada no fetch são permitidos, inclusive
URL literal. Resultado DNS tardio é descartado; não inicia validação seguida
de dispatch. Abort observado entre resposta e próximo hop impede o próximo
lookup/fetch. Trabalho já entregue ao transporte antes do abort não é desfeito.

Cada URL continua passando validação estática e de TODOS os endereços
resolvidos. O transporte Node padrão recebe exatamente esses endereços,
preservando hostname/Host/SNI; não resolver novamente no socket ou usar fetch
global como fallback. Os mesmos limites de redirect e bytes continuam ativos.

O lookup padrão usa node:dns/promises.lookup; esta proposta cancela a
ESPERA lógica, não promete interromper getaddrinfo/libuv. Uma consulta já
iniciada pode permanecer no SO até terminar; seu resultado não tem autoridade
para despachar. No máximo uma resolução pendente é abandonada por operação,
sem retry ou hops posteriores. Não alegar liberação imediata de recurso do SO
nem encerramento de processo comprovado só com lookup fake.

O resolver padrão continua usando import dinâmico, preservando a fronteira
Node/browser. Seu helper privado recebe o sinal capturado da operação:
depois de await import('node:dns/promises'), revalida esse sinal imediatamente
antes de lookup real, sem await entre check e chamada. Se o import terminar
após abort, não inicia getaddrinfo. O callback público injetado
EgressDns.lookup(hostname) não ganha parâmetro obrigatório. Prova controla a
barreira de carregamento do módulo por mock do test runner, sem novo override
público; contar zero chamadas ao lookup real depois de abortar nessa barreira.

## 4. Erros e recursos

Cancelamento não vira UnsafeUrlError/dns_resolution_failed. Usar erro constante
AbortError; quando o motivo reconhecido for TimeoutError, preservar essa
categoria. Motivo customizado/string/objeto não é conteúdo de erro ou log;
normalizar para AbortError. No catch do lookup, revalidar sinal antes de mapear
erro DNS. Sem cancelamento, falha/resultado vazio/privado mantêm os erros
UnsafeUrl existentes. Se o sinal for observado abortado antes do dispatch,
cancelamento prevalece mesmo que a resolução tenha acabado antes.

networkError dos providers continua mapeando AbortError→cancelled e
TimeoutError→timeout, com mensagens constantes. Canais e exam-egress mantêm
seus mappers atuais. Nenhum timeout/cancelamento autoriza retry automático
que os contratos de efeito atuais proíbam.

A normalização acima é do novo helper durante DNS/espera do fetch. Não
anunciar normalização de reason customizado no reader depois que a resposta
terminal foi entregue: readBoundedText e mappers posteriores mantêm a
semântica atual. Nos transportes, reason Error continua preservado como0180;
na operação governada, cancelamento observado pelo helper mantém as categorias
constantes acima. A causa já registrada pelo gateway não é reescrita.

Os DOIS transportes Node revalidam o sinal antes de encodeBody, depois do
await encodeBody e imediatamente antes de httpRequest/httpsRequest. Esta
última checagem ocorre dentro do executor síncrono da promise, após preparar
headers/options, sem await até criar o request. Body Blob com arrayBuffer
pendente pode terminar após abort, mas não pode criar request depois disso.
Testar com Blob legítimo cuja arrayBuffer é controlada, abort nessa janela,
e spy de criação de httpRequest/httpsRequest: zero requests criados, não
apenas zero requests vistos pelo servidor. Nenhum retry após esse erro.
Quando o request já existe antes de abort, o transporte observa o mesmo sinal
e o destrói; manter listener até close e limites durante leitura. O helper
remove apenas os listeners que possui; não remove o de outro componente.

GuardedFetchResponse pode expor body opcional/nulo com cancel():Promise<unknown>,
compatível com Response e fixtures atuais sem body. Ao descartar resposta
de redirect, resposta tardia depois de abort ou resposta recebida seguida de
abort antes da entrega, iniciar cancel do body, observar sua rejeição e não
aguardar indefinidamente por cleanup. Fazer isso também em too_many_redirects,
Location inválida e recusa do destino seguinte. Para todo3xx, iniciar cancel
ANTES de aguardar validação/DNS do próximo destino, inclusive se cancel ou DNS
ficarem pendentes ou rejeitarem. Cancel não é aguardado indefinidamente e sua
falha não substitui o erro principal. Resposta terminal entregue
com sucesso continua pertencendo ao caller para leitura limitada.

O transporte padrão retorna corpo já limitado; provar fechamento de seus
sockets no teste real. Fetch/lookup injetados que ignoram o sinal não oferecem
cancelamento físico garantido: observar/descartar resultados e iniciar cleanup
disponível sem atribuir ao guard capacidade inexistente. Cleanup que falha não
promove sucesso nem dispara outro efeito. Não ler/bufferizar corpo descartado
apenas para liberar conexão e não fazer logs com URL/headers/body/reason bruto.

## 5. Arquivos e integrações futuras

- packages/shared/src/ssrf.ts e testes ssrf-egress: helper, sinal na resolução,
  revalidação por hop e descarte de respostas.
- packages/model-gateway/src/providers/{openai-compatible,ollama}.ts e testes:
  conferir uso do mesmo sinal e compatibilidade dos erros/limites.
- packages/channel-gateway/src/adapters/{evolution,chatwoot}.ts e testes:
  guard não continua depois da race externa; não remover proteção existente.
- packages/channel-gateway/src/exam-egress.ts e testes: resolução preliminar
  e dispatch no mesmo sinal, com a máquina de efeitos existente preservada.
- Os dois transportes ssrf-node: checks antes/depois de encodeBody e antes
  de criar request são parte obrigatória deste delta; preservar cleanup,
  sem substituir os transportes por implementação duplicada.

Sem alteração de contracts, migrations, API HTTP, produto, lockfile ou CI.
O consumidor usa a dependência shared; suas provas de transporte continuam
obrigatórias emU20, não herdam aceite desta fatia. HISO-011 completo conserva
os residuais da0180: streaming/backpressure, contadores W/B/H/Q, compressão,
validação de B, primeira causa do prazo no gateway e R01–R15. Os14aceites
originais e os dois complementos abaixo não substituem nem fecham esse pai.

## 6. Aceites reprováveis

| ID  | Evidência exigida                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D01 | Sinal previamente abortado: zero lookups/fetch, inclusive IP literal/reason customizado. Thunk que aborta sincronamente e retorna promise pendente encerra a espera sem listener perdido; throw síncrono é observado.                                  |
| D02 | Abort enquanto DNS inicial nunca resolve encerra a promise sem esperar o lookup; liberar depois não chama fetch.                                                                                                                                       |
| D03 | Mesmo teste no DNS do segundo hop; somente o primeiro fetch aconteceu.                                                                                                                                                                                 |
| D04 | Rejeição tardia de lookup/fetch após abort observada sem unhandledRejection; não altera resultado nem dispara nova atividade.                                                                                                                          |
| D05 | Deadline por sinal encerra DNS e múltiplos hops sob o prazo original; nenhum timeout é renovado. Relógio/sinal controlados no teste e smoke com timer real.                                                                                            |
| D06 | Abort após resolver DNS e antes do dispatch impede entrada no transporte. Mutante sem a última checagem falha.                                                                                                                                         |
| D07 | Positivo sem abort com DNS imediato e retardado; redirects relativos/absolutos válidos respeitam o máximo atual.                                                                                                                                       |
| D08 | Endereço privado/misto/vazio, DNS falho, allowlist/protocolo negados e rebind continuam recusados; nenhum fallback de transporte.                                                                                                                      |
| D09 | Durante DNS/fetch, modelo retorna cancelled/timeout; reason customizado não vaza nem vira erro DNS. Testes separados mostram semântica preservada na leitura posterior, sem alegar normalização global. Canais/exam mantêm mappers e regras de efeito. |
| D10 | Respostas descartadas iniciam cancel antes do DNS seguinte; testar segundo DNS e cancel pendentes/rejeitados. Cleanup rejeitado é observado e não prende término; body terminal válido fica com o caller.                                              |
| D11 | Listeners próprios removidos nas saídas normal/erro/abort; positivos subsequentes funcionam e não há timer novo por hop.                                                                                                                               |
| D12 | HTTP/TLS loopback reais, fixture própria e perfil de teste existente: socket abortado/fechado, Host/SNI/endereço pinado preservados e recepção limitada; sem DNS/provider externo.                                                                     |
| D13 | Providers/canais/exam com DNS lento e mesmo sinal; exam preliminar cancelado não adquire efeito e cancelamento após envio preserva estado incerto, sem retry cego.                                                                                     |
| D14 | Regressões0248/SSRF/transportes e perfil completo aplicável, sem retirar teste/skip/denominador; U20 produto separado ainda obrigatório.                                                                                                               |
| D15 | Barreira após import do módulo DNS e antes de lookup real: abortar, liberar módulo e observar zero consultas nativas/fetch; sem seam pública nova ou import Node estático no shared.                                                                   |
| D16 | Nos dois transportes, abort com encodeBody/Blob.arrayBuffer suspenso; liberar corpo e comprovar zero httpRequest/httpsRequest criados. Mutante que só destrói request já criado deve falhar. Positivo sem abort preservado.                            |

As cinco caracterizações iniciais são first red preservado, não substituem
esses novos negativos. Verificações Node22/type/lint/testes/PG/E2E e crítico
fresco conforme o gate, com claims próprios; nunca lançar gates globais sobre
candidata parcial e chamar isso de aceite do programa.

## 7. Próximo gate

Crítica técnica independente deste contrato e confronto com a fonte; resolver
obrigatórios e congelar hash. Depois, revisão humana explícita T3, com decisão
sobre o escopo shared e os limites de cancelamento lógico versus físico.
Antes de BUILD conferir HISO-005/HISO-006 e autoridade para a fatia; dependência
pendente exige decisão aplicável, não inferência deste documento. Após BUILD,
prova independente e integração no mesmo candidato; sem release por documento.
