# Resposta documental à crítica I17 — SPEC 0162

Data: 29/09/2026. Candidata examinada por I17: SHA-256 `e2378a5b54b7453953f89fe35209766b247b55ea90cf6e59050fbc375f70b095`. Nova candidata: SHA-256 `ff5a24604a929b3e333ccaf0976035ba028d08c4e609b2102abe567d0e5862a1`. Parecer [I17 REVISE](I17-review.md), SHA-256 `4fa61d63154ff8543b519df79be609a2de8ea47cd3ab508df189b2a2a1fe8627`; prova [JSON](I17-proof.json), SHA-256 `ece64f4b001e08cea79cbf5245d6f652e54af4d6afc7624bcca9808a674fb14d`.

## P2-01 — claim single-consumer e estados de dispatch

A SPEC define agora `PENDING_TEMPORAL_RECEIPT -> PENDING_WORKER_CLOCK_PROOF -> DISPATCH_CLAIMED -> DISPATCH_COMPLETED`, além dos estados sem redrive `DISPATCH_SUPPRESSED` e `DISPATCH_OUTCOME_UNKNOWN`. `PENDING_WORKER_CLOCK_PROOF` autoriza somente disputar claim. Um CAS antes da checagem temporal final vincula um claim ID estável à operação, receipt, permit, worker, boot e geração, e consome `EFFECT_ENABLE` uma única vez. Pollers perdedores não ganham takeover após lease nem outro permit.

Toda seleção/preparação ocorre antes da checagem worker-side final no limite efetivo do transporte. Uma falha temporal suprime o envio; gravação incerta não autoriza transporte. Após checagem bem-sucedida não há await, yield, fila, lock, banco ou I/O de controle antes de iniciar o transporte. Crash/ACK incerto após claim conserva o estado como possivelmente enviado e proíbe redrive; ACK íntegro tardio só resolve o mesmo claim, sem novo I/O. A SPEC acrescenta negativos para pollers concorrentes, replay de permit, CAS/ACK incerto, crashes em cada fronteira e guarda stale/expirada.

## Estado do gate

Resposta somente documental. É necessária crítica independente I18 fresh-context para o hash atual; mesmo um ACCEPT exige aprovação humana T3 explícita para o mesmo SHA antes de migration 0028. Nenhum teste comportamental, SQL, migration, banco, runtime, carga ou BUILD foi executado. Sem dados reais, push, deploy ou produção. Produção `NO_GO`.
