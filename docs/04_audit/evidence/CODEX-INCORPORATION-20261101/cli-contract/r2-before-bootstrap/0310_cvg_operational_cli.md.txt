# SPEC0310 — CLI operacional do harness

R2 em elaboração, 02/11/2026. Task `CODEX-INCORPORATION:CLI-CONTRACT-0310`, recorte KR16 dos cartões DX100-H01/H02/D02 e PAR-H01/H02 (dependências relacionadas PAR-A06/K05), sem criar carteira ou conceder aceite. Estado **REVISE — BOOTSTRAP_CONTRACT_OPEN / NÃO PRONTA PARA GATE HUMANO**. Esta preparação é T1; os comandos novos são contrato público T3 e seu BUILD depende de revisão humana explícita desta SPEC. A aprovação0239 já existente não é reapresentada nem ampliada por inferência.

## 1. Resultado e fontes

Disponibilizar os doze comandos da [incorporação](../03_build/codex_runtime_incorporation_2026-11-01.md#cli-e-contratos-externos) como cliente das capacidades existentes. Nenhum comando possui executor de ferramentas, loop de modelo, approval store, journal ou recuperação próprios. O CLI não é consumidor clínico nem instala configuração do Assistente de Plantão.

O [inventário de entrada](../04_audit/evidence/CODEX-INCORPORATION-20261101/cli-contract/source-inputs.json) separa fontes observadas, contratos aprovados e propostas. Em `c8be3a516`, o SDKv1 oferece hello, open, send, events, list e trace; `turn.send` é single_pass em processo. Listar e rastrear não equivale a inspecionar ou retomar uma execução durável. A SPEC0239 aprovada define a facade client, o executor independente e os eventos incrementais. K03b e a qualificação de dependências continuam pré-condições dessa composição. A SPEC0302/K06 exclui expressamente novos métodos de steering/cancelamento do SDK; seus controles seguem as rotas autenticadas da API. Perfis declarativos0256 e cliente MCP0266 continuam com gates próprios.

## 2. Fronteira e bloqueio concreto do bootstrap (F1 aberto)

O [parecer não autor R1](../04_audit/evidence/CODEX-INCORPORATION-20261101/cli-contract/review-r1/intake.txt) retornou REVISE com seis P1. A execução inicial terminou sem parecer no limite; o mesmo revisor recuperou seu julgamento já em curso, sem nova auditoria. R1 e seus hashes permanecem congelados. Este R2 é uma correção agrupada em elaboração; não é uma segunda revisão nem um aceite.

Ainda não há contrato confirmado que ligue autenticação/credencial/destinoAPI, seleção de perfil e portas de sessão/native0239 à mesma identidade/instalação. “Binding qualificado”, imports estáticos, IDs iguais ou um digest fornecido por JSON não constituem esse contrato. Não inventar um attestor, endpoint, capability ou factory como se já existisse. Não há autoridade de BUILD online desta CLI enquanto essa pendência não for resolvida por contrato preciso e seus gates.

A pergunta de arquitetura apresentada ao usuário distingue cliente de serviço existente de programa que inicializa host local. A escolha orienta o bootstrap, sem constituir aprovaçãoT3. Independentemente dela, o contrato final precisa fixar entrypoints e schemas de entrada/saída, origem/autenticação de credenciais e destinoAPI, verificação real de principal/tenant/instalação, compatibilidade de perfil/version/digest com a sessão e quem fecha cada recurso. As recusas de tenant/caso e authorizeCaseMutation daAPI permanecem soberanas. Perfil/tenant/grants não vêm de configuraçãoCLI.

Paths prospectivos: host apps/cli, pacote privado @cvg/cli, binário cvg, src/{main,argv,output,config,bootstrap,commands}.ts e testes. Bootstrap será código estático do host; não carregar módulo/script/executável indicado por payload/cwd/config. Não introduzir executor, tools, modelo, approval, store ou loop próprios; roleclient0239 apenas. Não usar createSdk com store de memória padrão como substituto durável. Qualquer alteração necessária em SDK, API, schema, identidade ou política precisa ser explicitamente especificada e ter seu gate antes de BUILD; esta proposta não a autoriza por menção.

O [anexo normativo R2](../04_audit/evidence/CODEX-INCORPORATION-20261101/cli-contract/CONTRACT-R2.md) fecha as traduções de cliente que podem ser decididas a partir das fontes existentes. Ele prevalece sobre a redaçãoR1 preservada, sem liberar o bootstrap. Composição ausente recusa antes de dispatch e continua contando como capacidade não implementada, nunca como aceite positivo de comando.

## 3. Configuração e operação offline

`--config <arquivo-absoluto>` é explícito e opcional para configuração de apresentação/seleção. Sem esse argumento, usar defaults internos; não procurar HOME, cwd, `.env`, repositório ou URL. Arquivo regular aberto por descriptor com verificação de tipo e leitura limitada, UTF8 estrito, JSON objeto sem campos desconhecidos, até64KiB, profundidade8, até128 aliases e strings até256 caracteres. O único schema aceito é:

```ts
type CliConfigV1 = {
  formatVersion: 1
  profileAliases?: Record<string, string>
  defaultProfile?: string
  output?: { color?: false }
  observationTimeoutMs?: number
}
```

Aliases e IDs têm1–120 caracteres, padrão `[A-Za-z0-9][A-Za-z0-9._-]*`; resolver exatamente um alias, sem herança/ciclo. O alvo só vira perfil operacional depois da resolução autorizada do host. `defaultProfile` precisa ser alias declarado ou ID sintaticamente válido. Config não aceita credenciais, referências de credencial, endpoints, paths de módulo, providers, subprocessos, prompt, persona ou opções de policy. Sua validação offline prova o schema, não a existência/autoridade operacional do perfil. Flags explícitas prevalecem apenas nos campos locais; elas nunca ampliam os limites/grants do host. Timeout é de observação, não deadline do modelo.

Doctor e config não inicializam autenticação, pool, conexão, processo, modelo ou ferramenta. O binário precisa fazer parse e escolher esse ramo antes de importar/inicializar o bootstrap online. Leitura/hash de configuração e metadados locais do pacote são permitidos. Não ler variável secreta para depois tentar redigi-la.

`config dump --redacted` emite somente a projeção `{formatVersion,profileAliases,defaultProfile,output,observationTimeoutMs}` validada, com `operationallyVerified:false`. Paths de origem, variáveis e diagnósticos arbitrários não entram na saída. Campos proibidos são erro, nunca impressos. Os dois níveis de validação são explícitos: `STATIC_VALID` offline e seleção efetiva autorizada durante um comando online. Não adicionar herança/presets de0256 nesta implementação.

## 4. Gramática e operações dos doze comandos

A seçãoA do anexoR2 é a gramática fechada: os doze comandos, argumentos, flags por comando, defaults, filtros0295, combinações recusadas e resolução determinística de perfil. Nenhum flag extra é delegado a BUILD. `--profile` de run pode ser omitido somente se defaultProfile local estiver definido; em ambos os casos, o perfil operacional exige autoridade do bootstrap. Resume sem execução reanexa leitura; resume--execution retoma trabalho nativo existente. Não reclassificar leitura como retomada de um efeito.

Run usa createThread/startTurn e observação0239, com fase de criação distinta de enqueue e sem dedup fictícia da criação. Steering/cancelamento usam as rotasAPIK06 autenticadas. Session list usa0295; v1inspect/attach/fork usam o serviço canônico autorizado; thread nativa usa0239. O resultado de fork0287 é canônico-v1 e não é adoção nativa. A seçãoF do anexo define essa elegibilidade e conserva a interoperabilidade nativa ainda pendente no saldoKR05.

## 5. Entrada, saída e códigos de retorno

Cap físico de leitura1MiB não amplia o texto nativo de65536bytesUTF8 semNUL. A seçãoB fixa a projeção exata e exige sua validação antes de criar sessão ou enfileirar. Steering conserva1–4096pontos de códigoK06. Não truncar, normalizar ou substituir conteúdo.

As seçõesC/E fecham os envelopes JSONL, enums, payloads por comando, null/omissão, espera deapproval e deuser, erros, exits e idempotência. NativeTerminal/NativeAccounting/NativeEventV1 vêm do schema0239 validado. Não retornar objeto bruto do backend nem texto de exceção. Receipt conhecido, terminal lógico e settlementUNKNOWN são fatos distintos; falha posterior de leitura não apaga o receipt. Cancel leva Idempotency-Key8–120, não confunde202 com confirmação e não trata wait.settled como terminal. A ausência de accounting na APIK06 permanece null, sem zeros/KNOWN fabricados.

## 6. Streaming, cursores e lifecycle

A seçãoD do anexo distingue cursor nativo opaco, cursor0295 e a projeção sc1 da sequênciaSDK para eventosv1. Não há novo métodoSDK, cursorstore ou conversão de cursor nativo para Number. Resume--follow sem execução usa o logsession-v1. Cursor só avança após write confirmado e continua distinto de prova de consumo do pipe.

FrameCLI máximo4MiB incluindoLF; fila16MiB/128registros. Página nativa permanece dentro128eventos/2MiB e dos limites0239; CLI--limit<=100. Não buscar outra página sem espaço ou materializar resposta pronta como streaming. Evento excedido falha sem avançar cursor; sem descarte silencioso. Timeoutobservação default300000ms,100–3600000ms; requestaté30000ms ou limite menor nativo; cleanup local5s não significa quiescência.

Sinal/timeout/disconnect precisam cancelar/fechar o recurso de leitura e juntar a promessa original, inclusive callback de stdout bloqueado. SDKfacade sem transporteclose não satisfaz o binding. Worker/executor independente não é fechado nem cancelado implicitamente. EPIPE impede terminal no pipe; não autoriza marcar sucesso. Handle residual/CLEANUP_UNCONFIRMED é falha de qualificação, não justificativa para process.exit escondendo recurso vivo.

## 7. Critérios executáveis e contraprovas

Todos **NOT_RUN** nesta SPEC. Testar o binário compilado, pelo export/entry instalado, com Node22, mensagens e providers/efeitos sintéticos. Tests de parser/fixtures isolados não fecham o aceite do comando. Nenhuma variante ausente pode ser convertida em PASS por aceitar uma recusa.

| ID  | Evidência positiva requerida                                                                                                       | Controle que deve reprovar                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | Três comandos offline, help/version funcionam sem importar bootstrap ou abrir recurso; JSON válido.                                | Sentinelas de auth/DB/network/process/model acusam qualquer invocação offline.                                                                                                                |
| Q02 | Config aceita apenas o schema e exibe projeção estática; limites byte/depth e flags comprovados.                                   | Segredo canário em campo proibido nunca aparece em stdout/stderr, inclusive erro; HOME/cwd hostis não são lidos.                                                                              |
| Q03 | `run` cria sessão conhecida e receipt; primeiro delta chega antes do provider terminar; terminal/accounting vêm da mesma execução. | Substituir native facade por turn.send/resposta previamente completa faz o teste falhar; falha pós-byte não vira respostaSUCCEEDED.                                                           |
| Q04 | ProcessoB retoma por executionId deA, usando checkpoint/journal existentes e sem repetir efeito completo conhecido.                | Campo de estado/approval injetado é recusado; UNKNOWN não chama novo modelo/corpo.                                                                                                            |
| Q05 | list e inspect leem fonte persistida, paginação e identidade corretas, sem mutação.                                                | Outro tenant/caso não atribuído/cursor alheio são opacos; inspecionar não adquire writer nem cria evento.                                                                                     |
| Q06 | fork canônico persiste prefixo/lineage e resiste a restart; fonte fica byteigual.                                                  | Prefixo fechado continua herdável mesmo com sufixo aberto; corte inválido/incerteza que torna o corte não herdável é recusado; grant/approval/checkpoint não migram, nem surge adoção nativa. |
| Q07 | execution inspect mantém visibilidade daAPI; steer chega pelo endpointK06 e só afeta passo seguinte.                               | SDKv1 não ganha turn.steer; keyconflitante/escopo ausente/caixa cheia não enviam chamada de modelo/ferramenta.                                                                                |
| Q08 | cancel exibe REQUESTED/202 separado do terminal; esperar relê estado real e caso/permissão são verificados.                        | EfeitoWRITE iniciado sem reserva conserva unknown_effect; receipt202 não passa como rollback/CANCELLED.                                                                                       |
| Q09 | events distingue fontes, cursor exclusivo e vínculo; leitor lento recebe framing íntegro dentro dos limites.                       | Cursor cruzado, frame excedido e consumidor que fecha não perdem dados com cursor avançado nem geram retry.                                                                                   |
| Q10 | SIGINT/SIGTERM e disconnect fecham só os recursos doCLI; worker independente continua/persiste e outroCLI lê.                      | Teste detecta cancel implícito, worker morto, terminal inventado, handle/processo próprio residual ou timeout de cleanup rotulado quiescência.                                                |
| Q11 | Chave/prepared/receipt/command_end/exit refletem conhecimento real de cada caminho.                                                | Commit perdido em create/fork/submit não é reenviado; nenhum receipt local ganha autoridade de dedup no backend.                                                                              |
| Q12 | Cada um dos12comandos tem campanha positiva e negativa instalada no mesmo candidato integrado.                                     | Apenas doctor/config/help, contratoscompilados ou adaptersfake não concedem conclusãoKR16/paridade.                                                                                           |

## 8. Gates, dependências e sequência de BUILD

Este contrato não concede qualificação a uma dependência por citá-la. Entrada composta exige: K01/caminho durável integrado; K03b e bridges0239 qualificados; ports0221/0287/0295 qualificados; perfil fixo autorizado (0256 só quando seu gate existir); S2/S3K06 e auth de caso/API qualificados para controles. O adapter não contorna dependência pendente com acesso direto a store ou novo métodoSDK. O headerPROPOSED de contratos antigos não revoga recibos posteriores; conferir hashes e a decisão vigente, inclusive o recibo17 que limita K03b.

Esta R2 ainda não está pronta para solicitar a revisão humana: F1bootstrap permanece aberto e as traduções precisam de conferência final sobre os schemas reais. BUILD somente após fechamento desses obrigatórios, review técnico sem obrigatórios e revisão humanaT3 exata. Claim próprio com SHA candidata, paths, processo/portas/PG/TMP e limites antes da escrita/execução; preservar os caminhos e recursos dos owners. Pode haver incrementos, mas a taskCLI só fecha com os doze comandos e Q01–Q12. Primeiro incremento não muda a condição de conclusão.

Campanhas: parser/offline e adapter positivos/negativos; integração em processo pelos ports reais; consumidores CLI compilados em processos distintos contra o mesmo worker/banco sintéticos; regressãoT2, PostgreSQL, E2E e certificação do candidato composto sob claims específicos. Preparar budgets/fixtures e preflight físico antes das campanhas; não elevar timeout ou reduzir/assertar recusa para produzir verde. Freeze e revisão independente do código antes de promover. A aprovação desta SPEC autoriza somente BUILD local sintético da CLI e seus adapters dentro da fronteira definida; não autoriza integração de K03b, mudanças0302/0256/0266, provider real, produção, push ou deploy.

## 9. Disposição agrupada da revisão R1

F1 permanece OPEN: contrato de bootstrap ainda precisa de decisão de modo e do binding preciso; não há gate por inferência. F2 recebeu gramática/tipos/projeções fechados no anexoA/C. F3 recebeu caps/projeção/contraprovas antes de createThread no anexoB. F4 recebeu adaptação explícita de sequênciaSDK, fontes e lifecycle no anexoD; a qualificação do transporte continua parte de F1. F5 recebeu tabela de estados/conhecimento/erros/headers no anexoE; a correspondência exata do envelope/códigosHTTP da candidata ainda precisa ser conferida antes de declarar fechamento. F6 recebeu a matriz v1/nativa e ownership do writer no anexoF, preservando a pendência de interoperabilidade nativa emKR05. Estas são correções do autor, não aceite independente dos achados. NenhumQ foi executado nem requisito funcional concluído.
