# CHANNEL_CRITICAL_TESTING_R1 — regressões de persistência e normalização

Task T2 na execução GREEN autorizada. Runtime e contrato não mudam. Gate atual de canais: funções 94,59% e branches 94,85%, barra obrigatória 95% preservada.

Novo teste próprio valida settlement de falha, release e incerteza por lease válida, fencing de owner incorreto, persistência após reabertura e reserva/replay apropriado sem qualquer envio real. Normalização de mensagens sintéticas cobre caminhos opcionais com resultado canônico ou recusa explícita. Todos os testes e fontes existentes permanecem byte a byte; nenhum mock substitui o filesystem no journal.

BUILD em cópia física isolada; Node 22, regressões do pacote e cobertura real. Integração por hash de um novo teste e atualização de inventário/contagens próprias, sem filtros ou bar alterados. DoD: regressões passam, cobertura crítica95 passa no denominador íntegro e gates finais atuais. NO_MODEL, dados sintéticos e T4 separados permanecem; sem provider, push ou produção.
