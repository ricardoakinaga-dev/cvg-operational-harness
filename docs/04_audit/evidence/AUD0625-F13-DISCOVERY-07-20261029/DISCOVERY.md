# DISCOVERY — AUD0625 F13: preview e fidelidade não vinculam a confirmação

Task `AUD0625-F13-DISCOVERY-07-20261029` (Claude Sonnet, sessão 07), pedido do
orquestrador DF. Base `claude/aud0625-wave3` @ `caf38b204`, branch
`claude/aud0625-f13-07`. Fase 1: DISCOVERY, SPEC 0283
(`PROPOSED_FOR_HUMAN_T3_REVIEW`) e testes RED. Nenhum código de produto foi
alterado; sem dado real, sem ação clínica, sem push.

## 1. Reconciliação com a carteira e os claims

- **Dono.** O achado pertence ao consumidor (ADR-010): o produto é isolado em
  `products/shift-assistant`, com backlog próprio
  (`products/shift-assistant/docs/backlog.md`). Os cartões PISO-002 (fidelidade
  e identidade) e PISO-003 (inbox/outbox) estão `IN_PROGRESS`, risco T3/G3, dono
  "engenharia do consumidor". O núcleo (harness) não é tocado e nada nele passa
  a importar o consumidor.
- **O que o backlog já declara aberto**, e que é exatamente o F13:
  - PISO-003: "outbox durável de respostas e recibos" (sem recibo do preview);
  - PISO-002: "evidência por campo (SourceEvidence)" (sem associação
    paciente/campo/unidade).
- **SPEC já aprovada.** A SPEC 0179 (aprovada em 03/10/2026, sha
  `988192fe…`) já especifica o fechamento: §3 (`ok` simples só com "preview
  aceito pelo provider", token `<nota>-r<revisão>-<hash>`, recusa
  `CONFIRMATION_NOT_ELIGIBLE` para "preview não entregue/incerto"), §4
  (verificação por tupla `(bloco do paciente, campo, valor, unidade)`; "P07
  troca 1 mg/2 mg entre Alfa/Beta e precisa reprovar mesmo com ambos presentes
  no texto") e §6 (outbox com recibo). A AUD0621 implementou só uma parte (ver
  §3). A SPEC 0283 é, portanto, um **delta de fatiamento** sobre a 0179: escolhe
  a fatia mínima do §3/§4/§6 que fecha o F13 e fixa as decisões que a 0179 deixa
  abertas. O corpo da 0179 (hash-bound) não é editado.
- **Claims.** Nenhum claim `ATIVO` toca `products/shift-assistant/src/**`,
  `docs/02_spec/0283*` ou `PISO-002/003` na leitura de
  `docs/08_runtime/agent_coordination.md` do checkout compartilhado (as linhas
  `ATIVO` que citam "shift-assistant" são históricas, de setembro/outubro, já
  fechadas). A busca no GBrain (recall degradado, só por palavra-chave) não
  devolveu dono ativo. Limite: a ausência de claim é por leitura; antes do BUILD
  o DF deve confirmar com o dono da carteira do produto.
- **NO_MODEL contém a exposição.** Em produção a organização por modelo está
  bloqueada (`policy_denied` → nota bruta, zero tarefas) e o organizador
  sintético só é aceito sob o runner de testes. O defeito é real no código e no
  caminho `organized`, mas **hoje latente no perfil de produção**; vira
  exposição no dia em que a decisão D2 liberar o organizador. O bloqueio não é
  removido por esta frente.

## 2. Defeitos, com linhas atuais (a auditoria citou o SHA `61e5cf8f`)

| # | Local atual (wave3) | Defeito |
|---|---|---|
| D1 | `assistant.ts` `#process`: o `note_created` é gravado por `#commit` e só depois `#reply` envia o preview; `#reply` (L1108) engole a falha com `shift.reply.failed` e `return` | O rascunho existe sem preview entregue e nada registra que o envio falhou |
| D2 | `#confirm` (L692) | Elegibilidade = rascunho do autor sem `blockingIssues`; não consulta nenhum recibo do preview |
| D3 | `#reply` envia as partes em laço e, na primeira falha, `return`; as partes já enviadas ficam sem marca | Preview parcial é indistinguível de completo |
| D4 | `splitForChannel` (`transport-limits.ts` L276): "texto além da última parte é cortado com aviso" (4 × 32 KiB) | Avisos, `⚠️ valores`, `⛔ Antes de confirmar` e a instrução `ok` ficam no **fim** de `formatNoteReply` (L1217); em nota grande são justamente o que é cortado, e a confirmação continua permitida |
| D5 | `noteCode` (L1207) = 8 primeiros hex do UUID | Token sem revisão nem hash: `ok nota <código>` não prova que a pessoa viu **este** conteúdo |
| D6 | `unverifiedNumbers` (`organizer.ts` L199) | Compara o **conjunto** de números da saída com o da fonte: troca de dose entre pacientes, de unidade (mL→mg) ou de campo (temperatura↔FC) passa silenciosa |

## 3. O que já existe (não refazer)

AUD0621 já fechou: tarefas `draft` até `ok`; `ok nota <código>`; `ok` simples
recusado com outra nota pendente; homônimos sem escolha por ordem; memória só de
notas confirmadas; retry com estado durável e teto de 5 tentativas (PISO-003
parcial). Esses testes (`confirmation-reliability.test.ts` etc.) continuam
verdes e são preservados como controles.

## 4. Reprodução (fase 1)

Arquivo: `products/shift-assistant/src/__tests__/preview-receipt-reliability.test.ts`
(3 controles verdes + 8 RED). Os RED usam `it.fails` e, com `F13_RAW=1`, rodam
como testes comuns e mostram a asserção que falha.

| RED | Cenário (webhook + canal sintético) | Asserção que falha hoje |
|---|---|---|
| R1 | canal recusa o preview (503); autor responde `ok` | `confirmed` é `true` (esperado `false`) |
| R2 | envio do preview com resultado incerto (conexão cai) | idem |
| R3 | preview de 2+ partes; a 2ª é recusada | idem |
| R4 | preview de 20 pacientes, cortado pelo limite de partes (aviso "texto longo" enviado) | idem |
| R5 | preview deveria trazer `ok nota <8hex>-r1-<8hex>` | o preview só tem o código de 8 hex |
| R6 | dose 1 mg/2 mg trocada entre Alfa e Beta, mesmos números | `blockingIssues` vazio; confirma |
| R7 | `500 mL` na fonte, `500 mg` na saída | idem |
| R8 | temperatura e FC com valores trocados | idem |

Em todos, as asserções de pré-condição (o envio foi tentado, `unverifiedNumbers`
vazio, nota existe como rascunho) passam antes da asserção do defeito; os
controles C1–C3 provam que o harness confirma quando o preview foi aceito e a
associação é fiel. Saídas brutas: `red-expected-fail.txt` (suíte: 3 passed, 8
expected fail) e `red-raw.txt` (8 failed, 3 passed). Suíte completa do produto
(`products/shift-assistant/src/__tests__`, 13 arquivos): 135 passed, 8 expected
fail.

## 5. Limites e o que não foi feito

- Nenhum teste de reinício/replay do recibo ainda: o estado "recibo" não
  existe; entram na fase BUILD (SPEC 0283 §6).
- O harness usa o cliente WAHA com `fetch` em processo; não há canal real, nem
  Evolution nesta fase.
- A equivalência numérica por extenso (gramática C2 da 0179) e o `SourceEvidence`
  com `quote` ficam fora da fatia 1 da 0283 (dependem de D2); R6–R8 exigem só
  detecção determinística de troca entre blocos/campos/unidades.
- Nenhum gate global foi executado (sem `npm test` completo, sem PG, sem Docker).
