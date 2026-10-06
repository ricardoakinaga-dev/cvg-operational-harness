# Resposta I14 — protocolo de fence pós-COMMIT e expiry do slot

- Data: 29/09/2026.
- Fonte: SPEC 0162 antes da resposta, SHA-256 5a46ce6d814b49102be11ddadaa6ee1af9c0def017ddb42d2f6df006a316c538.
- Crítica: [I14](I14-review.md), SHA-256 228bf9cb1e24a2a7978180d2a7ca007a4033c21e93a5ea285e3c9323f07916bc; prova I14-proof.json, SHA-256 e1bbcac7b06bc886e5fa3b3d7f70f0de1cdd9813073ef5451fb2950b2eab5b9a.
- Candidato revisado: [SPEC 0162](../../../02_spec/0162_webhook_clock_highwater_marker.md), SHA-256 27d75256040419d8e8cda4145764ce837c447d3d646a07602e8977249507b6f5.
- Estado: resposta documental pronta para nova crítica independente; não declara I14 aceito e não autoriza BUILD.

## P2-01 — espera de replicação enquanto o row lock está retido

As transações que retêm row/advisory locks passam a usar synchronous_commit=local, que aguarda o flush local e encerra os locks no COMMIT. A confirmação da standby saiu da transação protegida: depois do COMMIT, uma consulta autocommit captura um pg_current_wal_flush_lsn() conservador ligado ao readback por operation_id; observer/standby confirmam replay até essa fence sem transação ou lock SQL. A witness emite DECISION_COMMIT com tuple, decision_at, fence e replay_lsn. Bootstrap, finalização, reconciliação e recovery seguem o mesmo princípio.

Até o receipt terminal, uma operação localmente commitada fica em COMMIT_PENDING_FENCE/UNKNOWN_COMMIT. Nenhum comando, outbox, 2xx, readiness ou GATE_OPEN é liberado. Timeout não cancela a amostra nem desfaz o high-water; readback resolve por operation_id. Se a confirmação terminar depois do deadline, a cadeia registra a conclusão com effect_allowed=false e o gate continua fechado para recovery. O high-water externo continua incluindo DECISION_COMMIT.decision_at.

## P2-02 — expiração e cancelamento do ADMISSION_SLOT

O slot recebe expiry monotônico próprio da witness, one-use, limitado pelo menor entre 1.000 ms, o orçamento autenticado restante da requisição e os leases de ingress/epoch. O prazo de decisão começa no ingresso HTTP antes da espera pelo slot. O runtime mede CLOCK_BOOTTIME; a witness aplica o seu deadline monotônico e rejeita extensão ou SAMPLE tardia. Após a leitura de sampled_at, o runtime calcula decision_budget_remaining_us conservador; SAMPLE/attestation o vinculam e a função SQL limita decision_at - sampled_at por esse orçamento. A medição de desempenho inclui a espera pelo slot e o fence de réplica.

O ciclo one-use é PENDING -> SAMPLE_RECORDED ou, somente após expiry e prova linearizável de ausência, PENDING -> ADMISSION_SLOT_CANCELLED. Em ACK incerto, consulta por operation_id/nonce/head resolve SAMPLE já anexada; ausência antes do prazo mantém o slot pendente; após o prazo, cancellation CAS compete no mesmo head e impede append tardio. Sem quórum/prova, o gate fica fechado. De SAMPLE_RECORDED, só DECISION_COMMIT depois do commit/fence ou SAMPLE_ABORTED depois de readback provar que SQL não commitou. Uma SAMPLE testemunhada nunca é descartada. SAMPLE_ABORTED exige reconciliação e novo GATE_OPEN.

## Verificação e limites

- prettier --check e git diff --check passaram para a SPEC; os hashes antes/depois da crítica I14 foram preservados no proof.
- Não foram executados testes, SQL, migration, PostgreSQL, carga ou runtime nesta resposta.
- O throughput 64 req/s, p99 <=800 ms, deadline <=1 s e zero perda continuam gates a medir; a serialização e o fence pós-COMMIT podem não atingir a barra.
- O drift P3 em docs/02_spec/0190_spec_validation.md permanece fora desta resposta porque o arquivo está sob claim/alteração concorrente. Deve ser reconciliado pelo owner antes do próximo gate.
- Nova crítica independente no hash 27d75256… é obrigatória. Mesmo com ACCEPT, BUILD sintético exige nova aprovação humana T3 para esse hash. Produção permanece NO_GO.
