# Ações da auditoria independente — HARNESS-ISO-EXEC — 03/10/2026

Origem: auditoria do Claude Code sobre a entrega do corpus (20 casos, 10 áudios) e o baseline neutro (990 testes), com leitura integral do [handoff](harness_isolation_execution_20261003.md), da [conferência](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/evaluator-response-r1.md), do [packet T3](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/revisao_humana_t3.md) e das SPECs [0179](../../02_spec/0179_shift_consumer_reliability.md) e [0180](../../02_spec/0180_shared_transport_ci_security.md). Não houve execução de testes nem leitura do código do produto.

Estado: objetivo `BLOCKED`, veredito global `FAIL`. Este documento **não** altera critérios, cartões, status nem SPECs. As SPECs estão sob revisão humana pelos hashes `6c01f808…2423` (0179) e `b1b6f4f0…f8f5` (0180) do manifesto `spec-human-review-inputs.json`. **Não editar as SPECs no lugar:** as emendas abaixo são propostas; aplicá-las muda o hash e exige nova revisão da parte afetada (regra D-12). Aplicar somente por decisão do usuário.

## Como usar

1. Ler primeiro o handoff e a coordenação; registrar claim antes de escrever (coordenação, regra 1).
2. Executar na ordem **A → B → C → D**. Cada tarefa traz classe (T1/T2/T3), dependência e aceite verificável.
3. Classe T3 só inicia depois da revisão explícita do usuário. Sem ela, produzir apenas o texto da emenda ou o experimento isolado indicado.
4. Todo resultado entra com evidência em `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/` e estado PASS/FAIL/NOT_RUN. Nenhuma tarefa daqui conclui critério HISO/PISO sozinha.

## A. Higiene e preservação (T1, sem decisão pendente)

| ID  | Ação                                                                                                                                                                                                      | Aceite                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Commitar apenas os caminhos próprios: `products/`, SPECs 0179/0180, `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/`, handoffs. `git add <caminho>` explícito, nunca `-A`, `.` ou `-a`. Sem push.      | `git status` não mostra esses caminhos como `??`; mensagem cita claim; nenhum arquivo de outro agente no commit. Os arquivos de outros agentes que estão modificados no mesmo tree (por exemplo, SPECs 0162/0163/0190 e `docs/07_agents/AGENTS.md`) ficam fora. |
| A2  | Integrar as entradas prontas nos ledgers 99, 20 e 30, **só** quando `git status` de cada um mostrar que não há alteração alheia pendente (regra 5). Entrada nova no topo, estado `BLOCKED / GLOBAL_FAIL`. | Os três ledgers citam `HARNESS-ISO-EXEC-20261003`, BLOCKED, FAIL e as pendências. Se algum estiver ocupado, registrar `WAITING_LEDGER_OWNER` neste documento.                                                                                                   |
| A3  | Identificar o dono das modificações não commitadas em `docs/02_spec/0162`, `0163`, `0190` e em `docs/07_agents/AGENTS.md` (1 linha). Confirmar que a D-12 (linha 103) não mudou.                          | Nota curta com dono/claim de cada arquivo e `git diff` da linha de `AGENTS.md`. Se a D-12 foi alterada, parar e avisar o usuário.                                                                                                                               |
| A4  | Tornar a retomada independente de `/tmp`: copiar o runner de suíte e o procedimento para reconstruir o candidato (manifests, lock, sentinels) para a pasta de evidências, com comandos reproduzíveis.     | Um agente novo reconstrói o candidato só com arquivos do repositório; ou o gap é registrado como pendente com o motivo.                                                                                                                                         |
| A5  | Corrigir `harness_isolation_execution_20261003.md`, linha 55 (`ACTIVE` → `BLOCKED`, aplicado nesta rodada). Conferir se há outra ocorrência obsoleta.                                                     | `grep -n ACTIVE` no handoff só retorna o estado histórico explícito.                                                                                                                                                                                            |

## B. Decisão do usuário que desbloqueia o trabalho (não executar sem resposta)

| ID  | Decisão                                           | Opções                                                                                                                          | Efeito                                                      |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| B1  | HISO-005 (gate de fronteira com sete falsos PASS) | Autorizar a correção T2 agora, ou manter a sessão semanal.                                                                      | Autorizado → executar C1. Mantido → só preparar o ExecPlan. |
| B2  | SPECs 0179 e 0180                                 | Aprovar por partes (ver C2–C5), pedir emendas, ou rejeitar. Separar a aprovação em três itens: 0179, 0180 e a exceção CLINICAL. | Define o que o BUILD T3 pode iniciar.                       |
| B3  | Exceção CLINICAL (grant Ed25519)                  | Aprovar; manter `NO_MODEL` e rever a D2; ou pedir SPEC de segurança separada. Sem resposta vale `NO_MODEL`.                     | Define se D009 pode ser construído.                         |

## C. Correções e emendas

### Decisões do usuário — 03/10/2026 (respondidas)

| ID  | Decisão                                        | Consequência para o executor                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | **Autorizar agora** a correção T2 do HISO-005. | Executar C1 sob claim próprio. Uma revisão posterior; se ainda houver problema, vai à sessão semanal.                                                                                                                                                              |
| B2  | **Emendar, depois aprovar por partes.**        | Aplicar as emendas C2, C3, C5, C6 e C8 às SPECs (os hashes mudam), gerar o diff e atualizar `spec-human-review-inputs.json` e o packet T3 com os novos hashes. O usuário revisa o diff e aprova 0179 e 0180 separadamente. Nada de BUILD T3 antes dessa aprovação. |
| B3  | **Manter `NO_MODEL` e rever a D2.**            | O grant Ed25519 sai da SPEC 0180 (C8). Nota clínica continua negada pelo gateway; a organização por modelo fica fora até decisão separada sobre a D2.                                                                                                              |

### C8 — Emenda B3 à SPEC 0180 (T3, texto; depende de B2)

- Remover a proposta `ModelTransmissionGrant`, o oracle `TRANSMISSION-GRANT` e as menções ao grant no D009, na matriz de decisões e no packet T3.
- Registrar que o D009 migra o organizador para `ModelGateway.generate` com classificação CLINICAL e que, sem exceção aprovada, o resultado esperado é `policy_denied` com zero chamadas. A migração passa a ser verificada com provider sintético de fixture e prompt de teste, sem rota para dados clínicos reais.
- Abrir item de decisão "revisão da D2 (organização por modelo)" no backlog do produto, sem implementar nada.
- Aceite: nenhuma referência residual ao grant nos textos; o oracle de classificação prova que nota clínica é negada antes de budget e provider.

### C1 — HISO-005: gate de fronteira (T2, depende de B1)

Hipótese já registrada no handoff: resolver e visitar separadamente os destinos de runtime e de tipos; propagar capacidades Node de loaders/resolve ou recusar os casos desconhecidos.

- Fixtures: `t2-critic-r2-fixtures.zip` (extrair só em candidato isolado, nunca como package vigente).
- Aceite: os 7 negativos retornam recusa; os controles positivos continuam passando; sentinel de entradas MATCH. Resolução indeterminada vira INCOMPLETE, nunca PASS (SPEC 0180, HISO-014).
- Limite: no máximo uma revisão posterior. Se ela ainda apontar problema, volta para a sessão semanal, sem terceira rodada.

### C2 — Emenda S1 à SPEC 0179 §4: números por extenso (T3, texto)

Problema: o §4 proíbe converter palavra em dígito, e os áudios ditam "trinta e oito vírgula cinco". Se o Whisper entregar palavras e a saída trouxer "38,5", o valor vira `UNSOURCED_VALUE` e o áudio é bloqueado. O alvo de 10/10 áudios fica inalcançável.

Texto a propor (não aplicar sem B2):

- Definir uma **equivalência determinística aprovada** entre numeral por extenso em pt-BR e dígitos (inteiros, decimais com "vírgula", horas "e quarenta e cinco minutos"), implementada no serviço, nunca pelo modelo.
- A comparação continua por tupla (bloco, campo, valor, unidade); o literal exibido ao autor preserva a forma da fonte.
- Valor que não normaliza com segurança continua `SOURCE_ASSOCIATION_AMBIGUOUS`.
- Acrescentar ao corpus casos de equivalência (positivos) e de troca de valor equivalente (negativos).

Aceite: oracle com os 10 áudios de referência por extenso e saída em dígitos passa; troca de valor entre pacientes continua reprovando.

### C3 — Emenda S3 à SPEC 0179 §4: offsets de evidência (T3, texto)

Problema: o modelo emite `start/end` em UTF-16, e modelos erram índices, o que gera falso bloqueio em massa.

Texto a propor: o modelo devolve apenas `quote`; o serviço localiza `quote` em `rawText` (primeira ocorrência dentro do bloco do paciente, ambiguidade → issue) e calcula `start/end`. A condição `quote === rawText.slice(start,end)` passa a ser invariante do serviço, não do modelo.

Aceite: caso com modelo que erra índices mas cita trecho exato passa; trecho inexistente ou ambíguo bloqueia.

### C4 — AP-011 (60 s): descoberta antecipada (T1, sem BUILD)

Problema: a SPEC exige recibo de entrega verificável por provider; WAHA/Evolution podem não fornecê-lo, e o piloto fica bloqueado.

Ações:

- Pesquisar documentação atual de WAHA e Evolution para evento de entrega correlacionável a ID de mensagem, destinatário e outbox, sem executar provider real nem usar dados reais.
- Registrar resultado por provider: `SUPORTA / NÃO SUPORTA / INCONCLUSIVO`, com fonte e versão.
- Definir em texto o que "operação saudável" inclui (destinatário offline?).

Aceite: tabela em `evidence/…/ap011-provider-delivery-receipt-r1.md`. Se nenhum suporta, escalar ao usuário: relaxar AP-011 exige decisão explícita dele, e a SPEC proíbe relaxar sozinha.

### C5 — Emendas S7 e S8 à SPEC 0180 (T3, texto)

- **S7:** na matriz de aceites HISO-013/014, o critério V011 diz "R01–R13", mas o D009 fixa R14 e R15 como obrigatórios. Propor "R01–R15". Sem isso o BUILD pode fechar V011 sem R14/R15.
- **S8:** os hashes de entrada foram tirados antes dos moves. Propor frase de re-congelamento no início do BUILD e reconciliar as contagens históricas (2.357 PASS / 189 SKIP) com as atuais (2650 testes, zero skips) em tabela, sem usar nenhuma como denominador.

### C6 — Texto datado e pontos menores (T1)

- SPEC 0179 §1 diz que a movimentação "ainda está em andamento". Propor texto "concluída em 03/10/2026 (T2 aceito)" em emenda, não editar no lugar.
- Ligar cada grupo HIGH de advisory ao consumidor que o expõe no harness (SPEC 0180, HISO-012, item 3): entrada para o BUILD de D012.

### C7 — Packet de revisão humana (T1)

Atualizar `revisao_humana_t3.md` somente para incluir uma seção "Pontos em aberto da auditoria" com S1, S2, S6 e S7 e a divisão da aprovação em três itens (B2). Não alterar `spec-human-review-inputs.json` nem os hashes.

## D. Ordem sugerida das fatias após aprovação

Seguir a SPEC 0179 §13: primeira fatia vertical PISO-004 (journal e migração), depois PISO-003 (inbox/outbox) e PISO-001/002 (rascunho, confirmação, vínculo), de texto pelo webhook até preview, confirmação, tarefa e restart, sem entrega real. Só depois PISO-005/006 (lembretes e controle), PISO-007 (imagem e rede) e PISO-008 (restore e alerta). A fatia de D009–D012 (SPEC 0180) segue a sequência do §Sequência da própria SPEC. A proporcionalidade ao piloto de duas pessoas deve ser reavaliada ao final da primeira fatia: se algum item não reduzir risco do piloto, perguntar ao usuário antes de implementá-lo.

## Limites que continuam valendo

Sem dados reais, sem push, sem release, sem piloto, sem provider externo real, sem commit de arquivos de outro agente. As portas 3400/3401 e os volumes existentes ficam preservados. Os 24 critérios originais permanecem exigidos.
