# I15 — crítica independente fresh-context da resposta I14 e SPEC 0162

- **Data:** 29/09/2026.
- **Claim verificado:** `SPEC-PR301-WEBHOOK-CLOCK-I15-CRITIQUE-001`, ativo em `docs/08_runtime/agent_coordination.md`.
- **Candidato:** `docs/02_spec/0162_webhook_clock_highwater_marker.md`.
- **SHA-256 do candidato antes/depois:** `27d75256040419d8e8cda4145764ce837c447d3d646a07602e8977249507b6f5` / `27d75256040419d8e8cda4145764ce837c447d3d646a07602e8977249507b6f5` (inalterado).
- **Veredito:** `REVISE`; 0 P0, 0 P1, 2 P2 bloqueadores e 1 P3 informativo.
- **Método:** crítica documental somente leitura. O hash atual de `I14-response-proof.json` foi conferido como `f9874fa3743d6d05b5a4b7243aca02d6238bac5f892b9a5b446a11341c80d4cd`; o arquivo registra PASS para Prettier, diff-check, links e higiene. Esses resultados são metadados da prova I14 e não foram reexecutados nesta revisão.

## Fechamento documental dos P2 de I14

**I14 P2-01 — `synchronous_commit=remote_apply` esperando standby com lock SQL: fechado documentalmente.** A resposta I14 define COMMIT local durável e termina a transação/solta os locks antes de capturar a fence WAL, esperar replay da standby e obter o receipt `DECISION_COMMIT`. A SPEC proíbe `remote_apply` sob row/advisory lock. O receipt tempestivo precede slot release, efeitos, readiness e 2xx. A configuração e o comportamento ainda não foram executados.

**I14 P2-02 — expiry e ACK de SAMPLE do `ADMISSION_SLOT`: fechado documentalmente quanto ao expiry finito e ao CAS de append/cancel.** A SPEC agora descreve expiry monotônico na witness, slot one-use, CAS entre `PENDING`, `SAMPLE_RECORDED` e `ADMISSION_SLOT_CANCELLED`, rejeição de SAMPLE tardia, lookup por `operation_id`/nonce/head e cancelamento só após prova linearizável de ausência depois do prazo. Sem quórum/prova, o gate fecha. A garantia de que essa expiry coincide com o deadline de ingress ainda tem a lacuna I15 P2-01 abaixo. Também falta definir a prova terminal de ausência SQL para `SAMPLE_ABORTED` (I15 P2-02).

## Achados bloqueadores

### P2-01 — deadline de ingress não está ancorado de forma verificável entre os três domínios de relógio

**Confiança:** alta quanto à lacuna documental; média quanto ao impacto operacional. **Referências:** SPEC 0162, seção “Estado durável” (slot, ingress deadline, budget SQL e pós-COMMIT); SPEC 0160, A.2.

O handler mede `ingress_deadline` e `slot_budget_remaining_us` em `CLOCK_BOOTTIME`. Esse restante assinado é enviado à witness, que aplica o próprio timer monotônico a partir do recebimento. A SPEC não limita o atraso de transporte nem vincula o deadline absoluto por uma âncora da witness. Uma solicitação atrasada pode, portanto, chegar depois do deadline do handler ainda carregando um orçamento positivo; a expiração witness-side pode terminar depois do deadline original.

Há uma segunda comparação de domínios: a função SQL calcula `decision_at - sampled_at` com timestamps de `clock_timestamp()` do PostgreSQL e compara o intervalo com `decision_budget_remaining_us` derivado de `CLOCK_BOOTTIME`. A.2 limita a divergência temporal e exige amostra/frescor, mas a SPEC 0162 não define uma conversão ou margem que prove que a duração do relógio PostgreSQL nunca subestima o tempo monotônico decorrido entre essas leituras. O runtime ainda proíbe efeito e 2xx sem receipt tempestivo e marca o resultado tardio `effect_allowed=false`; isso contém o efeito externo, mas não prova que o SQL rejeitou toda decisão fora do prazo nem que o slot expirará até o deadline de ingress.

**Resolução mínima:** vincular o prazo por uma âncora temporal que a witness possa impor (ou declarar e aplicar um limite conservador de transporte); especificar a conversão/erro máximo entre elapsed PostgreSQL e `CLOCK_BOOTTIME` para o budget SQL; rejeitar slot/SAMPLE cuja validade não possa ser demonstrada. Preservar a regra de nenhum efeito/2xx antes de `DECISION_COMMIT` tempestivo.

### P2-02 — ausência em readback ainda não define prova terminal para `SAMPLE_ABORTED`

**Confiança:** média. **Referências:** SPEC 0162, “Estado durável” (transições `SAMPLE_ABORTED`/`UNKNOWN_COMMIT`), verificação exigida 1, 2, 5 e 6.

A SPEC corretamente proíbe usar timeout local como prova e manda resolver `UNKNOWN_COMMIT` por `operation_id`. Ela só permite `SAMPLE_ABORTED` depois de readback confirmar que a SQL não commitou, mas não define como esse readback prova que a transação original terminou nem que foi observado o primary/timeline autoritativo. Uma consulta que não vê a linha enquanto o backend original ainda está em curso não prova aborto; se o COMMIT concluir depois, a witness já pode ter encerrado o slot como abortado enquanto marker/reserva existem no banco. No failover, a ausência no novo primary também precisa estar condicionada ao fencing do antigo e à reconciliação da epoch/timeline, pois um COMMIT local pode não ter sido replayed na standby.

O gate fechado e a exigência de receipt antes de qualquer efeito/2xx reduzem o risco de efeito externo; ainda assim, sem a prova terminal, os estados SQL e witness podem divergir e a cadeia/high-water não tem resolução determinística.

**Resolução mínima:** manter `UNKNOWN_COMMIT` e o slot pendentes até prova do término/aborto do PID/txid original ou fencing confirmado do primary antigo; vincular o readback negativo à epoch, timeline e primary autorizados após o ponto de recuperação exigido. Só então anexar `SAMPLE_ABORTED` e reconciliar. Ausência sem essa prova não é estado terminal.

## Demais invariantes revisados

- **COMMIT local, WAL fence e replay:** a ordem documental é coerente: mutação de marker/revision e reserva/lookup na mesma transação; COMMIT local; locks liberados; readback por `operation_id`; fence conservadora `pg_current_wal_flush_lsn()`; observer confirma `replay_lsn >= commit_fence_lsn`; witness registra `DECISION_COMMIT`. Nenhum `remote_apply` aguarda sob o lock. Isto é uma especificação, não uma observação de PostgreSQL; durabilidade efetiva depende da configuração e do storage usados no BUILD.
- **`UNKNOWN_COMMIT` e late outcome:** até readback/fence/replay/receipt não há efeito, slot release nem 2xx. Se o resultado chega depois do `ingress_deadline`, a cadeia preserva o resultado/high-water com `effect_allowed=false`, o gate continua fechado e a outbox não pode executar sem receipt tempestivo. Não encontrei caminho documental de sucesso tardio para efeito.
- **CAS de SAMPLE:** SAMPLE já testemunhada não é cancelada nem apagada; ACK incerto consulta a witness; ausência pré-expiry mantém slot; após expiry o cancelamento compete por CAS no mesmo head. Isso fecha a corrida de append/cancel, condicionado à prova de relógio de P2-01.
- **`SAMPLE_ABORTED`, HA e recovery:** sample abortada participa do máximo externo e requer reconciliação antes de novo `GATE_OPEN`. Promoção exige `FENCE_COMPLETE`, fencing do writer antigo, epoch/timeline autorizadas e replay até a maior fence conhecida. O estado fail-closed está descrito; a classificação de ausência após `UNKNOWN_COMMIT` precisa da prova adicional P2-02.
- **High-water:** o máximo numérico inclui baseline, SAMPLEs, decisões witnessadas, amostras abortadas e rebase; a ordenação append-only é independente da ordem numérica/chegada dos instantes. Revisões/marker avançam sem redução no fluxo normal e qualquer divergência mantém serving fechado. A lacuna P2-02 impede concluir que todo commit local incerto entra numa classe terminal coerente.
- **Carga:** não medida. A barra declarada continua 64 req/s open-loop, cinco runs, p99 ≤800 ms, máximo/deadline ≤1 s e zero perda/erro/timeout. Os números permanecem gates, não evidência.
- **Estado documental:** o cabeçalho e a seção final da SPEC ainda dizem `I14_REQUIRED`/aguardando crítica I14, enquanto a resposta I14 e o claim ativo já levam a esta I15. **P3 informativo**, sem impacto nos invariantes do protocolo; corrigir o status quando o candidato voltar a ser editado.

## Testes e autorização

Não executei testes de software, SQL, migration, PostgreSQL/database, runtime, carga ou BUILD. Também não reexecutei Prettier, diff-check, links nem higiene; apenas li os PASS registrados no `I14-response-proof.json` atual. Esta revisão não escreveu na SPEC 0162, SPEC 0190, código, coordenação ou ledgers.

O veredito `REVISE` não autoriza BUILD. A aprovação humana T3 explícita e vinculada exatamente ao SHA `27d75256040419d8e8cda4145764ce837c447d3d646a07602e8977249507b6f5` ainda falta. Produção permanece `NO_GO`.
