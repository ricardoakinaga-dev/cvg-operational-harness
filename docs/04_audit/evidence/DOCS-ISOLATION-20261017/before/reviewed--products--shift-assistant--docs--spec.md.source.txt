# Contrato do consumidor

O Assistente de Plantão recebe mensagens da equipe, prepara rascunhos e pendências
e exige validação humana. Não escreve prontuário definitivo ou decide conduta.
Sua configuração, entrada HTTP, journal, mídia, imagem e banco de pendências
pertencem exclusivamente a este programa.

Fontes aprovadas que preservam sua autoridade histórica:

- [SPEC0177 — fase1](../../../docs/02_spec/0177_assistente_plantao_fase1_caderno.md).
- [ADR009 — D1–D4](../../../docs/architecture/adrs/ADR-009-assistente-de-plantao.md):
  WAHA/Evolution, Whisper local e modelo externo, piloto por turno e retenção como
  documentos sem apagamento por prazo, saída da base ativa só após backup confirmado.
- [Barra0368 do consumidor](../../../docs/03_build/0368_barra_proporcional_assistente_de_plantao.md).
- [Origem histórica dos requisitos AP001–016](../../../docs/CVG_DIRECAO_PROGRAMAS_E_PLANO_HARNESS_2026-09-30.md), com [correspondência e status por dono](requisitos-ap.md).

Contratos de mudança com aprovação humana para BUILD local sintético em03/10,
nos hashes exatos do [recibo de autoridade](../../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/human-t3-approval.json):

- [SPEC0179 — confiabilidade do produto](../../../docs/02_spec/0179_shift_consumer_reliability.md).
- [SPEC0180 — integração com gateway e transporte compartilhado](../../../docs/02_spec/0180_shared_transport_ci_security.md).
- [Pacote de revisão humana histórico](../../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/revisao_humana_t3.md), preservado como preparação anterior ao recibo.

Os textos PROPOSED/PENDING das SPECs congeladas registram a preparação; não
anulam o recibo posterior. Aprovação de BUILD local não é aceite das correções,
promoção ao checkout principal ou autorização de modelo/canal real. D2 continua
aberta para organização clínica por modelo, com NO_MODEL, conforme o
[estado canônico do produto](backlog.md#decisão-separada--revisão-da-d2-organização-por-modelo).

A [SPEC0178](../../../docs/02_spec/0178_harness_consumer_extraction.md) governa apenas
a extração estrutural. Os defeitos de confirmação, paciente, recovery, transporte
e operação permanecem nos cartões [PISO](backlog.md) até seus oracles passarem.
O produto ainda usa provider.execute na composição atual; consumo por gateway
governado é mudança T3 especificada, sem migração antecipada.
