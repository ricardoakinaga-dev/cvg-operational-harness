# 0381 — Plano executivo de paridade funcional com Claude Code

Data: 17/10/2026. Programa `CLAUDE100`. Task documental `CLAUDE100-PLAN-20261017`. Direção do usuário: criar plano executivo, roadmap e backlog para parear **100% das funcionalidades identificadas na análise 0618** com o Operational Harness.

Estado: `PROPOSED_FOR_EXECUTION`. A criação do planejamento está autorizada; o pedido não é aprovação das SPECs, de BUILD T3/T4, de contas externas ou de release. [Roadmap 0382](0382_roadmap_paridade_claude_code.md), [backlog 0383](0383_backlog_paridade_claude_code.md), [catálogo Claude-CAP v1](tracking/claude100_catalog_v1.json) e [evidências do planejamento](../04_audit/evidence/CLAUDE100-PLAN-20261017/README.md).

## Resultado pretendido

Entregar as 16 famílias CC18-01–16 da [análise 0618](../04_audit/0618_claude_code_capabilities_2026-10-17.md), com resultado observável equivalente ao Claude Code de referência e execução pelos controles do CVG. Inclui recursos inicialmente classificados P3: cloud, controle remoto, IDE/desktop, gateway corporativo e rewind. Prioridade define ordem, não exclusão do alvo.

O resultado precisa funcionar por interfaces públicas de hosts/SDKs/adapters e ser demonstrado na candidata identificada. Possuir classe, flag, stub, documentação, mock ou referência a um cartão PAR não demonstra capacidade entregue. O núcleo continua reutilizável, e consumidores mantêm domínio, dados e deploy próprios conforme [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md).

## Fronteira exata dos 100%

O catálogo inicial revisado contém **134 requisitos obrigatórios em 16 famílias: 117 resultados funcionais comparáveis e 17 controles adicionais do CVG**. Este é um catálogo inicial de planejamento, com validação funcional da referência ainda pendente; C100-G01/G02 devem conferir a completude e expandir variantes antes de congelar o oráculo. Ele não é um inventário completo de todo o produto Claude Code, seus modelos, planos comerciais, sistemas internos, marketplaces ou futuras versões.

A revisão documental `draft-r2` distingue os dois contratos de prova: comparar resultados funcionais com o Claude e verificar controles CVG na SPEC aprovada. Não se exige que o Claude exponha mecanismos internos propostos pelo CVG, como settlement persistente ou hashes de promoção. Todos continuam obrigatórios para concluir. Nenhum ID anterior foi removido; consulta/exportação/retenção foram decompostas, com donos corretos. O catálogo registra a revisão, e a versão anterior foi preservada nas evidências.

O alvo permanece 100% das **16 famílias extraídas**, não apenas das primeiras entregas ou do subconjunto barato. O usuário solicitou todas essas funcionalidades; nenhuma será marcada N/A, adiada para fora do denominador ou contada parcialmente pelo agente. Campo não observado é pendência de pesquisa, não licença para inventar equivalência.

Cada família deve ser confrontada com todos os comportamentos e variantes que suas fontes confirmarem: evento × handler × escopo para hooks; transporte × autenticação para MCP; modo × canal para permissões/streaming; estado × transição para sessão, job e restore. Descobrir uma variante necessária cria requisito versionado antes da implementação correspondente. O denominador pode aumentar na validação; não se reduz para alcançar a meta.

```text
Paridade funcional = 100 × resultados comparáveis PASS_CURRENT / 117
Conclusão = paridade funcional de 100%
            E 17/17 controles CVG adicionais PASS_CURRENT
            E todas as 16 famílias completas
            E controles CVG e auditoria independente aprovados
            E nenhuma exceção, referência não validada ou gate pendente
```

Para `FUNCTIONAL_PARITY`, `PASS_CURRENT` exige referência funcional autenticada, execução positiva/negativa no CVG, equivalência decidida, revisão e inputs atuais. Para `CVG_CONTROL`, exige a regra/SPEC CVG aprovada, seus positivos/negativos no CVG, revisão e inputs atuais; não exige mecanismos internos observáveis no Claude. Transcript fabricado ou mock do comportamento esperado não é oráculo funcional da referência.

**Linha de base qualificada: 0/117 resultados comparáveis e 0/17 controles adicionais, todos `NOT_RUN`.** Isso significa ausência de qualificação nesta medida, não ausência de funcionalidades implementadas. A análise 0618 já identificou componentes presentes/parciais; não há percentual de funcionalidade real calculado por esta rodada documental.

## Referência e política de mudança

- Referência: **Claude Code 2.1.302, Linux x86-64**.
- Artefato: `/home/ricardo/.local/share/claude/versions/2.1.302`.
- SHA-256: `60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5`.
- Evidência inicial: [bundle REA](../04_audit/evidence/REA-CLAUDE-20261017/rea-evidence-bundle.json), oito capturas informativas de ajuda/versão e a matriz CC18. Elas comprovam a superfície anunciada, não a execução de cada função. Não houve descompilação nativa.
- Checkout de análise: `7ecc5b53944dcbc50fc26a95cfaec05bb1c62eb5`; não confundir com a candidata estável `5a199668` ou a worktree PARE100.

As páginas oficiais relacionadas no catálogo são fontes explicativas, não documentação historicamente vinculada ao hash do executável. G01/G02 registram conteúdo/digest/data e validam cada discrepância com a versão fixada. Recursos remotos também precisam de identidade do serviço, conta/plano autorizado, protocolo e data: o hash local sozinho não congela um serviço SaaS.

Atualização do Claude não move a meta automaticamente. Um delta registra versão, requisitos novos/alterados, impacto e decisão de adoção. Mudança de plataforma, equivalência ou escopo gera nova versão explícita; o relatório não pode conservar a expressão “100% do alvo original” após excluir uma função.

## O que será pareado

| Família                      | Requisitos iniciais | Resultado esperado                                                                                         |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| CC18-01 — Hooks              | 9                   | Lifecycle, matcher/merge/escopos, handlers confirmados, erros e ponte de configuração.                     |
| CC18-02 — Subagentes         | 8                   | Perfis especializados, contextos/fork, ferramentas, modelos/skills, comunicação e cancelamento.            |
| CC18-03 — Sessões            | 10                  | Continue/resume, seleção/nome, persistência, fork, consulta, opt-out e retenção.                           |
| CC18-04 — MCP                | 11                  | Cliente e servidor, transportes anunciados, configuração, autenticação, discovery, resources e elicitação. |
| CC18-05 — Skills/plugins     | 9                   | Manifestos, descoberta progressiva, invocação, gestão/dependências/configuração e footprint.               |
| CC18-06 — Contexto/memória   | 9                   | Pressão/compactação, instruções com origem e memória aprendida revisável e isolada.                        |
| CC18-07 — Programático       | 9                   | Headless, formatos, stream, JSON Schema, replay, eventos e diálogo autenticado com o host.                 |
| CC18-08 — Planejamento       | 6                   | Exploração somente leitura, plano/todos versionados e passagem governada para execução.                    |
| CC18-09 — Contenção          | 8                   | Relato honesto do host, roots, rede, processos/ambiente, limites e restricted.                             |
| CC18-10 — Budget/modelos     | 8                   | Limite monetário, custo agregado durável, effort, seleção/fallback e reconciliação.                        |
| CC18-11 — Background         | 8                   | Start/list/attach/logs/stop/respawn/remove e steering com dono.                                            |
| CC18-12 — Workspaces         | 6                   | Roots/add-dir, worktree por tarefa, recuperação/cleanup e tmux/PTY.                                        |
| CC18-13 — Rewind             | 7                   | Snapshots, restauração seletiva, resumo dirigido, conflito, retenção e limites explícitos.                 |
| CC18-14 — Configuração       | 8                   | Schema, fontes/precedência, safe/bare, prompt/snapshot/digest e diagnóstico redigido.                      |
| CC18-15 — Evals              | 8                   | Runner, ablação, repetição, mocks, orçamento, relatório e promoção por evidência.                          |
| CC18-16 — Remoto/IDE/gateway | 10                  | Cloud/self-hosted, continuidade, controle remoto, IDE/desktop e gateway corporativo.                       |
| Total                        | 134                 | 117 resultados comparáveis + 17 controles CVG adicionais; todos obrigatórios.                              |

A matriz completa, donos, fontes, casos positivos e negativos estão no catálogo e no 0383. Esses números são a versão inicial; qualquer refinamento preserva rastreabilidade dos IDs anteriores.

## Equivalência funcional e governança

O objetivo é o resultado para o operador, não copiar implementação proprietária, marca, pixel de interface ou nomes de comandos. O host CVG pode usar `cvg` e interfaces próprias, mantendo uma tabela explícita de correspondência com os comandos da referência.

As classes serão decididas em G04: `EQUIVALENTE` ou `EQUIVALENTE_GOVERNADA`, ambas com prova do resultado e do controle. `TO_VALIDATE`, `PARTIAL`, `BLOCKED`, `NOT_RUN`, exceção aberta e mero `DONE_LOCAL` não contam. Recusa de uma ação que a referência executa não se transforma em equivalência por renomear o status: para o caso positivo deve existir caminho autorizado que produza o resultado esperado. Negativos de segurança são avaliados como uma barra CVG adicional.

As equivalências já aprovadas para o programa DeepSeek não se estendem automaticamente a novos detalhes Claude. A SPEC registra o que se reaproveita e o que exige nova decisão. As funções de bypass citadas na ajuda não integram as melhorias permitidas da 0618; não haverá desativação de controles obrigatórios. Se uma expectativa exigir violar a constituição, o requisito fica bloqueado e a limitação é reportada, sem declaração de paridade literal global.

Na falta de um serviço proprietário ou acesso licenciado à referência, cloud/IDE/gateway continuam no denominador e em `BLOCKED_REFERENCE`. Construir um simulador ou serviço CVG com finalidade semelhante permite desenvolver, mas não fecha o aceite comparativo sozinho. Compatibilidade documentada, fidelidade da interface e equivalência do resultado precisam de prova separada.

## Estratégia de implementação e arquitetura

1. Requalificar o que já existe: kernel, policy/approval, journal, checkpoints, sessões, budget, SDK, plugins e sandbox. Não criar motores concorrentes.
2. Fechar continuidade/streaming/contexto antes de aumentar autonomia. Demonstrar uma jornada sintética completa cedo: abrir sessão → ferramenta READ → WRITE retida para approval → retomada → stream → restart sem efeito duplicado.
3. Conectar MCP, skills e hooks às capabilities revisadas. Discovery, import e instalação não concedem grant.
4. Construir supervisão e experiência de operação: filhos, jobs, planos, configuração e workspaces. Budgets/grants são herdados por interseção e com accounting agregado.
5. Acrescentar rewind somente sobre artefatos próprios e com conflito detectado. Não prometer desfazer efeitos externos ou ações clínicas/financeiras.
6. Entregar interfaces remotas, IDE/desktop e gateway por adapters/hosts após validar suas semânticas. Não tornar o núcleo dependente do Claude ou de um SaaS específico.
7. Qualificar todas as famílias no mesmo SHA/digest e submeter o pacote completo à auditoria independente e à autoridade humana aplicável.

Contratos públicos e eventos são compartilhados pelo integrador; adapters possuem transporte e recursos do host. Dados aprendidos e instruções nunca atravessam tenant ou se tornam fonte institucional aprovada implicitamente. O produto Assistente de Plantão continua fora do núcleo.

## Carteira única de implementação, com duas referências

O [0380](0380_backlog_paridade_100_deepseek.md) continua proprietário do estado e do trabalho PAR. O [0383](0383_backlog_paridade_claude_code.md) é a extensão de deltas C100 e da qualificação Claude, ligada por uma ponte no 0380. O mesmo componente não ganha duas tasks de construção ou dois estados concorrentes.

Há **37 cartões C100 novos**, **53 PAR referenciados diretamente** e **58 PAR no fecho transitivo**, sem contar carriers opcionais como SSH/ACP como obrigatórios para cloud/IDE. Reuso opcional só vira dependência após decisão arquitetural, com recalculo do grafo e do esforço. Não se exige concluir todos os 111 PAR ou obter 272/272 DeepSeek para iniciar ou aceitar o Claude100.

Um PAR pode produzir evidência aproveitável pelos dois alvos, mas cada catálogo qualifica seus próprios requisitos. `PAR-Q02` compara DeepSeek; não é automaticamente um comparador Claude. C100-Q01 adiciona o driver/oráculo específico. Infraestrutura Q03/Q04/Q06/Q08 é reutilizada, sem alterar o denominador aprovado do PAR-CAP.

Reuso pode ocorrer por fatia integrada com contratos e aceites relevantes aprovados, sem esperar uma expansão não relacionada do PAR. G03 registra essa delimitação e atualiza o saldo; referências a PAR não autorizam pegar paths de outro agente. O fecho de 58 usa os cartões completos como estimativa conservadora inicial.

## Organização, investimento e calendário

Modelo proposto: **cinco frentes totais**, compartilhadas com o programa PAR, com integração única. A frente de núcleo acumula o papel L0 de integrador; as demais cobrem interfaces, extensões, supervisão e qualificação. Não se presumem cinco frentes adicionais nem disponibilidade exclusiva já concedida. A alocação efetiva entra nos claims.

O dimensionamento é ROM, por leitura, sem velocidade observada deste programa:

| Parcela                           | Dimensão inicial                                        | Regra de contagem                                                                                              |
| --------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Deltas específicos Claude         | 37 cartões; 230–472 dias de engenharia                  | Cada cartão contém somente o complemento não coberto pelo aceite PAR.                                          |
| Dependências/reuso PAR            | 58 IDs únicos; 625 dias nominais pelos tamanhos do 0380 | Conservador: todos tratados como pendentes até requalificação; não somar de novo ao orçamento global DeepSeek. |
| Envelope de capacidade deste alvo | Aproximadamente 636–1.316 dias de engenharia            | 65%–135% dos 625 dias herdados + delta; não é custo incremental de adicionar Claude ao programa já financiado. |

Com cinco frentes e 70% de capacidade efetiva, o modelo resulta em **42–86 semanas**, ponto nominal **64 semanas**, antes de esperas por gates e acesso externo. Com três frentes: **61–126 semanas**, nominal **93**. Valores arredondados para cima. São limites de planejamento pelo máximo entre capacidade agregada e caminho crítico; não é simulação de agenda com recursos, nem compromisso de prazo. O [modelo derivado](../04_audit/evidence/CLAUDE100-PLAN-20261017/plan-index.json) permite recomputar as premissas.

Não há data de início aprovada. G03 reavalia código integrado, esforço PAR já executado e orçamento comum; após dois sprints medimos throughput, retrabalho e espera e substituímos estas faixas. Agentes podem reduzir tempo de codificação, mas isso não elimina dependências, acesso à referência, revisão e provas de runtime. Custos de contas/modelos/infra não estão cotados nem autorizados por esta estimativa; serão apresentados antes dos ensaios que os exigirem.

## Gates e decisões concretas

Seguir `DISCOVERY → PRD → SPEC → BUILD → AUDIT`. G01–G04 fecham referência, lacunas de produto e pacotes de SPEC; depois executar por fatias com tarefa registrada. Trilha T1 para este pacote documental; mudanças de contrato, schema, segurança, memória e approval seguem T3; capacidade externa real ou candidata segue T4 hash-bound.

Decisões que o pacote G04 precisa tornar concretas antes do BUILD correspondente:

| Tema                             | Proposta para revisão na SPEC/PRD                                                              | Efeito de não resolver                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Equivalências Claude             | Resultado funcional demonstrado com controles CVG, sem bypass.                                 | Não se concede `PASS_CURRENT` ao requisito afetado.                |
| Memória e snapshots              | Escopo, revisão, retenção, exclusão, acesso e conflito definidos por tenant/workspace.         | Não iniciar BUILD de persistência aprendida/undo.                  |
| Cloud/IDE/gateway                | Confirmar o que a referência faz; escolher contrato, cliente e ambiente com acesso autorizado. | Família 16 permanece obrigatória e bloqueada na comparação.        |
| Medição de qualidade/performance | Workloads, limites e graders independentes versionados antes dos testes.                       | Não aceitar uma nota/latência escolhida após observar o resultado. |
| Capacidade e integração          | Cinco frentes compartilhadas; um writer para schema, lockfile, contratos e ledgers.            | Calendário deve refletir a capacidade real disponível.             |

Não se pede nova aprovação para preparar documentação reversível. Estes itens são requisitos dos futuros gates; o plano não marca nenhuma decisão nova como recebida. Permanecem válidas as decisões de 16/10 sobre SPEC0221/0222/0225 somente nos hashes, ajustes e escopos próprios; migrations 0029 → 0030 → 0031. 0220/0226 adiadas não são reabertas por este plano.

## Barra de qualidade e evidência

Para cada resultado comparável, o receipt deve conter: identidade/digest da referência, ambiente/serviço, cenário e entrada sintética, saída/estado/eventos brutos, SHA/imagem/configuração/modelo/fixture/grader CVG, positivo/negativo, revisão e decisão de equivalência. Para controles adicionais, a fonte normativa é a regra/SPEC CVG aprovada e os receipts exercitam seus positivos/negativos no CVG com revisão e identidade da candidata; não se inventa prova de mecanismos internos no Claude. Alterar input invalida a prova afetada. Normalização só de IDs/tempos/transporte declarados; não apagar negações, side effects, erro, ordem ou consumo para esconder diferença.

Além dos aceites funcionais, aplicar os controles transversais: isolamento tenant/workspace, policy/approval, autoridade herdada, custo agregado, redaction, contenção real, cancelamento cooperativo, preservação da causa primária e replay sem efeito extra. O gate numérico não compensa falha de controle.

G04 congela os limites de carga da SPEC antes do teste. Proposta inicial: 10 sessões sintéticas, dois filhos por sessão, 30 minutos, reconnect e um restart injetado; zero evento perdido, vazamento ou efeito duplicado; consumo dentro do grant. Para paths locais determinísticos, comparar p95 de overhead no mesmo hardware/fixture e manter a razão até 1,25 e acréscimo até 100 ms quando ambos forem medíveis. Estes limites são **propostos**, não SLA aprovado nem tempo garantido para modelo/rede real; se a medição não for válida, decidir novo método antes de observar o aceite, sem produzir PASS por indisponibilidade.

Em BUILD, usar Node 22 e os checks exigidos pela constituição: typecheck, lint, unitários, PostgreSQL, E2E e demais gates aplicáveis. Certificação completa ao fim de rodada com código e por candidata, em claim/snapshot próprio. A rodada atual só verifica a estrutura documental do plano e não executa esses testes funcionais.

## Riscos e resposta

| Risco                                                             | Dono       | Resposta e gatilho                                                                  |
| ----------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| Help não corresponde ao comportamento disponível na conta/versão. | L0/L5      | G01/G02 exigem oráculo real; manter requisito pendente até observar.                |
| Cloud/gateway depende de serviço não acessível ou mutável.        | L0/L4      | Fixar contrato/ambiente/data; acesso T4 separado; sem retirar a família da meta.    |
| Reuso já está em outra worktree ou com qualificação rejeitada.    | Integrador | G03 confere SHA e gate atuais; não transferir certificação da candidata estável.    |
| Ampliação disfarçada dentro de PAR aprovado.                      | Dono PAR   | Delta C100 explícito, SPEC/gate novo quando exceder a condição aprovada.            |
| Memória ou extensão amplifica prompt injection/autoridade.        | L1/L3      | Proveniência, revisão, limites, dados não confiáveis e negativos antes da promoção. |
| Undo ou cleanup destrói trabalho simultâneo.                      | L1/L4      | Posse, snapshots, conflitos, preview e nenhuma limpeza cega.                        |
| Estimativa ignorou dependências e gate humano.                    | L0         | Reestimar depois de dois sprints; publicar saldo e espera, sem prometer data fixa.  |

## Recuperação, progresso e próxima ação

Registro de 17/10/2026: planejamento criado; nenhum requisito qualificado, nenhum BUILD iniciado e nenhum recurso externo provisionado. Progresso técnico permanece no backlog próprio de cada dono. A auditoria documental independente e os checks desta entrega estão no pacote de evidências, separados de auditoria de paridade.

Para retomar: ler instruções, 99/20/30, coordenação, este plano, 0382/0383 e catálogo; conferir pin, Git status e claims; escolher somente tarefa com dependências/gates atuais. Parada ou falha não autoriza reset, perda de histórico ou reinício de efeito incerto. Recuperar por journal/checkpoint, reconciliar estado e preservar a causa primária.

**Próxima ação executável: C100-G01 — validar o catálogo e a identidade da referência**, mantendo as 16 famílias e registrando variantes ainda não observadas. Em seguida, G02/G03 e pacote G04. Produção do núcleo continua na [trilha 0374](0374_plano_producao_harness.md); paridade não concede deploy, push, dado real ou efeito clínico/financeiro.
