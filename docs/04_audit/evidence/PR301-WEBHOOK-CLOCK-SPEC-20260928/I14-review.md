# I14 — crítica independente fresh-context da SPEC 0162

- **Data:** 29/09/2026.
- **Candidato:** `docs/02_spec/0162_webhook_clock_highwater_marker.md`.
- **SHA-256 antes/depois:** `5a46ce6d814b49102be11ddadaa6ee1af9c0def017ddb42d2f6df006a316c538` / `5a46ce6d814b49102be11ddadaa6ee1af9c0def017ddb42d2f6df006a316c538` (inalterado).
- **Veredito:** `REVISE`; 0 P0, 0 P1, 2 P2 bloqueadores e 1 P3 informativo.
- **Escopo:** leitura de SPECs 0160/0161/0162 e evidências I12/I13; somente leitura sobre os insumos. Nenhum teste, SQL, migration, banco ou runtime foi executado. Esta crítica não autoriza BUILD nem produção.

## Fechamento dos achados I13

**P1 — `DECISION_COMMIT.decision_at` no high-water e ordenação concorrente: fechado documentalmente.** O máximo da epoch agora inclui `DECISION_COMMIT.decision_at`; a mesma decisão grava `decision_at` no marker e incrementa `guard_revision` atomicamente. O witness admite apenas um `ADMISSION_SLOT` pendente por epoch, bloqueando a próxima SAMPLE até receipt de decisão. Rollback depois de SAMPLE preserva a amostra por `SAMPLE_ABORTED` e exige reconciliação; `UNKNOWN_COMMIT` mantém slot/gate fechados até resolução por `operation_id`. A fórmula do máximo e a ordenação por cadeia witnessada tratam instantes numéricos fora de ordem sem reordenar a cadeia.

**P2 — I/O remoto enquanto o row lock SQL está retido: parcialmente fechado; permanece bloqueador.** Observer, witness, verifier/HSM, espera pelo slot, SAMPLE e seus receipts foram movidos para fora da transação de `authorize_and_reserve_or_lookup`; os fluxos de bootstrap e reconciliação também separam I/O externo das transações SQL. Porém, o protocolo HA exige `SET LOCAL synchronous_commit='remote_apply'` nas transações de autorização/finalização. A transação já adquiriu `FOR UPDATE` no singleton e conserva o lock até COMMIT; `remote_apply` aguarda a réplica síncrona aplicar WAL antes de concluir o COMMIT. Essa espera de rede acontece ainda na seção protegida. O teste de controle `FOR UPDATE NOWAIT` cobre atraso de receipts externos, não atraso da réplica. Portanto, a resposta I13 não satisfaz literalmente a regra de nenhum I/O remoto sob row lock.

## Bloqueadores

### P2-01 — `remote_apply` mantém o row lock durante espera da réplica

**Confiança:** alta. **Referências:** § Avanço e decisão (transação `FOR UPDATE`), § Segurança e operação / Failover e restore do PostgreSQL (`synchronous_commit='remote_apply'`) e Verificação exigida, itens 2 e 5.

O COMMIT protegido espera confirmação `remote_apply`; até a transação terminar, o singleton permanece bloqueado. Com latência/atraso da standby, admissions e a sessão de controle ficam serializadas pelo row lock, embora observer/witness/verifier não sejam chamados sob lock. O benchmark não elimina essa espera: sua topologia especifica 2 ms ±0,5 ms, mas também exige provar o comportamento dos locks e o limite de throughput.

**Resolução mínima:** usar COMMIT local durável para liberar os locks, e depois do COMMIT deixar observer/standby confirmar a fence WAL e `replay_lsn >= commit_fence_lsn` antes de `DECISION_COMMIT`, comando ou 2xx. Até essa confirmação, manter slot/gate fechados; resolver crash/failover como `UNKNOWN_COMMIT` com fencing do primary antigo e readback por `operation_id`. Aplicar a mesma regra a toda transação de autorização/finalização que retém row locks. Se o requisito pretendido excluir a replicação síncrona de “I/O remoto”, a SPEC precisa registrar explicitamente essa exceção e demonstrar seu limite de lock-wait; isso não fecha a formulação atual.

### P2-02 — slot sem prazo de expiração e cancelamento comprovável

**Confiança:** alta. **Referências:** § Estado durável, item 3 (slot e estados terminais), § Avanço e decisão, § Admissão de serving por lease limitado e Verificação exigida, itens 1, 2 e 5.

O protocolo define deadline de 1 s para a SAMPLE depois de `sampled_at` e lease de ingress de até 5 s, mas não define expiração/deadline próprio para o `ADMISSION_SLOT` desde sua emissão. Se a instância cair após obter o slot e antes de publicar SAMPLE, a única transição terminal declarada é `ADMISSION_SLOT_CANCELLED`, sem regra para quando ou como o witness prova que não há SAMPLE. Se a confirmação de SAMPLE se perder, timeout local não distingue ausência de append de ACK incerto. Cancelar sem prova pode descartar uma SAMPLE witnessada do high-water; nunca cancelar pode deixar o slot pendente e o serving da epoch bloqueado indefinidamente. “Slot vencido/incerto fecha o gate até resolução” não define essa resolução.

**Resolução mínima:** incluir no slot um deadline finito, monotônico e enforced pelo witness, limitado pelo lease ativo; definir transições atômicas one-use `PENDING -> SAMPLE_RECORDED` ou `PENDING -> CANCELLED`, seguidas por `SAMPLE_RECORDED -> DECISION_COMMIT` ou `SAMPLE_ABORTED`, e rejeitar SAMPLE atrasada depois do estado terminal. No ACK incerto, consultar a witness por `operation_id`/nonce/head: SAMPLE encontrada segue `SAMPLE_ABORTED` + reconciliação; ausência comprovada após deadline permite `ADMISSION_SLOT_CANCELLED`; se a witness não puder provar um dos estados, manter gate fechado. Fixar também se o limite de decisão de 1 s começa na chegada da request ou em `sampled_at`, incluindo a espera pelo slot no benchmark.

## Demais verificações

- **High-water e `UNKNOWN_COMMIT`:** SAMPLE testemunhada não é descartada por rollback; `SAMPLE_ABORTED.sampled_at` integra o máximo e `reconcile_guard` exige target exato, finito, não menor que marker/máximo e não posterior ao relógio saudável. COMMIT incerto fica sem comando/2xx até readback e receipt por `operation_id`; ausência comprovada exige abortar e reconciliar. Divergência, primary incerto ou target futuro mantêm ingress fechado.
- **`guard_revision`:** bootstrap inicia em 0; cada decisão serving e reconciliação incrementa uma vez; receipts/claims ligam epoch, revisões OLD/NEW, tuple, PID e txid; recovery inicia nova epoch em revisão 0 com claim one-use. Não encontrei caminho normal que permita regressão ou update direto por runtime.
- **Bootstrap/HA/break-glass:** a separação GENESIS/LEGACY_UPGRADE, drain, fence, revogação de chave e quiet window `2*T+1`, cadeia witnessada, promoção com fencing independente e rebase break-glass em duas fases são fail-closed e internamente coerentes no texto. Sua independência e funcionamento são requisitos de infraestrutura ainda não demonstrados. Sem histórico/retention suficientes, D-06 ou B3, não há reabertura automática.
- **Grants/transações:** as funções SECURITY DEFINER, owners distintos, RLS do inbox, trigger com claim one-use, revogação de EXECUTE de PUBLIC e separação de append/readback externo estão especificadas com detalhe. A observação P2-01 sobre `remote_apply` permanece na fronteira transacional.
- **Desempenho:** fila serial por epoch é **plausível, porém apertada; não foi medida**. Sustentar 64 req/s requer serviço médio do slot estritamente abaixo de 15,625 ms por decisão, incluindo emissão do slot, SAMPLE/attest, SQL/commit, receipt de decisão e fencing, além de cauda compatível com p99 ≤800 ms. Links de 2 ms ±0,5 ms não bastam para concluir viabilidade sem medir as viagens sequenciais e esperas de `remote_apply`. Os cinco runs open-loop e a barra de 1 s/zero perda definidos na SPEC são gates obrigatórios, não evidência de aprovação.
- **Contradição documental fora do candidato:** `docs/02_spec/0190_spec_validation.md` ainda descreve I11 como aceitação independente do hash antigo `c334…` e diz que a nova crítica já está satisfeita; isso diverge do estado I14 requerido na SPEC 0162. Classifico como **P3 informativo**, pois a própria SPEC atual mantém BUILD pausado e nova aprovação T3 pendente. Não alterei 0190, que está fora deste claim.
- **Markdown/protocolo:** não encontrei erro de estrutura Markdown nos textos lidos. Os estados de validade expirada, `SAMPLE_ABORTED`, reconciliação, `UNKNOWN_COMMIT`, bootstrap legado e break-glass são coerentes sob as ressalvas dos dois bloqueadores acima.

## Resultado

I13 P1 está fechado no desenho documental. I13 P2 não está totalmente fechado enquanto o COMMIT exigir `remote_apply` sob o lock, e o ciclo terminal do `ADMISSION_SLOT` ainda não pode recuperar-se com segurança de expiração/ACK incerto sem regra adicional. O veredito é **REVISE**. Corrigidos esses pontos, uma nova crítica hash-bound deve reavaliar a barra de carga; T3 humano continua necessário antes de BUILD sintético. Produção permanece `NO_GO`.
