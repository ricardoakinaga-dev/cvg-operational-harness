# REM21-009 — PRD

## Resultado pretendido

Entregar um pacote offline que permita a uma autoridade futura revisar e
qualificar IdP, provider, canal, fonte institucional e egress sem confundir
fixtures locais com evidência externa. O pacote deve ser útil para handoff,
fail-closed por ausência de dados críticos e incapaz de liberar produção.

## Usuários e autoridades

Os papéis abaixo são slots de decisão, não pessoas inventadas:

| Papel | Responsabilidade | Estado atual |
|---|---|---|
| Dono de identidade | protocolo, audience, tenant mapping, rotação e revogação do IdP | `PENDING` |
| Dono de provider/modelo | contrato, dados, custo, retenção, fallback e limites | `PENDING` |
| Dono de canal | opt-in, limites, webhook, idempotência e janela | `PENDING` |
| Dono de dados/fonte | acervo aprovado, versão, owner, revogação e redaction | `PENDING` |
| Segurança | threat model, egress, segredo, privacy e abort | `PENDING` |
| Operação | ambiente, observabilidade, rollback, RPO/RTO e incidentes | `PENDING` |
| Autoridade de release | decisão separada sobre o candidato e o escopo | `PENDING` |

## Fluxos de produto

1. **Preparar:** preencher somente campos sintéticos e registrar lacunas como
   `PENDING`.
2. **Revisar:** validar contrato, threat model, matriz de owners, fixtures,
   rollback e critérios de abort offline.
3. **Handoff:** produzir pacote com hashes e perguntas concretas para os donos;
   não enviar nada a terceiros.
4. **Qualificar futuramente:** somente depois de `G21-5`, ambiente aprovado,
   credenciais fornecidas por autoridade e janela explícita; cada integração é
   qualificada separadamente.
5. **Abortar:** qualquer falha de identidade, escopo, fonte, egress,
   segurança, observabilidade ou rollback interrompe a tentativa e preserva a
   evidência.

## Requisitos de aceite offline

| ID | Requisito | Prova |
|---|---|---|
| `REM21-009-PRD-01` | O pacote identifica os cinco domínios externos e não inventa owner, endpoint, secret ou aprovação. | matriz de autoridade e fixture negativa. |
| `REM21-009-PRD-02` | Todo contrato exige identidade, escopo, classificação de dados, correlação, idempotência, limites, observabilidade e rollback. | schema/contrato versionado. |
| `REM21-009-PRD-03` | Fixtures sintéticas cobrem sucesso controlado, ausência de owner, destino não allowlisted, source revogada, tenant mismatch, replay, timeout e ação sensível. | matriz de casos offline; nenhum caso usa credencial real. |
| `REM21-009-PRD-04` | Falta de autoridade ou evidência stale resulta em `BLOCKED`, `HANDOFF` ou `ABORT`, nunca `GO`. | validação negativa do pacote. |
| `REM21-009-PRD-05` | O runbook separa preparação local, qualificação externa e decisão humana. | runbook com gates e pré-condições. |
| `REM21-009-PRD-06` | Rollback/abort preserva journal, outbox, correlação e redaction, e não executa ação sensível automática. | runbook de rollback e threat-model addendum. |

## Fora de escopo

- qualquer login, handshake ou chamada a IdP/provider/canal;
- qualquer segredo, token, URL operacional ou dado real;
- envio/recebimento de mensagem, chamada clínica, financeira ou de agenda;
- resposta RAG sem fonte institucional aprovada;
- medição de RPO/RTO, SLA ou custo de produção;
- aprovação de owner, segurança, operação ou release por silêncio;
- alteração de código/runtime para simular qualificação externa.

## Definição de pronto local

REM21-009 pode ser marcada `OFFLINE_PREPARATION_COMPLETE /
BLOCKED_BY_G21-5` quando o schema, fixtures, matriz, threat model, runbooks e
decision packet passarem validação documental e nenhum artefato contiver
material real. A task não pode ser marcada `VERIFIED_EXTERNAL` sem G21-5 e
decisão humana registrada.
