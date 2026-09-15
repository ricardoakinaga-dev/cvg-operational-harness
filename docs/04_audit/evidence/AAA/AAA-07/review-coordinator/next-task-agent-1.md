# Agente 1 — AAA-07 / fencing entre gerações de reserva

Execute somente o rework AAA07-C6-F01/F02. Leia AGENTS, estado/log/backlog, contrato AAA-03 rev2 + adendo aprovado e REVIEW.md adjacente. AAA-07 permanece REWORK; AAA-09 não autorizada nesta rodada.

## Escopo autorizado

Correção local/sintética em `packages/approval-engine/src/{engine,store,contracts,index}.ts` e testes do pacote; ajuste store somente se necessário para CAS com identidade/geração. Evidências próprias em AAA-07, preservando manifestos e RED anteriores. Sem runtime.ts, SQL/migrations, persistência, package/lockfile, contratos congelados ou registros compartilhados. Não iniciar outra task.

## Aceite

1. Preserve RED do probe do coordenador: sweep de A não pode liberar nem marcar UNCERTAIN reserva B criada durante evidenceFor. Cubra ambos os ramos, além de callback que confirma ou muda o estado. B deve permanecer byte-equivalente ao snapshot posterior à sua criação, com token, TTL e owner intactos; nenhum evento ou contador deve atribuir liberação/incerteza inexistente.
2. Garanta compare-and-set com identidade/geração esperada no ponto da mutação, não apenas checagem anterior. Aplique proteção consistente às transições de reserva e recuperação. Não execute callback de efeito dentro de seção crítica; mantenha o contrato síncrono ou documente explicitamente qualquer proposta incompatível antes de expandir.
3. Após release e nova reserva, a credencial antiga jamais deve autorizar markExecuting, confirm, release, fail ou markUncertain. Reutilização explícita do reservationId anterior deve ser rejeitada ou receber geração nova que torne a credencial antiga insuficiente. Preserve replay legítimo da mesma reserva ativa, isolamento entre tenants e comportamento dos consumidores legados. Não confunda chave de idempotência com token de fencing.
4. Testes pelo caminho público: stale sweep/no_effect, stale sweep/unknown/erro, confirmação durante evidência, troca de geração, token reutilizado, token antigo em todas as mutações, controles sem corrida, TTL e efeitos ausentes. Nenhum efeito externo. Mantenha 42 testes existentes e regressão dos consumidores. Prove eventos/contadores exatos.
5. Atualize matriz de transições e handoff AAA-09 para explicitar geração/token e CAS. Não altere a SPEC congelada silenciosamente. Execute gates disponíveis, registre coverage crítica ainda pendente sem baixar pisos; não transforme esta tarefa em rodada ampla de coverage.

## Entrega

IMPLEMENTED_PENDING_INDEPENDENT_REVIEW com novo manifesto/hashes, RED→GREEN, diff, comandos/exit codes, limites e handoff atualizado. Sem autoaprovação DONE, commit/push/deploy. O coordenador audita e integra os registros; só então define a próxima task.
