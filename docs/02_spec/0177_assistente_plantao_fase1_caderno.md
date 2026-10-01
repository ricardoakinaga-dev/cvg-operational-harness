# SPEC 0177 — Assistente de Plantão, fase 1: caderno de plantão no WhatsApp

- Data: 30/09/2026. Status: `APPROVED_BY_DIRECTION` — BUILD autorizado pelo
  usuário em 30/09/2026 ([ADR-009](../architecture/adrs/ADR-009-assistente-de-plantao.md),
  backlog AP-007–AP-014 do
  [documento de direção](../CVG_DIRECAO_PROGRAMAS_E_PLANO_HARNESS_2026-09-30.md)).
- Barra de produção: [0368](../03_build/0368_barra_proporcional_assistente_de_plantao.md).
- Código: `apps/worker/src/shift-assistant/`.

## Objetivo

Provar que os plantonistas usam o WhatsApp para registrar o plantão: áudio,
texto ou foto viram nota organizada, texto pronto para colar no HIS e
pendências com lembrete. Sem integração com o HIS nesta fase.

## Fluxo

1. WAHA ou Evolution chama `POST /webhooks/waha` ou `POST /webhooks/evolution`
   com o segredo compartilhado (`x-cvg-webhook-secret` ou `?secret=`).
2. Só mensagens diretas de números cadastrados (`SHIFT_MEMBERS`) são aceitas;
   grupos, mensagens próprias e números desconhecidos são ignorados (o
   desconhecido é registrado sem conteúdo).
3. A mensagem é gravada no registro de eventos **antes** de qualquer
   processamento (idempotente por id da mensagem). Na reinicialização, mensagens
   recebidas e não processadas são processadas.
4. Comandos são tratados de forma determinística: `pendências`, `feito N`,
   `adiar N 30` / `adiar N 1h`, `ok`, `corrigir <texto>`, `ajuda`; o gestor
   também tem `pausar assistente` e `retomar assistente`.
5. Áudio → Whisper local (API compatível com OpenAI, `/v1/audio/transcriptions`).
   Foto → guardada como anexo da nota, com a legenda como texto.
6. O texto vai ao modelo externo pelo `OpenAICompatibleProvider` do
   `model-gateway`. O modelo **não recebe ferramentas**: devolve JSON validado
   por schema (pacientes, evolução, exames pedidos, condutas, pendências com
   horário, dúvidas). JSON inválido ou falha do provedor → a nota fica com o
   texto bruto e o plantonista é avisado.
7. O serviço monta, de forma determinística, o texto para colar no HIS e as
   pendências. Todo número que aparece na saída do modelo e não está no texto
   original é sinalizado para conferência.
8. Lembrete na hora da pendência (sem hora: 2 h depois), repetido a cada 30 min
   até 4 vezes, até `feito N`. Escalonamento fica para a fase 2.

## Segurança (poder zero por construção)

- Nenhuma ferramenta de escrita no HIS, shell, arquivo arbitrário ou rede livre.
- Saída de rede só para as origens configuradas (WhatsApp, Whisper, modelo);
  qualquer outra URL é recusada antes da requisição.
- Envio de mensagens só para números cadastrados.
- Logs sem conteúdo de mensagem: apenas ids, tipos e resultados.

## Retenção (decisão D4)

Registro de eventos append-only em `SHIFT_DATA_DIR/events.jsonl` e mídias em
`SHIFT_DATA_DIR/media/`. Nada é apagado por prazo; os arquivos são documentos e
saem da base ativa só depois de confirmados no backup (procedimento operacional
fora do código desta fase).

## Aceite

- Testes automatizados com fakes para WhatsApp, Whisper e modelo: entrada por
  texto e áudio, comandos, deduplicação, retomada após reinício, lembretes,
  número desconhecido, segredo inválido, URL fora da lista, pausa e retomada.
- Piloto de duas semanas por turno (AP-016) decide seguir, ajustar ou parar.

## Fora desta fase

Leitura do HIS, passagem de plantão, escalonamento, painel do gestor, leitura
automática de foto e PostgreSQL (o registro em arquivo basta para o piloto).
