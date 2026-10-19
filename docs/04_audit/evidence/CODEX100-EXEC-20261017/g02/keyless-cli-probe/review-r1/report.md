# Revisão R1 do HOW da sonda keyless

**REVISE — 3 achados P1 e 4 P2.** A revisão é exclusivamente estática. Não há recibo funcional, prova de runtime ou fechamento G02.

O claim delegado já consta em `docs/08_runtime/agent_coordination.md`, seção CODEX100-EXEC-20261017. Foram lidas a constituição, as regras de coordenação e a continuidade vigente dos ledgers. Só estes dois artefatos de revisão são escritos; deltas de continuidade ficam para o Lead.

Os três inputs coincidem em tamanho/SHA com `task.json`; as oito fontes coincidem com o contrato. `driver.py` e `run.py` foram apenas analisados por AST. A dependência `../reference-compilation/verify-build.py` foi lida para rastrear a pré-condição, sem execução. Seus verificadores transitivos não foram integralmente auditados.

Não executei nem importei helpers, ELF, Cargo, CVG ou testes; não usei rede/provider/PG/Docker/gates/lock, descendentes nem controle de scopes/jobs. A CLI9149 ficou intocada. Seu estado vivo vem do contexto do Lead, sem nova medição deste crítico. Os contraexemplos abaixo são deduções dos ramos do código, sem execução de payloads.

| Condição                                                                | Resultado estático                    |
| ----------------------------------------------------------------------- | ------------------------------------- |
| C01 — Atestado anterior ao ELF e identidade do mesmo build              | REVISE P1                             |
| C02 — Namespace offline e limites kernel                                | Plano delimitado; runtime não provado |
| C03 — Inputs readonly, controle fora do RW, clearenv e passwd sintético | Plano delimitado; runtime não provado |
| C04 — Integridade da evidência e relatórios fabricados                  | REVISE P1                             |
| C05 — Pedidos finitos keyless e hipóteses das fontes                    | Plano delimitado; runtime não provado |
| C06 — Oráculo de frames e erro de método desconhecido                   | REVISE P2                             |
| C07 — Prazo total e EOF                                                 | REVISE P2                             |
| C08 — Cancelamento e comprovação de cleanup                             | REVISE P1                             |
| C09 — Preservação da primeira falha e recursos parcialmente criados     | REVISE P2                             |
| C10 — Storage monitorado no término e cópia                             | REVISE P2                             |
| C11 — Captura binária real, caps e EOF parcial                          | Plano delimitado; runtime não provado |
| C12 — Não conceder receipt funcional ou fechamento G02                  | Plano delimitado; runtime não provado |

## C01 — P1 — Atestado anterior ao ELF e identidade do mesmo build

O runner verifica terminal0/noabort e chama um verificador real, mas não compara provenance.pin ao pin deste contrato nem fixa attempt/unit do build CLI9149. O verificador lê outro contract.json e o live.json corrente; seu código e verificadores transitivos não estão vinculados por hash no contrato da sonda. Um live/provenance de outro build terminal coerente com o contrato de compilação satisfaz esses checks, mesmo sem ser a identidade prometida pela sonda.

**Evidência:** `run.py:41-53`; `contract.json:6-10`; `../reference-compilation/verify-build.py:20-24,49-59,79-81`.

**Correção mínima:** Fixar a identidade esperada attempt/unit da CLI9149; comparar live e provenance com ela e provenance.pin com c.pin antes de qualquer ELF. Vincular por hash o verificador invocado e sua cadeia de controle executável; carregar/conferir os bytes congelados do contrato/driver/runner usados na tentativa.

**Critério de reavaliação:** Leitura estática deve mostrar rejeição anterior ao ELF para pin, attempt, unit ou helper divergente; manter o bloqueio até o mesmo build terminal0 realmente atestado.

## C04 — P1 — Integridade da evidência e relatórios fabricados

O bind RW /work expõe ao ELF namespace-proof.json, logs binários, capture.json, requests.json, attempt.json e os logs do supervisor. Um comando posterior pode reescrever a prova ou o log de um comando já encerrado. O runner copia esses arquivos sem revalidar hashes/conteúdo, aceita a mera existência de dois JSON e procura o marcador kernel em log que o alvo pode truncar/forjar. Um JSON de namespace substituído por {} e um log antigo alterado não impedem o caminho de sucesso se os checks em memória restantes terminarem normalmente.

**Evidência:** `run.py:97,113,122,151-173`; `driver.py:13-18,41-44,55-56,126-132,189-191`.

**Correção mínima:** Retirar as evidências autoritativas dos mounts RW do ELF; coletar os fluxos binários e as provas no supervisor externo, com descritores do coletor não expostos ao alvo. Derivar e verificar conteúdo/hashes/casos dos bytes confiáveis, tratando arquivos produzidos em /work apenas como dados do alvo.

**Critério de reavaliação:** Revisão do caminho de dados deve demonstrar que alterar/criar proof, capture, observations ou logs em /work não consegue satisfazer nem modificar a evidência de sucesso; existência de arquivo/substring não pode ser o oráculo.

## C06 — P2 — Oráculo de frames e erro de método desconhecido

A unicidade é verificada somente para response_id da espera atual. Uma segunda resposta de initialize emitida durante outra espera ou no drain de EOF não é rejeitada. Não há validação final de IDs/envelopes result XOR error nem distinção global de requests do servidor. O caso unknown aceita qualquer int (inclusive bool no Python), portanto um erro de sobrecarga/interno também vira OBSERVED; a desserialização pinada prevê invalid_request (-32600).

**Evidência:** `driver.py:79-96,154-183`; `source:message_processor.rs:112-116,672-689`; `source:error_code.rs:3-19`; `source:rpc.rs:72-86`.

**Correção mínima:** Validar todos os frames até EOF: exatamente uma resposta por ID enviado, tipos de ID corretos, result XOR error e classificação explícita de notificações/requests inesperados, sem responder a pedidos não autorizados. Para unknown, validar o erro -32600 previsto e sua causa de método inválido, preservando divergências como falha.

**Critério de reavaliação:** Leitura deve mostrar que duplicata tardia, ID desconhecido, envelope ambíguo ou unknown com -32001/-32603 não pode chegar a observação aceita.

## C07 — P2 — Prazo total e EOF

Após seis requests limitados por started+75, finish(15) usa min(started+15, now+15). Uma troca válida que leve 16s já entra no drain final com deadline vencido e falha imediatamente; não recebe a janela de EOF prevista dentro do prazo total de 75s.

**Evidência:** `driver.py:103,105-110,180`; `contract.json:66-70`.

**Correção mínima:** Separar deadline total da captura e janela de EOF. Para stdio usar min(started+75, now+15); manter 15s totais nos comandos básicos, sem relaxar caps ou aceitar encerramento forçado como sucesso.

**Critério de reavaliação:** A aritmética deve permitir EOF limpo depois de uma troca entre 15s e 75s, ainda rejeitando total acima de 75s ou EOF além da janela restante.

## C08 — P1 — Cancelamento e comprovação de cleanup

systemctl show é lido apenas por stdout; returncode/stderr são descartados e string vazia conta como inactive, inclusive em erro de DBus/permissão. O mesmo padrão está no atestado de build. Kill também ignora falha e não há comprovação de cgroup vazio. Timeout/erro em show ou wait pode interromper o finally antes de concluir cleanup e persistir o terminal. Capture.close considera apenas o PID principal ao decidir matar o grupo.

**Evidência:** `run.py:132-150`; `../reference-compilation/verify-build.py:60-61`; `driver.py:113-122`.

**Correção mínima:** Distinguir consulta válida, unidade recolhida e erro de consulta; falha de inspeção nunca prova inatividade. No supervisor proprietário, verificar término e ausência de tarefas no cgroup exato, conferir kill e manter fallback limitado ao scope próprio. Proteger cleanup contra suas próprias exceções e registrar estado desconhecido como falha.

**Critério de reavaliação:** Ramos de erro de show/kill/wait não podem produzir scope_now vazio aceito nem suprimir a verificação do recurso próprio; nenhum recurso de outro owner é consultado/controlado pelo crítico.

## C09 — P2 — Preservação da primeira falha e recursos parcialmente criados

Popen precede a abertura exclusiva dos logs e a instalação completa do Capture, fora do try do chamador. Uma falha de abertura deixa o filho sem close local. Uma exceção de kill/write no finally de Capture.close substitui a falha original, que só é escrita pelo handler externo depois desse finally; falhas de finalização do runner também podem impedir a gravação de cause e terminal.

**Evidência:** `driver.py:49-64,113-132,142-148,187-200`; `run.py:132-168`.

**Correção mínima:** Abrir/validar recursos antes de spawn ou garantir unwind desde o primeiro filho criado. Persistir a primeira causa em canal confiável antes do cleanup; capturar erros secundários de cleanup/cópia/gravação separadamente, sem trocar a causa nem abandonar o encerramento.

**Critério de reavaliação:** Análise dos ramos de falha deve preservar a causa inicial quando fechamento/kill/cópia falha e não deixar filho sem responsabilidade explícita após erro parcial no construtor.

## C10 — P2 — Storage monitorado no término e cópia

As amostras de storage/free disk só ocorrem enquanto proc.poll() é None. Se o alvo exceder o limite e encerrar entre duas amostras, o runner pula a última verificação e pode aceitar o exit0, depois duplica todo work em raw sem orçamento de cópia. os.walk também não configura onerror, podendo omitir subárvore ilegível sem falhar.

**Evidência:** `run.py:27-37,126-131,151-166`; `contract.json:73-75,90`.

**Correção mínima:** Fazer verificação final após cleanup e antes de aceitar/copiar; falhar em erro de travessia salvo o ENOENT explicitamente permitido. Limitar/contabilizar a cópia e a reserva livre para não expandir indefinidamente a evidência após o monitor terminar; registrar ultrapassagem sem eliminar a primeira falha.

**Critério de reavaliação:** O caminho terminal não pode aceitar storage final acima de 512MiB nem ignorar erro de travessia; a preservação deve respeitar um orçamento explícito. Continua sendo monitor periódico, sem alegação de quota kernel.

## O que o desenho já sustenta

O atestado não é apenas uma flag inventada: o verificador previsto reconstrói eventos Cargo, header/hash/tamanho ELF, perfil, source pin e inputs, sem executar o ELF. Isso merece crédito, mas ainda depende do vínculo de identidade C01 e da consulta de encerramento C08. Nenhum atestado foi produzido ou revalidado nesta revisão.

O plano coloca o controle como irmão físico de work e monta controle/ELF/native/usr readonly; limpa o ambiente, usa passwd/group sintéticos, home privada e verifica ausência de credenciais antes do ELF. Há guardas programadas de namespaces, rede e limites reais do kernel. São caminhos de código inspecionados, sem comprovação física/runtime por este crítico.

As seis mensagens do driver são finitas. As fontes pinadas sustentam IDs string/integer, ausência de jsonrpc, campos de initialize e erros de inicialização; explicitGatewayOauth=true toma o ramo de login explícito. `thread/list` despacha para o processador, mas histórico vazio e ausência efetiva de efeitos no startup não foram medidos. Não há pedido explícito de modelo/tool/exec/login/attestation no driver. Fonte prevista não equivale a runtime comprovado.

A captura usa pipes reais e bytes, não mocks. Cap de 8MiB agregado por captura é verificado após chunk de até 65536 bytes; existe rejeição de frame final incompleto. Os JSON finais, porém, não substituem bytes confiáveis nem consertam C04/C06-C10.

## Freeze e continuidade

- `contract.json`: `6dd024e0708f3ef6a3b4bbcf2e1223cc87d0f3170433a93d7b9bdaeedb8fb822` (4936 bytes).
- `driver.py`: `66e7c3c57541b23fc92e636de8107c2736ac9ae4731df26afa2aa8be56bbbff0` (9607 bytes).
- `run.py`: `796d17980fc5c807105bffff2f6eb2a4c3035e320e6e5395e781e932c7c9db9d` (9927 bytes).
- `task.json`: `7dff095b0028f5e3873c0d5b7efa6da70c780d6cf18ee8e483ce9429a816631c`.
- Manifesto canônico dos 3 inputs + 8 fontes: `ad4eb55dd2311df748eb846e4f0a52a8bfaeb6d3d34721934677950860d4d768`.
- `verify-build.py` lido adicionalmente: `bed62b59928b5ebc7305cb4f36f5459d6e53c0a098603aa6e0510420bb25ea96`.

Os SHA das oito fontes e os detalhes por condição constam em `review.json`. Os hashes foram conferidos novamente antes de escrever estes artefatos; nenhum input foi alterado pelo crítico.

Próxima ação: Lead corrigir as sete condições REVISE e congelar nova candidata para a única rodada restante (limite de duas revisões no total, doze condições). Não iniciar a sonda por este parecer. A execução futura exige HOW aceito e atestado real do mesmo build terminal0; a CLI9149 viva continua intocável. Contrato/artefatos de revisão não são approval funcional, SPEC, release ou fechamento G02. Deltas para os ledgers compartilhados ficam com o Lead.
