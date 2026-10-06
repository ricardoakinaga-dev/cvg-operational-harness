# I13 — resposta documental da SPEC 0162

- Parecer de origem: crítica independente I13, REVISE no SHA-256 6e3d4eed7c5381710a8b0c75376e11d7068ca731183019da7c74de21cde1f1ad, com 1 P1 e 1 P2.
- Candidato após resposta: docs/02_spec/0162_webhook_clock_highwater_marker.md, SHA-256 5a46ce6d814b49102be11ddadaa6ee1af9c0def017ddb42d2f6df006a316c538.
- Escopo: contrato documental. Nenhum código, SQL executável, migration 0028, teste comportamental, banco, runtime, canal real, deploy, push ou dado real foi alterado/usado.

## P1 — high-water dos commits

O máximo externo da epoch agora inclui DECISION_COMMIT.decision_at, junto com baseline, samples, amostras de reconciliação, abortos witnessados e baseline de rebase. Cada receipt de decisão liga epoch, revisão, decision_at, operation id, outcome, digest, readback do marker e fence WAL.

Para que nenhuma SAMPLE concorrente ultrapasse o decision_at de outra requisição, a SPEC acrescenta um ADMISSION_SLOT exclusivo por epoch, witnessado e one-use. A ordem é slot, snapshot/sample, receipt e attest, transação SQL curta, COMMIT, receipt DECISION_COMMIT, liberação do slot e só então comando/2xx. O slot carrega o high-water externo anterior; a função exige que o marker o cubra e que decision_at cubra a própria amostra e o high-water anterior. Toda SAMPLE persistida continua no máximo. Se a operação não commitou, SAMPLE_ABORTED mantém a amostra e obriga fechar, reconciliar e reabrir com novo GATE_OPEN antes de novo serving. Um COMMIT incerto conserva slot/gate fechados até ser resolvido por operation id.

## P2 — I/O remoto sob row lock

Preflight, espera do slot, SAMPLE, receipts e attest acontecem sem transação/row lock SQL aberto. A função authorize_and_reserve_or_lookup valida localmente proofs assinados e faz apenas revalidação/mutação SQL atômica sob FOR UPDATE. A publicação pós-COMMIT do receipt DECISION_COMMIT e o fencing do slot também ficam fora do lock. Bootstrap, reconciliação e break-glass mantêm a regra: I/O externo antes/depois de uma transação SQL curta.

## Revisões e critério de desempenho

A tupla de preflight e attest inclui guard_revision; decisões e reconciliações incrementam a revisão exatamente uma vez dentro da epoch, e uma nova epoch de recovery começa em zero. As tabelas/claims/receipts registram revisões anteriores e novas.

O slot serializa o serving da epoch e pode limitar throughput. A SPEC torna isso um risco explícito e preserva a barra de carga open-loop de 64 req/s, p99 máximo de 800 ms, decisão confirmada em até 1 s e zero perda/erro/timeout. A revisão I14 deve avaliar se o protocolo é seguro e implementável; BUILD só poderia testar esse contrato em PostgreSQL descartável depois de nova aceitação independente e aprovação humana do hash exato. Se a barra de carga falhar, a SPEC volta para revisão.

## Estado

A resposta fecha I13 somente no nível documental e preserva as resoluções de I12. Não prova o funcionamento do protocolo. I14 fresh-context e aprovação humana T3 para o hash 5a46ce6d814b49102be11ddadaa6ee1af9c0def017ddb42d2f6df006a316c538 continuam obrigatórias. BUILD 0028 permanece pausado; produção permanece NO_GO.
