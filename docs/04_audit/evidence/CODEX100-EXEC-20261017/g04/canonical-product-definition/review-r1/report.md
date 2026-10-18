# Revisão fresh-context do WHAT — DX100-G04 / PRD0030 — R1

**APPROVE_FOR_SPEC_DOCUMENTATION. Obrigatórios: 0. Achados materiais: 0.**

O WHAT central permite redigir a SPEC documental: papéis e autoridade, negações, resultado completo, confirmação versus incerteza, terminal/cancelamento, incrementalidade, restart real e concorrência têm resultados verificáveis. Os contratos exatos e mecanismos ainda abertos devem ser resolvidos na SPEC; nova regra de produto ou equivalência retorna à definição/autoridade aplicável. Este parecer não autoriza código futuro.

A Discovery foi validada pelo Lead T1 sob D12 para PRD na direção já escolhida. PRD0030 foi revisado como draft sem PRODUCT gate. Não há aprovação humana de SPEC, gate operacional .agent/AUD0592, BUILD, paridade ou release concedidos. A transição canônica aplicável continua sob registro do Lead.

A meta permanece **22 famílias,49 cartões,10 fases,487 obrigações funcionais+22 controles**, motor nativo e jornada FULL na mesma candidata: READ → WRITE retida → aprovação institucional → retomada exata → stream incremental → encerramento de A/reinício real em B, com disputa entre processos. Nenhuma função/plataforma/serviço/SDK/host/default é removida. O catálogo contém509 IDs distintos, todos NOT_RUN, com509 receipts null; CQ01–14 permanecem NOT_RUN e não criam outro denominador.

| Critério | Avaliação | Resultado |
| --- | --- | --- |
| C01 | Etapa e autoridade documental | PASS documental |
| C02 | Meta integral e medida sem exclusões | PASS documental |
| C03 | Jornada FULL e motor nativo pelos caminhos públicos | PASS documental |
| C04 | Papéis, identidade e negações anteriores ao corpo | PASS documental |
| C05 | Resultado completo e dois ramos de resposta | PASS documental |
| C06 | Efeito confirmado, incerteza e restart real | PASS documental |
| C07 | Cancelamento, terminal e concorrência | PASS documental |
| C08 | Stream incremental, pressão e retomada | PASS documental |
| C09 | Falhas, uso parcial e limites não estreitados | PASS documental |
| C10 | Wire Codex distinto de SDKv1 | PASS documental |
| C11 | Comparador, cobertura e controles sem falsa qualificação | PASS documental |
| C12 | Reuso, dependências e alegações de evidência | PASS documental |

As linhas de evidência, contraexemplos concretos e razões de cada critério estão em [review.json](review.json). No PRD, os pontos decisivos são linhas26–37,43–58,62–78 e82–103. A proposta de jornada preserva os dois ramos responseIntent/responseText; a proposta wire impede tratar SDKv1 como protocolo Codex, arredondar i64 ou inventar ACK de notification. Os22 controles institucionais usam oráculo CVG próprio; a comparação funcional exige referência autêntica e regra atual, sem crédito por mocks, help, hashes, skip ou saída0.

Os insumos8–11 foram relidos integralmente antes da conclusão sobre escopo/reuso. O diagnósticoG03 mede apenas o gap do pedido RESPONSE; R19 é aceite restrito à memória opt-in, com quatro bindings diferentes do ROOT. PRD não afirma que a jornada integrada ou sua durabilidade/stream/PG já foram comprovados. PAR0224/0221/0225 conservam ownership;0226 publicada/default permanece adiada. Ausência de runtime não é defeito de certificação deste PRD; ensaios e gates continuam pendentes.

**L01 — WORDING_PRECISION (não bloqueante).** Cenário: WRITE já tem journal CONFIRMED; resposta/ACK se perde antes de o cliente recebê-lo. A expressão confirmação/ACK em CQ11, lida isoladamente, pode sugerir rebaixar o fato confirmado a efeito incerto. Leitura: CQ10 exige recuperação do resultado sem repetir corpo; jornada6 preserva confirmação; linha70 nega que transporte determine estado do efeito. A matriz10/11 da proposta separa os dois cortes. A leitura conjunta já fixa o resultado central. Encaminhamento mínimo: Ao detalhar a SPEC, separar falha antes da confirmação durável (efeito UNKNOWN/UNCERTAIN) de perda de ACK depois dela (efeito confirmado, entrega pendente). Opcionalmente substituir confirmação/ACK em CQ11 por confirmação durável, com remissão a CQ10 para ACK.

**L02 — OPEN_WIRE_MAPPING_AND_EQUIVALENCE (não bloqueante).** Cenário: Cliente reconecta sem cursor CVG, envia i64 extremo ou recebe userAgent/codexHome próprios da composição. Não é possível inferir serializer, replay ou equivalência de branding a partir do SDKv1. Leitura: O WHAT já proíbe cursor artificial, perda de i64 e equivalência implícita. Casos/diferenças permanecem explicitamente NOT_RUN. A obrigação de correspondência existe; implementar parser/roteamento/limites e capturar a referência são pendências legítimas da engenharia. Encaminhamento mínimo: Na SPEC concreta, registrar envelopes por sentido, estados e escopos, replay por superfície, parser/encoder e disposição explícita de campos de ambiente/branding. Divergência de comportamento central ou nova equivalência exige retorno à definição/autoridade aplicável; não eliminar campos do comparador.

**L03 — CANONICAL_INTEGRATION_AND_EVIDENCE_DEPENDENCY (não bloqueante).** Cenário: R19 memória aprovado existe enquanto quatro fontes ROOT diferem; journal/store de outro proprietário tem condições e aceites próprios. A jornada não herda durabilidade, exclusão distribuída nem crédito Codex dessa candidata. Leitura: O PRD não afirma integração concluída e não escolhe store/migration alternativo; exige reconciliação, artefatos qualificados e prova específica. Incógnitas de localização, transação e wiring não alteram o resultado exigido. Encaminhamento mínimo: Lead/SPEC devem reconciliar fonte durável, condições e recorte de0221/0224/0225 antes do contrato final/BUILD dependente; manter0226 adiada e aceites de outros alvos restritos aos próprios hashes/condições.

**L04 — QUANTITATIVE_HOW_AND_QUALIFICATION_PENDING (não bloqueante).** Cenário: Evento multibyte ou resultado admitido excede buffer/contexto; provider interrompe sem usage; plataforma/serviço não está acessível. Ainda faltam valores, política operacional e evidências por variante. Leitura: O PRD fixa memória limitada, unidades, ausência de truncamento silencioso, accounting desconhecido e variante pendente; não promete SLA ou desempenho já medido. A escolha de perfis/overflow e método de prova cabe à SPEC sob essas restrições. Encaminhamento mínimo: Fixar perfis, unidades, pressão/overflow, accounting e ensaios antes de código/carga; preservar domínio canônico e variantes difíceis, com disposição aprovada se houver domínio inferior ao da referência.

Revisão exclusivamente textual/JSON/hash, com12 critérios e uma rodada consumida de no máximo duas. Nenhum helper, ELF, CVG, CLI, Node fixture, scope, job, aplicação, teste funcional, rede, modelo/provider, PG, Docker ou gate foi executado/controlado. Sem descendentes, edição de fonte/ledgers/.agent, commit ou push. MainCLI75896 intocada; sua vivacidade não foi reobservada por este crítico. Fatos de runtime são apenas os relatos documentais congelados, não uma validação independente dos brutos.

Os11 SHA-256 iniciais conferiram com task.json; ao final permaneceram idênticos. Paths, tamanhos e ambos os hashes completos estão em review.json. A tabela mostra o SHA inicial; a terceira coluna registra a igualdade do SHA final.

| Insumo (ordem de task.json) | SHA-256 antes | Depois |
| --- | --- | --- |
| 1 | `9eebdf2b45c324d1bedc437866cf76f9093ef77aad6813935cb029cd603a0b98` | idêntico / MATCH |
| 2 | `85de97be6964d9b901a7e28e0ae25bb76a3093e86f324edb03295f239fa21297` | idêntico / MATCH |
| 3 | `f14ca9186cb4caf241d10317cb62b085fb2b8c7a9d81a7297b13c52b3a21fa0e` | idêntico / MATCH |
| 4 | `8ff6f5733f1c422d391ac5dd5d64a01297fa3eac13a9e4806d10487ac497f431` | idêntico / MATCH |
| 5 | `646987f92619bf586551be181d91173afbbc793660f6e2c27b2f6f4af6cb7c2a` | idêntico / MATCH |
| 6 | `7526e9d172abb1eeffa6981d98f1317fe91af2b617aab2b18a6645a5fd101fa7` | idêntico / MATCH |
| 7 | `4c52e10e9a9a20b10d90920b6ca461276a33a06e89e5a8dff2db18ad0b3f7f34` | idêntico / MATCH |
| 8 | `af9c89f8ec3bc547046f45bf37438af05c9c7822aa9b4520ca295328930e5b93` | idêntico / MATCH |
| 9 | `ef0ef329a5a80d732da7548cdf95380f6859dc95e231c050b247d98d10f452ad` | idêntico / MATCH |
| 10 | `0e3f8fec1efd570ec693d3f6f4e36d779eddedcf69e106e29c06d43b8b21b50b` | idêntico / MATCH |
| 11 | `8a3988b54a8750452d16eab1503aeea72e01a840016a33f40203e24f5e19c969` | idêntico / MATCH |

Task congelada: SHA-256 `4d970510c72186d7ae92f5c8c5e54ba7ebe7f60125dc9f329a36bc7c1fd3b7af`, preservado. Escrita exclusiva em [review.json](review.json) e neste [report.md](report.md). Continuidade entregue ao Lead para seus paths disjuntos, sem atualização de ledgers por este crítico.
