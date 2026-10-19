# Revisão R2 final — HOW da sonda keyless

**APPROVE_BOUNDED_HOW.** Os sete achados materiais da R1 estão resolvidos no desenho congelado; não restam bloqueadores materiais neste recorte. Esta é a segunda e última rodada, com as mesmas doze condições e nenhum agente novo.

O aceite vale somente para o HOW. Não comprova runtime, produz recibo funcional, encerra G02 ou aprova SPEC/release. Nenhum helper/ELF foi executado ou importado, e nenhum alvo/CLI/scope/provider/gate/descendente foi iniciado, consultado ou controlado pelo crítico. A CLI387a/session75896 permaneceu intocada. Seu estado vivo e a transferência do cache são contexto autorizado do usuário/Lead, não nova constatação deste parecer.

Os cinco inputs conferem com `task.json`; os oito controles/verificadores conferem com o contrato, assim como as oito fontes. As três cópias antigas em `review-r1/frozen-inputs/*.txt` coincidem com os hashes R1; os dois relatórios R1 também estão intactos. A validação foi leitura de texto, AST parse-only e SHA/tamanho antes/depois. A análise dos caminhos de execução abaixo não é resultado de testes ou sondas.

## C01 — Atestado real anterior ao ELF; identidade e cadeia vinculadas

O runner bloqueia enquanto review-status estiver pendente, confere os quatro controles executados contra os hashes aceitos e os oito controles vinculados antes do verificador. Exige attempt/unit release-387a2e8a4c, terminal0/noabort, pin da provenance, SHA do contrato-base, SHA do registro terminal e ELF regular com tamanho/hash exatos. verify-build reconstitui eventos Cargo, perfil original, features e bytes, vincula o storage-recovery autenticado e verifica inputs e encerramento. A substituição explícita de 9149 por 387a foi autorizada pelo usuário nesta rodada; não é troca silenciosa. Nenhum atestado real foi executado pelo crítico.

**Evidência estática:** `run.py:72-94`; `contract.json:expected_build/executable_control_inputs`; `../reference-compilation/verify-build.py:20-74,79-94`.

## C02 — Namespace offline e limites kernel

Guard confiável lê cgroup real antes do outer bwrap e fixa 4GiB/CPU2/256tasks/0swap; scope tem prazo180s e monitor externo. Outer e inner usam unshare-all/clearenv/cap-drop; guardas leem namespaces/interfaces/rotas/mounts. Isso sustenta o desenho fail-closed; funcionamento do segundo bwrap e limites efetivos continuam sem medição nesta revisão.

**Evidência estática:** `run.py:120-147`; `driver.py:36-76`; `target-guard.py:9-29`.

## C03 — Inputs RO, controle físico fora do RW, ambiente e passwd sintéticos

Control é irmão de work; ELF/native/control/usr são montados RO. Home privada, passwd/group sintéticos e ambiente enumerado sem HOME/CODEX_HOME são mantidos. O inner só recebe a home própria como bind RW, tmpfs próprio e os dispositivos mínimos de bwrap. /work e paths pessoais são explicitamente ausentes. A resolução efetiva de home ainda será observação futura, não fato atestado pelo crítico.

**Evidência estática:** `run.py:101-115,129-143`; `driver.py:36-76`; `target-guard.py:9-23`.

## C04 — Coletor externo; provas e binários fora do alcance gravável do ELF

Cada Capture inicia um segundo bwrap/PID namespace. O ELF não recebe /work nem vê processos do coletor externo no procfs interno. Logs são abertos pelo coletor antes de spawn; close_fds=True e PIPE para stdin/stdout/stderr evitam herdar FDs de arquivo do coletor. Guard inner confiável emite a primeira linha stderr e só depois faz execv do argv permitido; o coletor valida esse prefixo preservado em bytes. A prova kernel fica no primeiro prefixo do supervisor, inacessível ao ELF. Um JSON/log fabricado na home do alvo não substitui provas/observações no output externo. A existência dos JSON no runner passa a ser condição secundária, junto ao exit0 do driver que valida os dados confiáveis; não é o único oráculo.

**Evidência estática:** `driver.py:36-49,79-105,107-128,183-202`; `target-guard.py:9-35`; `run.py:120-143,165-166,200-207,249-291`.

## C05 — Pedidos finitos keyless e hipóteses de fonte

Permanecem quatro argv permitidos, seis requests e nove observações delimitadas. Sem pedido de modelo/tool/exec/login/attestation; explicitGatewayOauth=true, experimentalApi=false e requestAttestation=false. Fontes pinadas sustentam os envelopes/erros previstos e o ramo de login explícito. Nenhuma afirmação de ausência runtime de atividade de startup, histórico vazio ou comportamento de provider é concedida; isolamento offline e ausência de credenciais continuam exigências antes do ELF.

**Evidência estática:** `driver.py:227-280`; `target-guard.py:24-35`; `source:rpc.rs:1-22`; `source:protocol/v1.rs:27-82`; `source:initialize_processor.rs:71-103,153-164,213-225`; `source:message_processor.rs:112-116,949-984,1493-1494`.

## C06 — IDs/envelopes globais até EOF e erro unknown exato

validate_frames percorre todas as mensagens após EOF, exige um único ID conhecido com tipo exato, rejeita duplicatas tardias/IDs extras/requests com method e exige result XOR error. Erros usam code int estrito; notificações sem ID têm forma explícita. unknown exige -32600 e causa Invalid request contendo o método sintético. Isso resolve os contraexemplos da R1 sem transformar o recorte em conformidade RPC/i64 geral.

**Evidência estática:** `driver.py:120-144,204-220,246-280`; `source:message_processor.rs:112-116`; `source:error_code.rs:3-19`.

## C07 — Prazo total e janela de EOF

finish(15, parse=True, total=75) calcula min(started+75, now+15); os básicos mantêm 15s e os requests min(started+75, now+20). A troca de 16s já não expira por started+15. Frame final incompleto, timeout e exit não-zero continuam falhas. Encerramento real e tempos de execução não foram medidos.

**Evidência estática:** `driver.py:139-152,227-235,269-275`.

## C08 — Consulta de scope com rc/LoadState e cgroup vazio/removido

inspect_scope exige returncode0 e estados explícitos, confere ControlGroup com o caminho do guard e requer inactive/failed junto a populated=0 ou cgroup removido. Sem group conhecido, cleanup_verified é falso. Erros produzem causa/UNKNOWN, kill é limitado ao scope UUID próprio e seu resultado é registrado; fallback usa só o grupo do subprocesso criado. Há nova inspeção final e proibição de copiar dados com cleanup desconhecido. verify-build também verifica rc/LoadState e cgroup vazio ou ausente; não aceita stdout vazio como inatividade. Nenhuma consulta/kill foi realizada pelo crítico.

**Evidência estática:** `run.py:44-68,198-246,249-254,288-291`; `../reference-compilation/verify-build.py:64-73`; `driver.py:154-175`.

## C09 — Primeira causa, unwind parcial e erros secundários

Logs abrem antes do filho e o try do construtor inclui spawn/configuração dos pipes; erro parcial chama first_failure e close. Falha de caso é persistida antes do finally. FIRST só é definido uma vez, erros de cleanup/persistência viram SECONDARY e assert final impede observations de sucesso quando cleanup falhou. O supervisor mantém cause/secondary, grava a causa antes de encerrar e trata falhas de query/kill/wait/cópia/journal. Se o próprio armazenamento de evidências falhar, a execução não ganha sucesso; isso não constitui garantia de persistência sob perda física de I/O.

**Evidência estática:** `driver.py:23-33,79-105,154-193,236-240,281-298`; `run.py:164-197,213-246,270-288`.

## C10 — Storage final e preservação bounded

storage configura onerror e só tolera ENOENT. Após cleanup, há amostra terminal <=512MiB, reserva livre >=6GB+final_storage e requisito de cgroup comprovadamente vazio. Cópia de work e control acumula preserved_bytes com teto512MiB, e falhas registram causa sem aceitar sucesso. O monitor permanece periódico; tmpfs/memória e overhead do filesystem não são apresentados como quota512MiB do kernel. Journaling/finalização também têm timeout e falha bloqueante.

**Evidência estática:** `run.py:28-41,169-173,247-275`.

## C11 — Captura binária real, caps e EOF parcial

O produtor previsto continua sendo o ELF exato, sem fixture/mock. Coletor externo lê os.read, persiste bytes, mantém tamanho/SHA e inclui a prova inner real; há cap8MiB agregado stdout+stderr após cada chunk de até65536 bytes. Dados são preservados depois de cleanup comprovado. Nenhum transcript real foi produzido ou validado nesta revisão.

**Evidência estática:** `driver.py:79-152,183-202`; `run.py:165-174,255-269`.

## C12 — Separação HOW/runtime; sem receipt ou fechamento G02

APPROVE_BOUNDED_HOW aprova somente o desenho congelado. review-status segue REVISE_PENDING_R2 neste freeze e bloqueia execução. O Lead poderá registrar o aceite no formato APPROVED_BOUNDED_HOW esperado pelo runner e os hashes exatos dos quatro controles, sem mudar código/contrato revisados. O mesmo387a vivo ainda precisa terminar0 sem abort e receber atestado real antes de qualquer ELF. Zero receipts, nenhuma equivalência funcional, SPEC/release ou closureG02; orçamento de revisão esgotado.

**Evidência estática:** `contract.json:functional_parity_receipts/full_G01_G02_closure`; `review-status.json:1-5`; `run.py:72-94`; `driver.py:286-289`.

## Limites de aceite e passagem ao Lead

O coletor deixou de compartilhar seus arquivos graváveis com o ELF. O segundo namespace contém apenas o alvo, a home privada e os inputs RO; stdout/stderr são pipes e a primeira prova inner precede exec. Os checks de ID/envelope cobrem todos os frames até EOF; o prazo stdio já usa total75s/janela15s. Cleanup precisa de consulta válida e cgroup vazio/removido, e UNKNOWN impede sucesso/cópia. Primeira causa e erros secundários estão separados; storage e cópia têm verificações finais e teto explícito.

O conjunto segue sendo uma sonda de nove observações, não um teste de todo RPC/SDK/i64/plataformas ou uma qualificação adversarial geral. Notificações são classificadas por forma, sem converter isso em aceitação semântica de todo método. O cap de bytes é verificado após cada chunk; o storage é monitor periódico, sem quota kernel prometida. Falha física de escrita não recebe garantia impossível de persistência, mas não concede sucesso.

`review-status.json` ainda está pendente e o runner recusa executar. O Lead poderá registrar `APPROVED_BOUNDED_HOW` (literal esperado pelo runner) e os quatro SHA de controles aceitos. Essa selagem não altera o veredito literal `APPROVE_BOUNDED_HOW` deste parecer nem autoriza editar o código revisado. Após isso, a pré-condição real continua obrigatória: o mesmo release387a/unit terminal0 sem abort, atestado real e validação da cadeia/pin/ELF/registro terminal antes de qualquer alvo. Guardas, EOF, cleanup e limites ainda exigem evidência real na execução futura.

Nenhuma terceira revisão automática está disponível neste orçamento. Deltas dos ledgers e continuidade pertencem ao Lead; este crítico só escreve os dois artefatos R2.

## Hashes congelados

- `contract.json`: `312d30a59461789a7f85e68225d4b56d67bf07eeddbcee7cbf226efd272fff2f` (7999 bytes).
- `driver.py`: `0e8b34e1dae7174299a7deca03132bfb276ee7278e5d1283855d541b02c5d07e` (14459 bytes).
- `run.py`: `d33009ba52576efdeb34f85947ae8af81c38ef9d024dd1e4e8f8399938395b10` (16447 bytes).
- `target-guard.py`: `4235079052378cbad552d267bcca66facf296e2fc955349d22da81c738eafb90` (1621 bytes).
- `review-status.json`: `29b0a0c932be273f62263882eef61f86cb38491bd77b54e706d11f3020e6ff38` (155 bytes).
- `review-r2/task.json`: `ab464ddb87dca540faf7724c19616638ce820d81b60a13224d22ea483097c314`.
- Manifesto canônico 5 inputs + 8 controles + 8 fontes: `284f6613b96c8741b9e8aba94999ef62cd8814250ad8481da1a0d21c0192f73a`.

Os hashes individuais dos oito controles e das oito fontes, o confronto das cópias R1 e os limites de validação constam em `review.json`. Fonte e proposta continuam distintas de runtime comprovado.
