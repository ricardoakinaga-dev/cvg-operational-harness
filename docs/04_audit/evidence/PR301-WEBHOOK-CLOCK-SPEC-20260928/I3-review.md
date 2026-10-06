# I3 — crítica independente da SPEC 0162

- Data: 28/09/2026.
- Hash revisado: `5d25c4736842b601b3cf408ae935d6ebc134c7f4842df70e889fc781680562cd`.
- Veredito: `REVISE`; cinco P1 e um P2, sem P0.
- Método: fresh-context, somente leitura das SPECs normativas 0160/0161/0162; sem implementação, migration ou teste de banco.

## Achados

1. **P1 — Uma observação de relógio pode ficar sem publicação enquanto outra decisão prossegue.** Em `Avanço e decisão` §§1–5, uma instância pode medir um valor posterior e bloquear ao publicar porque outra mantém `FOR SHARE`; se o relógio regredir mas permanecer acima do high-water antigo, a decisão anterior ainda pode passar. Exigir uma protocolização que tome o lock exclusivo antes de observar PostgreSQL e serialize publicação e decisão; teste por barreiras precisa reproduzir a observação concorrente, regressão entre o marcador e a amostra bloqueada, e nenhuma reserva/receipt.
2. **P1 — Timeout durante COMMIT não garante zero gravação.** Uma conexão perdida pode deixar resultado de commit incerto; 0160 B1/B3 exige caminho verificável para essa incerteza. Separar timeout pré-commit (rollback e zero message/outbox/audit/receipt) de acknowledgment perdido após commit (resposta incerta e lookup/reconciliação por event key); testar queda da conexão após commit e retorno do mesmo receipt sem segundo efeito.
3. **P1 — Aprovação e privilégios de recovery não estão suficientemente fechados.** A SPEC exige provas ligadas ao reset, mas não define sua validação/consumo durável nem limita o executor que precisa desativar trigger. Definir envelopes verificáveis, nonce e referências one-use consumidos atomicamente, e uma operação privilegiada estreita; recovery identity não pode atualizar diretamente o marcador nem administrar trigger. Testar corrida com as mesmas approvals (no máximo um commit), aprovação alterada/expirada/replay recusada e DML/DDL direto negado.
4. **P1 — Export imutável não bloqueia readiness após recovery.** A exportação externa pode falhar depois do commit local enquanto o serviço reabre. Recovery deve manter readiness/ingress fechados até confirmar export independente bound ao recovery; testar crash entre commit e export, falha de export e retomada após restart.
5. **P1 — Fonte autoritativa do inventário/bootstrap não está definida.** Capturar “cada instância” não prova completude se uma instância reiniciou/desapareceu. Definir ledger autoritativo durável do controlador de ingress/deploy e armazenamento persistente da última máxima por boot/instância; qualquer instância servidora sem prova mantém ingress fechado. Testar instância desaparecida e reiniciada.
6. **P2 — “Zero duplicate effect” extrapola a fronteira local.** Limitar o teste sintético a uma mensagem/outbox/auditoria local por event key e zero dispatch externo; isso não comprova exactly-once no provider, que segue gate B4 de 0160.

Mesmo com estes reparos, D-06, reconciliador de pending, idempotência do provider e demais gates 0160 permanecem necessários. O parecer não concede aprovação humana T3 ou autorização de BUILD.
