# I17 — crítica independente fresh-context da SPEC 0162

- Data: 29/09/2026.
- Claim: `SPEC-PR301-WEBHOOK-CLOCK-I17-CRITIQUE-001`.
- Candidato: `docs/02_spec/0162_webhook_clock_highwater_marker.md`, SHA-256 `e2378a5b54b7453953f89fe35209766b247b55ea90cf6e59050fbc375f70b095` antes e depois da revisão.
- Inputs I16 vinculados: review `9d2e67191f6d2fdb303e87dcce53078b27bf35c22c20ef0d9963f31787552a8e`; proof `3534be56734461d3dc1593a64e76107d2710d004291ddee089924fc9b8ae2e4a`; response `ba5547ad747d6ee8e5d667ddb8f2871ea8d69f4e10d90a01009dde1ca6f20957`; response proof `0679df2f9c904dd612442407f07b4e49d4c1a547350d1c48319301339b692c03`.
- Veredito: **REVISE** — 0 P0, 0 P1, 1 P2. Confiança alta na lacuna documental; média no impacto operacional.
- Método: leitura documental completa da SPEC e dos quatro artefatos I16 vinculados. Nenhum teste, SQL, migration, banco, runtime, carga ou BUILD foi executado.

## Disposições I16

### I16 P2-01 — prova do relógio do worker

**Fechado documentalmente quanto à prova temporal.** A SPEC exige `worker_clock_bound` assinado por monitor aprovado no trust manifest, vincula worker/boot/generation/source/sequence, UTC estimado, BOOTTIME amostrado, incertezas e validade, fixa `F_worker` exato por perfil versionado até 100 ms, define `age` e `U_worker(age)`, e exige `age <= F_worker` e `utc_estimate + U_worker(age) < deadline_utc_lower`. Step, reboot, troca/perda de fonte, bound ausente/stale e identidade divergente falham fechados. A guarda final fica no limite do transporte, sem espera ou fila desprotegida; cliente com fila interna precisa repetir a guarda em dequeue/socket-write ou não pode ser habilitado (SPEC §§ Deadline/relógios e Prova temporal do worker; linhas 57–69). Os critérios negativos também cobrem fonte, freshness, geração e o ponto final de envio (linhas 186, 208).

Permanece o achado P2-01 abaixo sobre a semântica do dispatcher e o consumo do permit. A prova temporal e o bound em si estão descritos, mas falta especificar como o permit one-use e a elegibilidade persistida resultam em uma única tentativa de dispatch.

### I16 P2-02 — unicidade vitalícia do `operation_id`

**Fechado documentalmente.** Um issuer confiável registra atomicamente cada ID aleatório de 256 bits na registry append-only witnessada, de chave global única, antes de `ADMISSION_SLOT`; a registry sobrevive ao cleanup D-06 da linha SQL. Após cleanup, o ID retorna `RETIRED` e não pode criar SAMPLE, reserva, marker, outbox, dispatch ou 2xx. Registry ausente, indisponível, restaurada para trás ou com head/fork incerto mantém `UNKNOWN_COMMIT` e fecha serving; ACK incerto não autoriza emissão de outro ID (linha 45). O lifecycle SQL ainda exige receipt terminal e expiração dos attestations antes de cleanup (linhas 39 e 95). Não encontrei contradição documental que permita reuso após D-06.

## Achados

### P2-01 — estado de dispatch e consumo do `EFFECT_ENABLE` não estão fechados

Após persistir `EFFECT_ENABLE`, a SPEC move a outbox para `PENDING_WORKER_CLOCK_PROOF`, permite ao worker obter o registro para validação e declara que ele permanece “não-dispatchable” (linha 65). O fluxo serving também diz que persistir e ler de volta o permit torna a outbox “elegível à tentativa de dispatch” (linha 81). A regra de relógio define quando o transporte pode iniciar I/O (linha 69), mas não define a transição/claim de consumidor que encerra `PENDING_WORKER_CLOCK_PROOF` nem onde o permit one-use é consumido. Os critérios repetem o veto temporal, sem fixar essa semântica de estado/concor­rência (linhas 186, 202, 208).

As frases podem significar que o worker só pode obter o item para validar, permanecendo proibido de enviar até a guarda final. A SPEC, porém, não fixa essa interpretação nem explica como duas leituras concorrentes deixam de usar o mesmo `EFFECT_ENABLE` one-use. Isso impede concluir que a fronteira final está ligada a uma autorização única e torna incerta a recuperação do estado após falha/ACK incerto. Severity P2 porque uma ambiguidade na transição de autorização pode permitir dispatch concorrente ou impedir um dispatch válido; confiança alta na lacuna textual e média no impacto sem implementação observada.

Para fechar, defina os estados e a semântica de single-consumer do permit, inclusive concorrência, falha da guarda, deadline vencido, crash e ACK incerto. A claim/seleção do worker deve ocorrer antes da última verificação de relógio; a verificação fresca permanece a última operação antes do transporte, sem I/O de controle ou fila depois dela. Acrescente negativos para dois pollers concorrentes e para retomada após crash, preservando fail-closed.

## Limitações e gate

Crítica documental apenas. Nenhuma implementação, proteção de concorrência do dispatcher, persistência/consumo do permit, fonte de relógio ou limpeza D-06 foi executada ou observada. A política D-06, retenção real da witness, migração 0028, aprovação humana T3 e desempenho permanecem fora desta revisão. O parecer não autoriza BUILD/migration nem produção; produção segue `NO_GO`.
