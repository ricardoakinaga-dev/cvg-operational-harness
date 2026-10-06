# Resposta documental à crítica I16 — SPEC 0162

Data: 29/09/2026. Candidato anterior SHA-256 `c36b5fbdbee42605269bd04a54839f4b910665d32fc78f075d626b77be0da06f`; candidato revisado SHA-256 `e2378a5b54b7453953f89fe35209766b247b55ea90cf6e59050fbc375f70b095`. Parecer I16 [REVISE](I16-review.md), SHA-256 `9d2e67191f6d2fdb303e87dcce53078b27bf35c22c20ef0d9963f31787552a8e`; prova [JSON](I16-proof.json), SHA-256 `3534be56734461d3dc1593a64e76107d2710d004291ddee089924fc9b8ae2e4a`.

## P2-01 — prova de relógio do worker

A SPEC agora trata o worker como veto fail-closed no limite de dispatch. `EFFECT_ENABLE` vincula operação, worker, boot, geração do relógio e deadline. O worker precisa de `worker_clock_bound` assinado por monitor aprovado, com fonte/sequence, amostra BOOTTIME, UTC estimado, componentes de incerteza e validade. O perfil deve fixar `F_worker` em valor exato até 100 ms; o limite superior `utc_estimate + U_worker(age)` precisa ficar estritamente antes do deadline no ponto final de envio. Reboot, step, troca/perda de fonte, prova ausente/stale, bound incerto, geração/identidade divergente e qualquer fila não protegida mantêm a outbox não-dispatchable. Foram acrescentados negativos para cada estado e captura no dequeue/socket-write.

## P2-02 — reuso depois de cleanup

`operation_id` passa a ser emitido por issuer confiável e registrado atomicamente em registry append-only da witness com unicidade global. A registry mínima sobrevive à limpeza D-06 da linha SQL e não contém tenant, evento, assinatura ou payload. A limpeza não reseta nem apaga essa garantia; se a política não autorizar a retenção mínima, serving permanece fechado até redesenho. Uma linha operacional removida produz estado `RETIRED`, sem nova SAMPLE, marker, reserva, outbox, dispatch ou 2xx. Registry ausente, restaurada para trás, em fork ou indisponível mantém `UNKNOWN_COMMIT` e fecha serving. Os testes planejados cobrem emissão concorrente, replay/digest divergente, ID após cleanup, ACK incerto e perda/rollback da registry.

## Estado do gate

Resposta somente documental. O hash novo requer crítica independente I17; depois de `ACCEPT`, ainda exige aprovação humana T3 explícita para o mesmo SHA-256. Nenhum teste, SQL, migration, banco, runtime, carga ou BUILD foi executado. Migration 0028 não autorizada; sem dados reais, push, deploy ou produção. Produção `NO_GO`.
