# Revisão independente — AUD0598

- Revisor: Aquinas, agente `01a11116-cd3b-7b42-8d12-03deec20109b`.
- Candidato: `2356a2518ab82c6bfea9f8cfb7277170cb02aa7f`.
- Método: read-only; fontes do SHA solicitado; comparação com `283ab74`; sondas próprias em memória, Node 24.20.0. Sem edição, instalação, suíte global, PostgreSQL/Docker, push ou descendentes. Agente encerrado após entregar o parecer.
- Consolidação do parecer recebido; as reproduções arquivadas são as do lead em Node 22, não logs de execução do revisor.

REJECT para o fechamento integral da remediação 2356a2518ab82c6bfea9f8cfb7277170cb02aa7f: dois P1 e dois P2 confirmados. Revisor independente Aquinas; read-only; Node 24.20.0; fontes carregadas diretamente do SHA e comparação com 283ab74.

1. P1 — pausa após reserva torna a aprovação inutilizável (controls.ts:546, iterative-dispatch.ts:459). not_started chama fail, adaptador real termina FAILED; iterativo conserva checkpoint retomável. Resume resulta INTERNAL_FAILURE por colisão stepId; corpo/efeitos zero. Nova trajetória defeituosa da remediação, F01/F03 incompletos. Oracle I12: pausa sem efeito conserva pendência efetivamente recuperável.
2. P1 — orçamento de resume reconta chamada após aprovação pendente (iterative-runtime.ts:588, iterative-dispatch.ts:346). APPROVAL_REQUIRED -> approve -> pausa checkpoint -> HUMAN_TAKEOVER. stopReason APPROVAL_REQUIRED, toolCalls1. inFlightCounted exige !stopReason; resume max1 retorna MAX_TOOL_CALLS, corpo zero, aprovação APPROVED. Problema preexistente parcialmente corrigido. Oracle: chamada já contabilizada mantém contador1.
3. P2 — exceção checkpoint deixa chamada sem resultado (pipeline.ts:269). beforeDispatch escapa sem fechamento: tool/call1, tool/result0, corpo/reserva zero. Preexistente; promessa fechamento único incompleta. Oracle I5: tentar um único not_started também quando checkpoint rejeita.
4. P2 — falha log de chamada negada ocultada (pipeline.ts:254). closeNotStarted ignora erro normalizado de appendLog. POLICY_DENIED sem informar falha registro. Omissão introduzida no novo fechamento. Oracle: propagar falha conservando zero efeito.

Controle adaptador real sem pausa PASS: COMPLETED/EXECUTED/body1. Ordering checkpoint antes da reserva aceito; fechamento integral de recuperação/logging rejeitado. Três primeiros coincidem com sondas independentes do revisor; quarto executado pelo lead e confirmado estaticamente pelo revisor. Tentativa inicial do lead com callback que não disparou não é achado. Sem edição, instalação, suíte global, PG/Docker, push ou agente descendente.
