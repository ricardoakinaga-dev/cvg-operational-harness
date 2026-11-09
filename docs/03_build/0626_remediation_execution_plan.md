# 0626 — Execução integral da remediação

## Objetivo e autoridade

Implementar e verificar o plano da [auditoria 0626](../04_audit/0626_full_functional_audit_2026-10-30.md), por pedido direto do usuário após a entrega do relatório. O relatório histórico permanece imutável. Esta carteira acompanha seus quinze apontamentos e três condições de qualificação; não substitui carteiras PISO/HISO nem os trabalhos AUD0625 em andamento.

O usuário autorizou implementar os reparos descritos no relatório. Não houve autorização de push, merge, deploy, dados reais ou produção. Mudanças novas de contrato, negócio, schema ou capacidade além daquele plano exigem a decisão aplicável, sem inventar aceite. ADR-010 mantém harness e produto separados; NO_MODEL permanece.

## Contexto e recuperação

Main publicada reconferida no início: `e92335c25e3e996f411dea2293babfbc6a72c61b`. Checkout compartilhado `ce23da17f` e mudanças dos pares preservados. Candidata privada: `/mnt/dados/cvg-work/aud0626-remediation/candidate`; runtime e logs no diretório pai. Dependências privadas copiadas da instalação exata auditada, Node 22.23.2, sem alteração de lock. Evidências históricas volumosas não são materializadas inicialmente; inputs necessários serão recuperados byte a byte do Git.

Ler antes de cada tarefa GBrain recente e claims; registrar conclusão por append idempotente e conferir readback. Nunca tratar ausência em busca degradada como ausência de implementação. Reconciliar fonte, review e aceite separadamente. Ledgers 99/20/30 modificados por pares recebem deltas no [handoff próprio](../08_runtime/handoffs/aud0626_remediation.md), conforme regra 5.

## Arquitetura e resultado esperado

Preservar fábrica pública, portas e decisões de policy. Cada resultado de modelo deve consumir orçamento uma vez; cada retry precisa admissão atual; cancelamento deve interromper esperas e subprocessos com semântica explícita de efeito incerto. Localização efetiva do provider deve ser compatível com classificação e perfil. Autorização de escrita deve considerar revogação no ponto transacional.

No produto, receipts pertencem à geração correta, novas partes exigem armazenamento saudável, correção não deixa tarefas obsoletas elegíveis e idempotência distingue repetição de conflito. Escritor e intenção de resposta durável devem respeitar contratos PISO e recuperação, sem ampliar capacidade clínica.

## Carteira e critérios de aceite

Status inicial de todos os itens: `PENDING_RECONCILIATION`, exceto QUAL-CLI-01 em `IN_PROGRESS`. A tabela preserva todo o escopo mesmo quando implementação concorrente já existir.

| Item        | Resultado exigido                                                       | Prova e dependências                                                                                       |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| RT-05       | Recusar composição local/provider externo incompatível com CONFIDENTIAL | Caso sintético e controles local/externo; gate de policy aplicável                                         |
| POLICY-001  | Revalidar identidade/revisão na autorização sob lock                    | Reconciliar SPEC0262 e dono; testes transacionais de revogação, sem retomar experimento bloqueado anterior |
| RT-01       | Contabilização única no single-pass                                     | Fábrica real, tokens/custo e limites exatos                                                                |
| RT-03       | Admissão de budget por tentativa de streaming                           | Falha parcial, ledger e controle com orçamento suficiente                                                  |
| RT-02       | Cancelamento/prazo encerram espera de log                               | Promise retida, abort e controles de sucesso/erro; revisar outras portas                                   |
| RT-04       | Cancelamento em voo interrompe subprocesso e classifica cleanup         | Reconciliar X01/X03; runner real e árvore, sem declarar perfil não qualificado                             |
| QUAL-CLI-01 | Fixture completa; C0 passa e C1–C32 recusam por razão específica        | Autoteste CLI original completo; preservar primeiro FAIL                                                   |
| PO-01       | Receipt antigo não altera nova geração                                  | Journal real sintético, adiar e receipt atrasado                                                           |
| PO-02       | Correção admitida suspende tarefas obsoletas                            | Fila bloqueada e recuperação, controles de revisão                                                         |
| PO-03       | Um escritor válido por armazenamento                                    | Instâncias e processos independentes; liberação e crash conforme contrato                                  |
| PO-04       | Resposta de comando recuperável sem repetir efeito                      | Intenção durável/outbox e crash entre checkpoints                                                          |
| PO-05       | Scheduler cumpre contrato de latência                                   | Decidir contrato existente e medir tempo/dispatch com relógio controlado                                   |
| PO-06       | Nenhuma parte nova após falha de armazenamento                          | Multipart, journal falho e controle saudável                                                               |
| PO-07       | ID divergente é conflito                                                | Método público e fronteira HTTP; repetição idêntica continua idempotente                                   |
| PO-08       | Especificação descreve composição atual                                 | Fonte e links; preservar afirmações compatíveis da ADR                                                     |
| Q01         | Isolamento positivo ou lacuna explicitamente não resolvida              | HISO-005/dono, fontes e dependências verificáveis; não converter UNKNOWN em PASS                           |
| Q02         | Alertas de scanner recebem disposição sustentada                        | Metadados atuais, alcance, controles de rotas; sem fechamento externo não autorizado                       |
| Q03         | Contrato de segurança/Verify coerente                                   | Logs brutos, verificador e casos negativos; não reduzir norma para produzir verde                          |

## Marcos e execução

1. Reconciliação: preservar relatório, registrar plano/contrato e matriz finding → dono → fonte atual → teste → integração. Saída: nenhuma omissão dos dezoito itens.
2. Certificador: corrigir fixture transitiva sem relaxar recusas, executar autoteste completo. Saída: controle válido e todos os controles negativos corretos.
3. Núcleo: corrigir itens disponíveis e reconciliar reparos concorrentes. Saída: regressões pela fábrica/gateway/sandbox, revisão independente e gates pertinentes.
4. Produto: implementar reparos respeitando PISO/contratos. Saída: testes de journal, geração, falha, idempotência, concorrência e recuperação.
5. Qualificação: isolamento, scanner e Verify; executar gates completos disponíveis no candidato integrado. Saída: evidência atual por requisito, limitações honestas, nenhuma conclusão baseada apenas em parecer ou teste parcial.
6. Documentação e entrega: reconciliar runtime/log/backlog com holder, artefatos, mapa de conclusão e GBrain. Produção continua NO_GO sem sua autoridade própria.

## Passos concretos

`active_action_id: AUD0626:GLOBAL_QUALIFICATION`

1. AUD0626:QUAL-CLI-01 — conferir fonte exata, executar o autoteste anterior, incluir dependência transitiva faltante e executar os mesmos 43 controles; preservar ambos os resultados.
2. Reconciliar implementações concorrentes e suas autoridades para RT/POLICY/PO/Q, antes de assumir qualquer caminho reservado.
3. Detalhar a próxima tarefa implementável no contrato, fazer regressão e reparo, revisar, verificar e integrar apenas bytes próprios.

## Validação e definição de pronto

Cada tarefa tem evidência de fonte, comando, exit, denominador e limitações. Regressões devem falhar antes do reparo quando aplicável e passar depois; controles positivos e negativos preservados. Resultados de pares são identificados como tais, não execução própria. Não somar suítes sobrepostas. Node 22, tipos/lint/testes, PostgreSQL/E2E e cobertura conforme trilha; claim específico antes de recursos globais. Certify exige condição concorrente da regra 6; indisponibilidade não vira certificado.

Objetivo completo somente quando todos os dezoito itens tiverem implementação/disposição válida, integração e evidência apropriada, documentação coerente e registros GBrain confirmados. Encaminhar uma lacuna a outro agente não conta como concluí-la. Decisões externas indisponíveis permanecem abertas.

## Progresso e descobertas

- 30/10/2026: relatório e pacote auditados já existem; reconferidos fonte publicada, GBrain e claims. Meta de implementação ativa. Plano e contrato escritos antes do código; ledgers de pares preservados.
- QUAL-CLI-01 implementado na candidata: reprodução atual 10 helpers PASS/33 CLI FAIL; uma linha de fixture; após correção 43 controles PASS/0 FAIL, regressões 28 PASS/0 skip, formato/typecheck PASS. Revisão independente em andamento; integração e qualificação global pendentes. GBrain conclusão de BUILD confirmada em readback na entrada 1310153.

## Riscos e continuidade

Branches AUD0625 contêm reparos em evolução; não transportar apenas rótulos de aprovação nem sobrescrever seus donos. A candidata isolada evita colisão de arquivos, mas integração exige reconciliar os deltas. O probe de revogação bloqueado anteriormente não será retomado; trabalho defensivo deverá respeitar as restrições atuais. Nenhum dado real ou efeito externo é necessário para os reparos locais.

Após interrupção, ler este plano, o contrato, o handoff e a matriz local antes de executar qualquer comando. Conferir processo pelo handle real; não reiniciar por timeout de observação. Manter falhas históricas e não alterar a baseline auditada.

## Checkpoint de implementação — 31/10 UTC, 30/10 local

- QUAL-CLI-01: fixture43PASS/28regressões/typeslintPASS e Halley APPROVE_SCOPED. Subcritério diagnóstico implementado depois em revisão distinta: stderr≤8192caracteres/error/signal/flag; controle de setup10helpersPASS33CLIFAILesperados comrawpreservado; normal43PASS. Aprovação anterior permanece restrita à fixture, sem presumir revisão da extensão.
- RT03/RT05: primeira fonte final305PASS17arquivos/typeslint/formatoPASS; TuringR1 CHANGES_REQUESTED por HALF_OPEN ocupado após recusa. Duas novas regressões reproduziram6PASS2assertRED; reparo libera aquisição não iniciada sem atribuir sucesso/falha ao provider, suíte atual em execução. Parecer e primeira fonte preservados.
- RT01: primeira regressão2PASS3assertRED; removidas duas linhas de contagem duplicada. Fixture existente exigia segunda contabilização, corrigida para única + assert contador1; final56PASS/6arquivos, Ramanujan APPROVE_SCOPED/zero obrigatórios. Cobertura/gates integrados pendentes.
- PO06/07: worker privado implementou storage/efeitos por parte e conflito atéHTTP409.13GREEN+118regressõesPASS, um testeauthantesdesselecionado. Fontes congeladas; revisão Descartes e produto completo em andamento. Readbackworker1329659.
- PO08: documento da candidata corrigido para gateway.generate, NO_MODEL/D2/PISO preservados. Formato/linksPASS;17inputsGitmaterializados apóssetupinicialfalho. GBrain1323121 confirmado.
- Restantes RT02,RT04,POLICY001,PO01–05,Q01–03 continuam abertos; nenhuma integração na main/sharedsrc,commit,push,deploy ou aceite de produção. O objetivo integral permanece ACTIVE.

## Validação corrente

O [relatório de remediação](../04_audit/0626_remediation_validation_2026-10-31.md) acompanha resultados atuais e negativos preservados. O estado inicial deste plano é histórico; carteira JSON e handoff registram andamento. A alteração posterior do lockfile foi somente metadado da dependência de teste Sandbox→orchestrator, sob claim próprio, sem instalação/resolução. Nenhum commit ou integração final é presumido. Objetivo permanece ativo até os 18 itens e a qualificação apropriada.

## Congelamento final de implementação — 2026-10-31T10:33:47.968846+00:00

Todas as correções de código concluídas e congeladas. Revisão independente final do núcleo1546427 aprovou escopo (1672PASS/127, oito alvos100%); produto1542914 aprovou407PASS/30 e reparos de prazo/permissões. Qualificação integrada e commit local registrados em `docs/04_audit/evidence/AUD0626-REMEDIATION/FINAL_REPORT.md`, fonte dinâmica final para esta rodada. ZERO_ALL10moderadas sem waiver, HISO005 e provedor/host de produção permanecem sem aceite. Sem push/merge/deploy; raiz99/20/30 de pares preservada. Checkpoints anteriores são históricos, não status corrente.
