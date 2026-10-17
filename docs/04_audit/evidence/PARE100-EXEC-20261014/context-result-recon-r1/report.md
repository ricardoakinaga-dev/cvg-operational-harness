# Resultado de ferramenta: reconhecimento do caminho real

Task `P100-004/P100-014/P100-020/P100-021/TOOL-RESULT-RECON-001`.
16/10/2026. Trilha T1, análise de fontes do worktree isolado. O produto
esperado é uma entrada verificável para a SPEC da correção de `OBS-I1-001`.
Esta análise não altera nem executa o runtime e não autoriza BUILD T3.

## Invariante

O próximo passo do modelo deve receber o resultado completo necessário à
decisão, dentro dos limites declarados do contexto. Dados da ferramenta
continuam UNTRUSTED. Quando não couberem ou forem inválidos, a execução deve
declarar a perda de disponibilidade sem fabricar uma resposta, perder a
identidade de um efeito confirmado ou repetir esse efeito.

## Evidência atual

As âncoras, trechos literais, linhas e SHA-256 estão em
[source-facts.json](source-facts.json). Os arquivos de origem estão listados
em [source-manifest.json](source-manifest.json). `CURRENT` significa leitura
de código; não significa nova observação em execução.

| Fato | CURRENT: caminho observado na fonte                                                                                                                                                                                             | Consequência para a correção                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01  | `boundedPayload` serializa JSON, compara comprimento em unidades UTF-16 e pode substituir o valor por uma string de prévia. Default 4000.                                                                                       | Não é um limite de bytes UTF-8; a transformação também pode mudar o tipo.                                                                                                                          |
| F02  | O despacho aplica esse limite ao output bem-sucedido; `makeObservation` o aplica novamente ao envelope inteiro.                                                                                                                 | Preservar somente o output no primeiro ponto ainda permite perder status, sideEffect e output no segundo.                                                                                          |
| F03  | `stringifySummary` corta strings/JSON em 300 unidades; `makeObservation` limita summary a 500.                                                                                                                                  | Summary é uma prévia e não pode ser a fonte exclusiva do resultado integral.                                                                                                                       |
| F04  | O ContextEngine monta FRESH_TOOL_RESULTS a partir de summary; estima `ceil(text.length / 4)`, default 4000. Essa prioridade não é obrigatória; itens obrigatórios podem exceder o orçamento.                                    | O estimador é aproximado. Seleção de itens não prova que o pedido final cabe no modelo.                                                                                                            |
| F05  | StepContext contém tanto observations recentes quanto contextItems selecionados. HybridOrchestrator renderiza observations.summary e outros campos diretamente em uma mensagem system.                                          | Os itens selecionados não são a representação efetivamente enviada por esse orquestrador. Há um aviso explícito sobre dados não confiáveis; esta leitura não prova exploração ou bypass de policy. |
| F06  | A decisão usa `decisionModel.complete`; a resposta tem outra porta `modelGateway`. Runtime contabiliza o uso retornado pela decisão e aplica limites após a chamada; o kernel tem controles próprios para chamadas do pipeline. | Não confundir o gate do pipeline com uma pré-admissão do prompt de decisão. Não remover nem duplicar a contabilidade existente.                                                                    |
| F07  | `createOperationalHarness` permite ContextEngine customizado, mas não encaminha `maxObservationPayloadChars`; o default do runtime continua relevante.                                                                          | Um teste que instancia apenas uma classe interna não demonstra correção da composição pública.                                                                                                     |
| F08  | Há até 50 observations no checkpoint; save sela o estado já transformado. O digest exclui checkpointId/createdAt e inclui o conteúdo unsigned normalizado. Validação compara versão, tenant/execution e digest.                 | Integridade do checkpoint não restaura bytes já descartados. Uma evolução de representação exige compatibilidade e retomada explícitas.                                                            |
| F09  | O store PostgreSQL serializa state e budgetUsage para JSON; não há limite de tamanho explícito em `jsonText`.                                                                                                                   | Isso não prova capacidade ilimitada do banco nem um limite de memória seguro. Não foi iniciado PostgreSQL.                                                                                         |
| F10  | Completion lê `payload.status` e `payload.sideEffect` como campos de objeto.                                                                                                                                                    | Derivado: substituir o envelope por uma string pode retirar evidência de conclusão. Não foi reproduzido novo caso de efeito nesta análise.                                                         |
| F11  | O contrato do harness aceita roles system/user/assistant/tool; o schema do pacote de gateway governado aceita system/user/assistant, com content até 32000 e 64 mensagens.                                                      | São contratos distintos. Não há adaptação direta demonstrada entre HybridOrchestrator e esse gateway; adicionar role tool sem mapear os consumidores seria uma suposição.                          |
| F12  | A fixture diferencial permite text/message de até 4096 bytes UTF-8; o provider sintético do teste extrai a observação do pedido real e exige igualdade com a saída do corpo real.                                               | A correção não pode retornar texto da fixture por fora do pedido ou afrouxar essa igualdade para esconder truncamento.                                                                             |

O [aceite diferencial anterior](../differential-tool-r3/lead-acceptance.json)
vale para três fixtures congeladas. Ele preserva `OBS-I1-001` aberto: no
caso adicional de 4096 bytes a referência completou e o CVG falhou ao
entregar o texto completo ao provider sintético. Essa é evidência anterior,
não uma nova execução desta rodada nem prova de todo o domínio válido.

## Inferências delimitadas

- Uma string ASCII com 4096 caracteres ocupa mais de 4000 unidades quando
  serializada como JSON. Uma string Unicode com o mesmo total de bytes pode
  ter outro comprimento UTF-16; escapes de JSON alteram novamente a relação.
  Portanto, aumentar um número não define um contrato uniforme de tamanho.
- Mesmo sem o primeiro truncamento, o resumo de 300 unidades e o segundo
  limite ainda podem impedir acesso integral. Trocar apenas a regex do teste
  ou usar uma resposta guardada fora do pedido não resolve o caminho real.
- Mudar a forma persistida, a semântica de seleção do contexto ou o contrato
  de entrada do modelo é T3 conforme D-12. A SPEC0217 não autoriza esse
  acréscimo de contrato público.

## Alternativas e decisão desta análise

| Alternativa PROPOSED                                                                               | Julgamento antes da SPEC                                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aumentar/remover somente o slice de summary                                                        | Rejeitada: mantém o duplo truncamento e a divergência entre seleção e renderização.                                                                                |
| Enviar todas as observations sem limites                                                           | Rejeitada: não define orçamento, retenção nem falhas de serialização.                                                                                              |
| Preservar um envelope JSON versionado e construir o pedido a partir de uma única seleção governada | Candidata preferida para especificação: mantém a mudança nos módulos existentes. Ainda depende das decisões abaixo; não é design aprovado ou tecnicamente fechado. |
| Criar store externo para resultados e entregar referências                                         | Adiada: os casos medidos não demonstram necessidade de infraestrutura nova. Exigiria ownership, resolução autenticada, retenção e consistência adicionais.         |

O custo da candidata local está nos contratos de observation/contexto, no
renderizador, no despacho e na compatibilidade do checkpoint. Não há motivo
demonstrado para serviço, fila ou banco adicional. Logs devem registrar
identificadores, tamanhos, completude e motivo de admissão, sem duplicar
conteúdo arbitrário em auditoria ou telemetria.

## Decisões obrigatórias para a SPEC0224

1. Definir o domínio JSON admissível e os limites por resultado e por
   checkpoint, com unidade explícita. Separar string original, serialização,
   prévia, envelope completo e marcador de indisponibilidade. Não converter
   silenciosamente undefined, ciclos, BigInt ou valores não finitos em sucesso.
2. Definir uma representação única do pedido de decisão, a separação entre
   instruções confiáveis e dados UNTRUSTED e a compatibilidade das portas.
   A presença de role tool no contrato do harness não resolve a divergência
   do gateway governado. Não inferir que essas portas já estão conectadas.
3. Definir admissão sobre o pedido final completo, incluindo catálogo,
   instruções, usuário, resultados e reparos. Distinguir estimativa local de
   tokens, tamanho serializado e limite real de janela do provider. Os
   defaults atuais não são medição de tokenizer nem autorização para gastar
   além do orçamento de execução.
4. Definir comportamento quando resultado fresco ou instruções obrigatórias
   não couberem. Não remover silenciosamente um resultado necessário. Se o
   efeito já confirmou, preservar seu estado e operationKey e interromper ou
   entregar handoff verdadeiro; não transformar indisponibilidade de contexto
   em TOOL_FAILURE com repetição automática.
5. Definir leitura de checkpoints antigos sem inventar completude, escrita
   versionada, retomada após perda do processo e rejeição de combinações
   incompatíveis. Um digest válido de uma prévia não prova o original.

Estas são decisões técnicas a concretizar antes de submissão; nenhuma
pergunta de aprovação da SPEC0224 foi enviada e não há arquivo dessa SPEC
criado por esta task. As SPECs0220/0221/0222 continuam aguardando as revisões
humanas já solicitadas, sem novo envio.

## Oráculos para o BUILD futuro — todos NOT_RUN nesta rodada

- Exercitar a fábrica pública com HybridOrchestrator real e dois modelos
  sintéticos observáveis; o provider de decisão só pode responder a partir
  do resultado realmente recebido. Comparar igualdade do valor completo,
  identidade/proveniência, completude e resposta final.
- Preservar os três casos diferenciais já aceitos e o testemunho vermelho
  original; acrescentar ASCII4096, Unicode4096bytes, escapes JSON, vazio,
  limites exato/mais um e JSON inválido no domínio que a SPEC definir.
- Validar o pedido completo contra o orçamento antes da chamada: catálogo,
  instruções, usuário grande, múltiplos resultados e reparo. O provider deve
  contar zero chamadas nos casos não admitidos.
- Pausar e retomar com store real em ambiente sintético isolado; verificar
  bytes/valor/digest antes e depois. Cobrir checkpoint antigo truncado,
  tenant incorreto, versão incompatível e corrupção deliberada.
- No caso de efeito confirmado seguido por overflow, contar um único corpo,
  manter settlement/operationKey e impedir sucesso fabricado ou replay. Não
  executar efeito externo real para essa prova.
- Injetar texto que imite instruções/approval/policy; confirmar pelas portas
  nativas que continua sendo dado sem autoridade. Um modelo sintético não
  prova resistência de um modelo real a prompt injection.

## Estado e limites

`RECON_COMPLETE_FOR_SPEC_INPUT`; arquitetura e BUILD `NOT_APPROVED`, todos
os testes futuros `NOT_RUN`. Nenhum runtime, modelo, helper, sandbox nativo,
provider, rede ou PostgreSQL foi executado nesta task. Leitura inicial
tentou caminhos inexistentes de store/referência e um caminho duplicado de
worktree; buscas posteriores localizaram os arquivos válidos. Esses erros
de consulta não foram usados como evidência de ausência de funcionalidade.
O histórico de ferramentas contém consultas cujo display foi truncado;
este pacote contém somente os trechos e hashes explicitamente capturados
pelo inventário, sem alegar captura retroativa completa dos comandos.

O [aceite do observador de sandbox R4](../sandbox-metadata-observation-r4/lead-acceptance.json)
foi recuperado e continua restrito à validade da medição; seu invariante
medido é FAIL. O [plano sandbox R5](../sandbox-procedures-r5/lead-acceptance.json)
continua somente proposta documental futura com testes NOT_RUN.
As quatro SPECs protegidas, os 465pins, os 36 critérios e a barra original
serão conferidos pelo verificador documental existente. Permanecem
2DONE_LOCAL/34abertos e paridade integral NOT_MEASURED. Próxima ação única:
redigir o contrato concreto da SPEC0224 a partir das cinco decisões acima,
antes de revisão técnica e eventual submissão humana T3.

## Verificação documental executada

[commands.json](checks/recon-01/commands.json) registra oito verificações T1
com exit0: formatação, links e higiene de evidências em root/worktree,
retenção do programa e inventário de fontes. O verificador existente
conferiu465pins,493inputs não ledger sem drift, quatro SPECs protegidas e os
36critérios/estados contra a barra original. Os streams não vazios foram
preservados; streams vazios têm omissão explícita no registro de comandos.
Isto é validação documental do Lead, sem revisão independente nova e sem
testes de runtime ou integração. O inventário original de fonte é imutável:
publicações posteriores devem falhar se hashes ou trechos mudarem.
