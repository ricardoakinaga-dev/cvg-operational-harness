# SPEC0225 — reconciliação da entrada de implementação local

Task: `C100-FND-JOURNAL-ENTRY-RECONCILE-001`. Trilha T1, revisão técnica
de condições de entrada; estado inicial `PROPOSED_FOR_INDEPENDENT_REVIEW`.
Este documento preserva a SPEC original, a cópia ajustada e suas revisões.
Não concede aprovação humana nova nem qualificação funcional.

## Autoridade e resultado pretendido

A [decisão humana](../../USER-DECISIONS-20261016/spec-gates.json) aprovou
a0225 original SHA `04b92ba4d13b1ed58157a24258cade87d8d6d31df833ef6c1969059772cc6da5`
com ajustes. Sua bindingRule permite aplicar somente esses ajustes com revisão
técnica independente, sem repetir gate humano. A cópia ajustada
`foundation0225-recomposition/adjusted-spec-proposal.md`, SHA
`f26ccead3ad43d55d480ba08533e55bc9792a299608667570850668b0d12b315`,
teve revisãoR2 `APPROVE_APPROVED_ADJUSTMENTS`, sem obrigatório aberto.

O resultado desta reconciliação é determinar se implementação e testes locais
dessa mesma fatia podem começar em candidata própria enquanto a promoção
compartilhada e a qualificação global permanecem impedidas. Não mudar
contrato, schema, principal, policy, limite ou aceite para obter entrada.

## Fatos e separação dos gates

O inventário primário congelado neste pacote deverá confirmar:

- PARE está limpo na branch persistente
  `codex/pare100-exec-20261014-6az3hlay`, commit
  `a72422bee3730ecc98226e3ff8f4c7fb51a4e7fe`. Seu Git comum está na raiz
  persistente do repositório; a preservação não depende da sobrevivência de/tmp.
- Nesse commit,0029 e seu registro no loader já coexistem. Digest SQL
  `a738b4031d4ef06bfc5508cb9c459d7133d419b3271962f4ea9b1a808965745d`.
  O registro primário de coordenação atribui o commit ao usuário. Não atribuir
  ao Codex uma execução de commit que não ocorreu.
- As cinco decisões existem:0220/0226 adiadas e0221/0222/0225 aprovadas com
  ajustes. O mapa P100→PAR está publicado no0380. Seu texto182paths/semcommit
  e cinco decisões pendentes é anterior a esses fatos.
  -0029 continua ausente do checkout compartilhado e da branchmain. Nenhuma
  promoção para esses destinos é presumida. A branch preservada não prova
  aceite PAR-K01, certificação global ou aprovação de código inacabado.

PAR-G01 é T1: preservação por commit, decisões registradas e mapa publicado.
Uma integração de código qualificado ao checkout compartilhado é outra
operação. O [roadmap0379](../../../../03_build/0379_roadmap_paridade_100_deepseek.md)
ordena0029 noPAR-G01 antes de0030/0031 e permite começar dependentes sobre
contratos congelados. Não nomeia main como alvo obrigatório antes de qualquer
edição local. O [backlog0380](../../../../03_build/0380_backlog_paridade_100_deepseek.md)
mantém PAR-K03 dependente dePAR-K01; essa aresta permanece para entrega e
aceite funcional. Nenhuma destas observações encerra automaticamentePAR-G01.
O dono canônico recebe o inventário/checagens para reconciliar seu estado;
este pacote não altera0380 nem seus claims.

## Reconciliação explícita da condição anterior

A cópia ajustada§8/§10/§11 e suaR2 mantiveram ausência0029 no checkout
compartilhado e suporte TH06 não qualificado como bloqueios. Não apagar nem
reescrever essas evidências. A interpretação anterior exigia promoção root
antes da implementação local; essa exigência adicional era técnica do agente,
não uma nova condição textual da decisão humana.

Propõe-se substituí-la, **somente para entrada da candidata local**, por:

1.0029 já integrada e registrada na branch persistentePAR-G01 antes de0030,
e presente/registrada sem alteração na candidata da0225. Instalação de teste
também respeita0029 antes de0030. Reconfirmar inventário antes do BUILD;
colisão0030 ou drift de0029 bloqueiam entrada, sem renumerar silenciosamente. 2. Contratos da dependência0217 congelados por fonte/hash na candidata.
PAR-K01 não é declarado completo. Um teste ou implementação pode revelar
falha da dependência, que permanece bloqueio de aceite/promoção; não é
permissão para alterar contratos0217, checker ou pins nessa task. 3. TH06 antigo e sua recuperação continuam reprovados. O código de diagnósticos
da candidata99c9, aceito de forma limitada, e a declaração de tooling5e3b
não herdam certificação global. Qualquer suporte usado nos novos testes
precisa demonstrar validade na prova correspondente: causa primária,
cleanup, propagação de falha, processos/identidades reais e asserts intactos.
Não usar resultado falso do helper reprovado como prova J13/J16. 4. Todas as regressões, gatesT2 e certificação atual ficam obrigatórios antes
de encerrar a rodada com código/qualificar integração. Os43reds de contrato
e qualificação global atual ausente permanecem débitosP0. Implementar a
correção aprovada não equivale a resolver esses débitos; não marcar DONE,
promover código ou conceder crédito se um obrigatório continuar aberto.

Esta mudança de ordem de trabalho não rebaixa a0225 deT3, não remove revisão
humana já concedida, não antecipa aceite de dependente e não relaxa uma guarda.
Se a revisão identificar condição humana primária contrária ou ampliação real,
a entrada continua impedida e deve ser indicada precisamente.

## Candidata e execução limitadas propostas

Base de fonte: `5e3b51bd97e0c328640e472f784fcf3f769ee8ec`, contendo a
composição0217/0029 e os diagnósticos aceitos localmente, mais o único builder
emprestado do commitroot7ecc, SHA
`937792b348686c07da8dcc4ef2c2ad89f1970fcbc90240fa15e05755bc1ea034`.
Essa reutilização tem revisão própria emruntime-build-closure-reuse; não
editar sua fonte congelada. Novo worktree proposto
`/tmp/cvg-claude100-exec-20261017/journal0225-candidate`, branch própria,
criado somente depois desta revisão, aceite do builder e novo claim.

Superfície da task futura: adapter e codec interno de resultado do journal
empackages/persistence,0030 e seu registro, testes focais/nativos da0225 e
composição sintética própria. Antes da edição, congelar HOW e paths concretos,
pré-imagens, fonte/defaultloader0029, inventário de migrations e recursos.
Não editar0016/0029, produto, hosts, SDK, manifests/lock, checker ou pins
antigos. Nenhuma ativação automática em worker/published.

O contrato é exatamente a fatia ajustada: codec opt-in, versão externa ao
valor, colunas separadas, corte exclusivo com parada, guarda persistente por
principal/schema, não adoção de linha0 e sem coexistência antiga/nova no alvo.
Journal lógico1MiB, base641398104 e envelope1398616; checkpoint/capture8MiB
e contexto32KiB inalterados. Versões, domínio estrito, imutabilidade, estado,
tenant, fences e ordem de locks continuam os da cópia ajustada.

J01–J13 eJ16 permanecem obrigatórios, incluindo restart/crashpoints distintos,
J13 bound real e ambas as fronteiras journal/capture deJ12. J05–J07 conservam
a matriz mínima explicitada na cópia; J14 e drill completoJ15 ficam adiados.
Limite de nós deve ser discriminado no componente quando dominado pelo cap de
bytes na porta pública. Nenhum resultado dessa matriz foi executado aqui.

PG de teste será novo, sintético, loopback e de propriedade da task; roles,
schema, credenciais e sessões antigas dos negativos pertencem só a ele.
Recursos, portas, limites, cleanup e binding privado de provas serão definidos
e reclamados antes da criação. Não tocar containerPARE existente. Sem modelo,
conta, provider, dado real, release, push ou produção. Não implementar0226,
não ocupar0031 e não executarSPEC0238 sem resposta humana.

## Critérios desta revisão T1

- ER01: fatos Git,0029/loader e decisões autenticados; divergências registradas.
- ER02: nenhum requisito humano é retirado; ordem0029→0030→0031 preservada.
- ER03: condições anteriores reconciliadas expressamente; suporte inválido não
  vira aceito e os43reds/gates globais permanecem visíveis.
- ER04: escopo aprovado integral e seus testes mantidos; só entrada local muda.
- ER05: nenhuma promoção, alteração de estadoPAR ou crédito funcional implícito.
- ER06: caminhos/ownership e T1 links/formatação válidos; task futura depende
  de aceites, checklist de entrada e recursos específicos antes de código.

Veredito requerido: `ACCEPT_LOCAL_ENTRY_RECONCILIATION` ou `REVISE`, com
obrigatórios, critério e fonte primária. Aceitar esteT1 estabelece a interpretação
de entrada; não executa BUILD, não prova osJ e não encerra a rodadaT3.
