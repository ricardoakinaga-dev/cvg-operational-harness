# KR13 Integração do relatório interno de cleanup existente

Task `CODEX-INCORPORATION:KR13-NATIVE-REPORT-INTAKE`. Esta unidade aplica um reuso da SPEC0222 aprovada com ajustes, sem fechar PAR-K04 ou KR13 integral. O [recibo](../../USER-DECISIONS-20261016/spec-gates.json) fixa0222SHA `bbe359fbd7c52b2e037eb7240c195244f7e6063e4bfa5638e7eedc73d7e82c31` e exige revisão técnica independente para aplicação fiel dos ajustes. A [origem do reuso](../../IDLE-CLOSURE-20261023/k04-wiring/HOW.md) e o [review R2](../../IDLE-CLOSURE-20261023/k04-wiring/build/code-review-r2/REPORT.md) continuam imutáveis.

## Fronteira e pré-condições

- A candidata será NOVA e exclusiva em `/mnt/dados/cvg-work/codex-incorporation-20261101/cleanup-candidate`, base fixa `c8be3a5168b1304ba4e3dc3d79a91c66ce494637`.
- A presente task é preparação documental. Cópia/adaptação de fontes de aplicação, testes e BUILD aguardam reconciliação explícita com o holderIDLE/K04/81C4 solicitada noGBrain e disposição técnica deste HOW. Não interpretar silêncio como entrega dos caminhos.
- Escrita de produção prospectiva somente no `packages/harness/src/kernel/host.ts` dessa candidata; teste novo nela em `packages/harness/src/__tests__/managed-native-cleanup-intake.test.ts`. Não modificar caminhos de K06/SDK/processos/worker, barrels, contratos públicos ou controles.
- O fonte do reuso foi congelado sob outra base e contém outros seams. Não substituir o host inteiro por esse arquivo: transportar somente a primitive de boot/cleanup e conservar o controle/hook-authority da onda8.
- Nenhum original do holder, branch/candidata de par ou checkout compartilhado é alterado. Integração no candidato final permanece tarefa do integrador após revisão e regressão.

## Comportamento a incorporar fielmente

Reusar `NativeCleanupCoordinator`, `NativeCleanupItemResult`, `NativeCleanupReport`, `NativeBootReport` e os helpers internos `bootKernelHostWithReport`/`disposeKernelHostWithReport` da implementação R2. Tipos/helpers continuam fora dos barrels e do mapa de exports públicos. A assinatura e o comportamento externo de `KernelHost.boot` e `dispose(): Promise<void>` são preservados; cleanup não passa a lançar erros e não substitui a falha primária do boot/turno.

O host guarda uma única promessa de cleanup antes de qualquer callback; chamadas concorrentes e repetidas observam o mesmo trabalho. Cada frame mantém sua identidade/posição, invoca o disposer no máximo uma vez e só é removido após o coordinator devolverSETTLED e a promessa original ter assentado. Um resultadoSETTLED precoce sem a promessa original assentada não permite encerrar dependências. Rejeição/resultado incerto do coordinator conserva ownership pendente; não há retry, pop ou terminal por tempo decorrido.

O relatório inclui falhas de todos os itens assentados. Rejeições do disposer e falhas adicionais de subtree retornadas pelo coordinator são preservadas separadamente da causa primária. Apresentação de causas arbitrárias é feita com a inspeção protegidaR2: Proxy revogado, trap hostil e objeto não confiável viram opaque_failure, sem executar getter ou tornar um recurso terminal em promessa pendente. Relatórios e entradas ficam imutáveis e não são handles reutilizáveis de recurso. Estes helpers são confiáveis/internos; não enviar causas como diagnóstico público do SDK/CLI.

Um acquire tardio pode registrar frame durante o join: remover só o frame assentado e limpar os novos antes das dependências anteriores. Serviços emprestados não são fechados automaticamente por unregister. O coordinator fixture não comprova um producer tracker real. Esta unidade não implementa owner/gerações/lease, não fecha admissão de execute, não cancela sessão/árvore e não cria API pública shutdown.

## Mapa de adaptação

1. Conferir hashes dos seis inputs em `../kr13-reuse-pins.json` e o hash da base candidata.
2. Capturar pré-imagem do host da onda8 e fontes/testesR2 como inputsreadonly. Registrar task e claim de código da candidata antes da escrita.
3. Adaptar a primitiveR2 preservando imports/hooks/serviços/ordenação já existentes na onda8; não transportar OPTIONAL_SERVICES/preparedHost/managed-binding de outras fatias só porque aparecem no mesmo arquivo.
4. Portar apenas testes pertinentes à primitive e acrescentar controles de compatibilidade do host atual, conservando os oráculos do reuso. Guardar o primeiroRED antes da adaptação e os resultados depois.
5. Congelar diff+fontes+testes antes da revisão independente; reparar só achados obrigatórios de uma rodada agrupada, preservando as primeiras falhas. Uma eventualR2 usa o mesmo recorte e os mesmos critérios; não autoriza terceira rodada automaticamente.
6. Entregar patch seletivo e resultados ao integrador. Não publicar/mergear; não mudar o estado de KR13 para concluído enquanto o owner e a jornada completa não forem demonstrados.

## Critérios e contraprovas

| ID  | Aceite observável                                                                                                 | Controle que deve reprovar                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| C01 | LIFO: disposer anterior aguarda o término do posterior; cada callback chamado uma vez                             | Limpeza paralela ou pop antecipado                                          |
| C02 | Dois observadores concorrentes e chamada repetida esperam o mesmo cleanup, sem earlyresolve                       | Segunda chamada resolve enquanto a primeira ainda limpa                     |
| C03 | Todos os disposers assentados são tentados e suas falhas aparecem no relatório; legado continua void              | Swallow silencioso no helper ou throw novo no legado                        |
| C04 | Boot falho conserva o primary original e publica cleanup separado                                                 | Cleanup substitui o erro primário ou é confundido com boot bem-sucedido     |
| C05 | Falha primitiva, Proxy revogado e trap de apresentação viram dados seguros/opaque, sem bloquear join já assentado | A inspeção lança e deixa o relatório eternamente pendente                   |
| C06 | Falha/pending do coordinator não repete callback nem libera dependências                                          | Raced return do observer viraDISPOSED                                       |
| C07 | Frame de acquire tardio é limpo antes da dependência anterior, sem executar frame antigo duas vezes               | Remover o topo errado apósawait e perder o recurso tardio                   |
| C08 | Coordinator nunca é prova de subtree real por ser fixture; teste registra essa limitação                          | Rotular fixture verde como quiescência do provider/processo real            |
| C09 | Barrels, exports, métodos públicos, resultados normais e hook-authority da candidata preservados                  | Expor helpers internos ou trocar a policy da onda8                          |
| C10 | Resultado é imutável e não recebe recursos/funções arbitrários de thrown objects                                  | Mutação posterior altera um relatório terminal ou devolve handle de recurso |

## Verificação prospectiva e limites

Node22, Vitest da baseline, dependências somente leitura sem instalação/lock change, cache/config/outputs próprios. Uma campanhaRED e umaGREEN focais≤120s cada, regressão do host/kernel/harness afetado≤300s, typecheck/lint/build conforme a fronteira. Um timeout é resultado registrado; não ampliar o limite para produzir verde. Nenhum teste de aplicação externa, modelo, PG/Docker, E2E, certify, SBOM ou licenças nesta unidade.

Caso o typecheck/build revele necessidade de alteração fora dos caminhos, registrar causa e propor extensão antes de editar. Não relaxar testes/pins/limites de cobertura. A qualificação global da candidata composta continua posterior. Revisão do HOW é julgamento técnico de adaptação, não recebimento de ownership, evidência executada ou aceite de produção.

## Próxima ação

Receber disposição técnica independente e reconciliação do holder; então congelar a candidata e executar somente esta integração interna. O goal integral permanece ativo e os demais17recortes continuam no plano canônico vinculado.
