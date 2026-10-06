# PR301 webhook replay fix — revisão independente I1

- Candidate: worktree isolado `/tmp/cvg-pr301-webhook-replay-20260928`.
- Resultado estático: `REVISE` para dois achados P2 no harness do teste de processos; lógica de replay, transações/fencing, clock fail-closed, isolamento tenant e preflight foram aceitos para o escopo sintético.
- O revisor não alterou arquivos nem executou testes; todos os cinco hashes coincidiram no início e no fim.
- Aprovação do BUILD sintético 0160/0161 não foi verificável pelo revisor porque o worktree candidato não continha o documento SPEC 0161. A aprovação existe no turno do usuário e a SPEC está no checkout compartilhado; esse contexto foi incluído na solicitação da próxima revisão.

## Achados de implementação

1. **P2 — corrida no sinal de pausa.** O worker imprimia `COMMIT_PAUSED` antes de instalar o listener de `SIGUSR1`; o parent poderia enviar o sinal nesse intervalo e deixar a requisição parada. Corrigido registrando o listener antes de emitir o marcador.
2. **P2 — cleanup de processo ocultava falhas.** `stopWebhookProcess` enviava `SIGKILL` no timeout sem aguardar exit, enquanto o `finally` suprimia a rejeição. Corrigido para aguardar exit após SIGTERM/SIGKILL, falhar se o worker exigir kill forçado ou não sair, executar limpeza de role/schema mesmo diante de erros e propagar um `AggregateError`.

O resultado detalhado de replay/tenant/preflight e os hashes recebidos estão no parecer do revisor da conversa. A nova crítica deve confirmar os hashes pós-correção e revisar a prova humana existente em [`scope-approval.md`](scope-approval.md).
