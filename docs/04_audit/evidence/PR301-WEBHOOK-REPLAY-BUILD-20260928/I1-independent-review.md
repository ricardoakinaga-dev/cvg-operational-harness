# I1 — revisão independente do BUILD PR-301 webhook replay

- Data: 28/09/2026.
- Commit revisado: `737e9c17b5246ab623ff9e7bdcf33a16f9ba0844`.
- Base: `7ef74e7f4fd2b1141e416b85c7337f119e1333ab`.
- Veredito: `REVISE`.
- Método: leitura estática read-only; nenhum teste foi executado nesta revisão.
- Escopo e limite: sem provider, canal, segredo, ambiente de deploy ou dado real. O parecer não autoriza integração, promoção ou produção.

O revisor confirmou por inspeção o caminho HMAC sobre raw body, o isolamento RLS tenant-scoped e a transação que confirma mensagem, outbox, auditoria e receipt. Encontrou, contudo, os bloqueios abaixo. A revisão observou que as SPECs não estão presentes no SHA auditado e consultou os contratos normativos no histórico local (`fcf627b` para 0160 e `ea13f82` para 0161), sem usar os relatórios do BUILD como evidência.

## Achados

1. **P1 — Amostras normais do relógio PostgreSQL podem impedir o boot.** `clock_timestamp()` é lido em microssegundos e convertido a milissegundos fracionários; a validação requer inteiro. Amostras cujo submilissegundo não seja zero falham na checagem de saúde. O startup executa a checagem antes de servir webhooks, e o teste atual fabrica `now_us` alinhado a milissegundo, ocultando o caso.
2. **P1 — Eventos `pending` não são retomados após a expiração da assinatura.** O crash após reserva deixa payload cifrado no inbox. A retomada disponível passa pela rota HTTP e pela verificação de timestamp; a busca da linha existente também restringe a janela. Após expirar a assinatura, não há reconciliador interno, então o inbound pode permanecer sem processamento.
3. **P2 — Regressão do relógio não é retida entre instâncias/restarts.** `previousSample` é apenas local ao processo. Um pequeno retrocesso dentro do orçamento de erro pode reabrir a janela; restart apaga o histórico. A2 de 0160 pede marcador high-water durável.
4. **P2 — Não existe caminho de retenção/exclusão aprovado.** A migration cria índice de retenção, mas o trigger bloqueia todo `DELETE` e o runtime não tem privilégio de exclusão. Sem operação de limpeza auditada, identificadores e registros committed crescem indefinidamente; linhas pending sem recuperação também ficam retidas. A política D-06 continua pendente.
5. **P2 — Rotação de assinatura e chave de payload não está fechada.** A composição lê um único `WEBHOOK_SIGNING_SECRET`, sem sobreposição da chave antiga/nova requerida por 0160 B2. A key ring AES não prova que chaves ainda referidas por eventos pending permanecem disponíveis; remover uma chave pode deixar startup verde e tornar decriptação/retry impossível.
6. **P2 — Preflight não prova a semântica do trigger.** O preflight procura fragmentos textuais no source do trigger. Uma definição enfraquecida pode conservar os fragmentos em comentários e retornar `NEW`, sendo aceita no startup. Falta negativo que altere adversarialmente o corpo da função.

## Cobertura ainda ausente segundo a revisão

- 0160 A2/A3: high-water durável, regressão inclusive entre restart e paridade de fronteiras em memória/PostgreSQL.
- 0160 B2/B3: retenção aprovada e cleanup auditado; sobreposição de segredo; reconciliação interna de eventos expirados.
- 0160 B5: injeção de crash nos pontos exigidos, incluindo após commit/antes da resposta e após resposta.
- Testes: amostra não alinhada a milissegundo, regressão em restart, pending expirado, rotações HMAC/AES com pending, retenção, trigger semanticamente enfraquecido e crash de processo real.
- Idempotência do efeito no provider externo não foi provada nem autorizada.

## Arquivos apontados pelo revisor

- `apps/api/src/webhook-event-inbox.ts`: amostra/validação do relógio, lease e decriptação.
- `apps/api/src/server.ts`: preflight de startup, rota inbound e segredo HMAC.
- `apps/api/src/__tests__/webhook-event-inbox.test.ts`: fixture de relógio alinhada a milissegundo.
- `packages/persistence/migrations/0027_webhook_event_inbox.sql`: trigger de exclusão.
- `apps/api/src/tenant-preflight.ts`: comparação textual do trigger.
- `apps/api/src/__tests__/tenant-schema-inventory-postgres.test.ts`: teste de preflight sem adulteração adversarial da função.

Fonte: resultado integral do revisor independente registrado para esta task; parecer read-only. Ver também o [relatório do BUILD](report.md) e a [prova de gates](proof.json).
