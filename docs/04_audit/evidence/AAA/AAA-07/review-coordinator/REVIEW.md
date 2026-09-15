# AAA-07 — parecer independente do coordenador

**REWORK** por AAA07-C6-F01/F02 (P1). Quatro hashes conferidos; regressão independente **4 arquivos / 42 testes PASS**. Não promover AAA-09 antes de rever a correção do fencing. Nenhum DONE ou gate concedido.

| Finding      | Contraexemplo executado                                                                                                                                                                       | Resultado observado                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| AAA07-C6-F01 | `releaseExpired` lê reserva A expirada; dentro do callback público `evidenceFor`, A é liberada com prova e reserva B é criada. O sweep retoma usando prova de A, com o mesmo status RESERVED. | Prova no_effect apaga B e retorna APPROVED (released=1); prova unknown marca B UNCERTAIN (uncertain=1). B não expirou e não era o alvo da prova. |
| AAA07-C6-F02 | A é liberada; uma nova chamada reserve reutiliza explicitamente o reservationId de A; o portador do token antigo chama markExecuting.                                                         | EXECUTING aceito com token antigo. Não há geração distinta ou rejeição da reutilização após release.                                             |

Causa F01: CAS somente por tenant/status não distingue uma nova geração da reserva quando o estado volta a RESERVED (problema ABA). A checagem da identidade precisa integrar a atualização, inclusive no ramo UNCERTAIN; uma verificação anterior à leitura da evidência não basta. F02 é a reutilização da credencial entre gerações. Replay idempotente da **mesma reserva ainda ativa** pode ser preservado, sem ressuscitar credenciais liberadas.

Prova: `node --import tsx docs/04_audit/evidence/AAA/AAA-07/review-coordinator/fencing-probe.mjs`. Exit 0 significa contraexemplos reproduzidos, não aceite da implementação. O script usa somente APIs públicas, clock injetado e callback síncrono reentrante; não usa SQL, concorrência de processos nem ferramentas externas. Logs em `fencing-probe.log`. Critério após correção: B permanece intacta, counters não anunciam transição não realizada e credencial antiga não autoriza nova geração.

O core reserve/execute/confirm tem regressão verde; esta revisão não afirma que toda a implementação falha. Gates globais e cobertura do autor não foram reexecutados; coverage crítica 84,48% continua abaixo dos 95% da barra técnica congelada, sem dispensa. API legada permanece para consumidores existentes; F02 do runtime ainda depende de AAA-09. Durabilidade não foi comprovada pelo store em memória.

Próxima tarefa única: [Agente 1 — fencing entre gerações de reserva](next-task-agent-1.md). Nenhuma redistribuição das frentes 2/3.
