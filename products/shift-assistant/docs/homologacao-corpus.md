# Corpus sintético de homologação

Preparação do requisito PISO-009, AP-008/AP-009, conforme a seção12 da SPEC0179 proposta. O [backlog canônico](backlog.md) conserva o estado da tarefa. As expectativas destas fixtures aguardam revisão dos contratos; preparar entradas não implementa nem aprova as mudanças T3.

Os [casos de organização](../src/__tests__/fixtures/reliability/cases-index.md) contêm entrada original, respostas modelo controladas e expectativas por cenário. Os contraexemplos incluem homônimos, ID inventado, memória não confirmada e troca de valores entre pacientes conservando os mesmos números globais. O candidato futuro precisa satisfazer a associação à fonte, à identidade e à revisão, além de manter tarefas em rascunho antes da confirmação humana.

O [manifesto dos dez áudios](../src/__tests__/fixtures/reliability/audio-manifest.json) lista arquivos WAV, transcrição de referência, duração medida, hash, termos críticos e segmentos de cada paciente. São vozes sintetizadas localmente por eSpeak NG, com três variantes em português, convertidas para PCM16 mono16kHz. Têm de26a34segundos, sem preenchimento artificial até60s. Não são gravações de pessoas ou pacientes reais. Os valores são dados fictícios de entrada para verificar fidelidade, sem recomendação clínica.

As referências preservam números por extenso como ditados. Normalização de transcrição para números/IDs não está aprovada automaticamente; erros de paciente, dose, unidade ou horário precisam ser sinalizados. No áudio de dois pacientes, cada valor tem seu próprio segmento de fonte; no de homônimos, a anotação ambígua exige escolha humana. Esses anchors são metadados da fixture, não um schema público implementado.

| Etapa                                            | Estado                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Arquivos de entrada, expectativas e referências  | Preparados; integridade medida separadamente                     |
| Execução do consumidor contra os vinte casos     | NOT_RUN; depende das correções governadas e do contrato revisado |
| Transcrição pelo Whisper local efetivo           | NOT_RUN; versão/modelo/parâmetros e transcripts ainda ausentes   |
| Associação/preview após transcrição              | NOT_RUN                                                          |
| Utilidade da fala sintética e critérios clínicos | NOT_RUN; avaliação humana necessária                             |
| Guia lido pelos dois plantonistas                | NOT_RUN                                                          |
| Piloto de duas semanas                           | NOT_RUN; gate específico do candidato                            |

A preparação está separada dos resultados. Depois da revisão T3, o runner deve comparar cada campo com a fonte e identidade corretas, demonstrar recusa dos negativos e passar os controles bons. Whisper deve operar de fato, com versão/modelo/parâmetros e transcripts registrados; texto de referência nunca substitui uma transcrição executada. Fala sintética limpa não demonstra desempenho em áudio humano com ruído, sotaques ou interrupções. A qualificação do corpus e os critérios de utilidade continuam sob responsabilidade do produto.
