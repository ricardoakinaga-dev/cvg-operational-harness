# Corpus sintético — PISO-009:CORPUS_PREPARATION_T1

Claim existente na [coordenação](../../../../../../docs/08_runtime/agent_coordination.md); lane Builder-CORPUS limitada a `cases/**` e este índice. Preparação T1 encerrada neste conjunto, sem commit. Integração, manifesto e ledgers pertencem ao Lead.

EXATAMENTE 20 arquivos JSON, `case01.json`–`case20.json`. Todos `synthetic: true`, `PREPARED_NOT_EXECUTED`; expectativas `PROPOSED_SPEC0179_AWAITING_HUMAN_REVIEW`, baseadas no corpus da [SPEC0179 seção 12](../../../../../../docs/02_spec/0179_shift_consumer_reliability.md#12-piso-009010--preparação-local-e-dependências-humanas). Nenhum critério foi autoaprovado ou produto validado.

`modelResponses[].payload` e `expectedOutput.organizedV1` usam somente os campos do [OrganizedSchema V1 atual](../../../domain.ts). O case16 fornece `payloadLiteral` intencionalmente inválido. Bindings, issues, tarefas, condições e steps são metadados do corpus, sem schema V2 aplicado. Os bloqueios propostos são externos à forma V1; presença de um payload V1 não demonstra aceitação futura por um contrato V2.

Fonte de cada âncora: caminho JSON em `source`, `start` inclusivo e `end` exclusivo em unidades UTF-16; `quote` e `literal` devem coincidir exatamente com a substring. Nas variantes, o caminho aponta para a entrada daquela variante; memória histórica é citada pelo seu próprio caminho e nunca como fonte atual. `field` descreve o campo esperado, não um contrato de evidence do produto.

Relógio comum: `2026-10-03T17:00:00Z` = `14:00:00-03:00`, America/Sao_Paulo. Todos os novos drafts/tarefas ficam inativos até confirmação futura válida da revisão exata. Em 15, a tarefa aberta anterior é setup sintético; em 20, abertura só aparece no oracle de confirmação futura. Nenhuma fixture implica aprovação institucional de fonte. Valores/compostos/doses são dados inteiramente fictícios para fidelidade, sem diagnósticos ou recomendações.

Mídias não estão anexadas: case17 usa transcrição de referência sintética; case18 contém legenda textual ou texto vazio, sem OCR. Nenhum provider, Whisper, runtime ou receipt foi executado. O Lead verificará independentemente estrutura, âncoras e schema e construirá o manifesto; a entrega não certifica AP-008/AP-009, piloto ou produção.

| Nº  | ID / arquivo                    | Cenário                                      | Condições propostas                                                                                         |
| --- | ------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 01  | [SYN-REL-01](cases/case01.json) | internação ID/tutor/motivo                   | ID, leito, espécie, tutor e motivo literais; nenhuma tarefa.                                                |
| 02  | [SYN-REL-02](cases/case02.json) | evolução literal                             | Evolução, decimal 1,0, mL e 13:45 preservados.                                                              |
| 03  | [SYN-REL-03](cases/case03.json) | pedidos literais                             | Dois exames copiados literalmente; nenhuma inferência.                                                      |
| 04  | [SYN-REL-04](cases/case04.json) | promessa com hora explícita                  | 17:30 local → 20:30Z, tarefa draft inativa.                                                                 |
| 05  | [SYN-REL-05](cases/case05.json) | sem hora/default                             | Sem hora → 16:00 local, base de elaboração estável no retry.                                                |
| 06  | [SYN-REL-06](cases/case06.json) | hora passada/inválida                        | 13:00 passada e variante 25:61 inválida → fallback 16:00 local com aviso.                                   |
| 07  | [SYN-REL-07](cases/case07.json) | dois pacientes com vínculos explícitos       | Dois blocos; etiquetas A/B e prazos vinculados aos IDs corretos.                                            |
| 08  | [SYN-REL-08](cases/case08.json) | dois homônimos e pendência ambígua           | Dois SYN-Rex; pendência sem ID bloqueada, jamais escolher o primeiro.                                       |
| 09  | [SYN-REL-09](cases/case09.json) | ID ausente com memória confirmada única      | ID null no modelo; candidato SYN-I09 de memória confirmada exibido separadamente.                           |
| 10  | [SYN-REL-10](cases/case10.json) | leito divergente impede fallback pelo nome   | Leito SYN-L10B incompatível com SYN-L10A; pedir ID, não fallback pelo nome.                                 |
| 11  | [SYN-REL-11](cases/case11.json) | ID inventado a partir de valor incidental    | SYN-ID999 é código incidental; UNSOURCED_ID mesmo estando na fonte.                                         |
| 12  | [SYN-REL-12](cases/case12.json) | memória não confirmada não fornece ID        | Memória draft SYN-M12 inelegível; pedir ID explícito.                                                       |
| 13  | [SYN-REL-13](cases/case13.json) | troca de doses com mesmos números globais    | Troca 1 mg/2 mg entre pacientes, com mesmos números globais, bloqueada.                                     |
| 14  | [SYN-REL-14](cases/case14.json) | troca de unidades/campos                     | Trocas 3 mL/4 mg de unidades e campos, em dois candidatos ruins, bloqueadas.                                |
| 15  | [SYN-REL-15](cases/case15.json) | correção invalida confirmação anterior       | Correção cria revisão 2 draft; suspende/cancela tarefa antiga e recusa revisão 1.                           |
| 16  | [SYN-REL-16](cases/case16.json) | JSON inválido/fallback bruto                 | Payload JSON truncado; fonte bruta preservada com zero tarefas derivadas.                                   |
| 17  | [SYN-REL-17](cases/case17.json) | áudio retry preserva fonte e horário         | Áudio apenas placeholder e transcrição de referência; retry/replay preservam identidade/prazo.              |
| 18  | [SYN-REL-18](cases/case18.json) | foto com legenda/sem legenda                 | Duas variantes explícitas caption/no_caption; sem legenda pedir texto e preservar mídia.                    |
| 19  | [SYN-REL-19](cases/case19.json) | tarefa geral comprovada pela fonte           | Fonte comprova tarefa geral, paciente null, 17:30 local; draft inativa.                                     |
| 20  | [SYN-REL-20](cases/case20.json) | pausa/replay/snooze/ACK como oracle proposto | Sequência proposta: confirmação futura, pausa, restart/replay, retomada, snooze +30, ACK antes de dispatch. |
