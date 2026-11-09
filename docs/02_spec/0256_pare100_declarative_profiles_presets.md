# SPEC0256 — PAR-K05: perfis e presets declarativos

Estado: `PROPOSED_FOR_TECHNICAL_REVIEW`, r1, 22/10/2026. Preparação T1;
implementação T3 **não autorizada**. Task `PAR-K05-SPEC-0256`, subordinada ao
cartão existente [PAR-K05](../03_build/0380_backlog_paridade_100_deepseek.md#par-k05--perfis-e-presets-declarativos-validados),
sem criar fila de status concorrente. Evidência e recuperação:
[UNBLOCK-CLAUDE-20261022](../04_audit/evidence/UNBLOCK-CLAUDE-20261022/inputs.json).

## 1. Problema, fontes e resultado

Na main `420b97b3373389f30ac82c4d4078a21b2363fdf9`,
`packages/harness/src/kernel/profile.ts` compõe serviços por código;
`packages/contracts/src/contracts.ts` define `AgentProfile`. Existem loader e
registry de skills, mas não herança de perfis, presets ou persona por sessão.

Resultado proposto: resolver dados declarativos em um `AgentProfile` destacado,
validado e imutável, sem dar ao documento autoridade para registrar plugins,
ampliar grants, trocar policy ou desativar controles do host. O boot continua
usando o mesmo kernel e os ports do host.

Aceites canônicos preservados: perfil/preset sem controle obrigatório falha no
boot; trocar preset não altera sessão existente; persona não remove bloqueios.
Esta SPEC não declara esses aceites executados.

## 2. Escopo e dependências

- Perfis nomeados `base`, `headless`, `sdk`, `production`, herança simples,
  presets de ferramentas/prompt/skills e persona textual composável.
- Entrada explícita fornecida pelo host, sem procurar arquivos no HOME/cwd,
  carregar módulos, executar template, buscar URL ou ler variáveis implícitas.
- Sem provider, credencial, dados reais, canal, UI, deploy, nova migration ou
  dependência. O nome `production` não autoriza execução em produção.
- PAR-K04 continua pré-requisito de BUILD/integração. K01 e os ports de sessão
  usados na prova devem estar integrados e qualificados no SHA da candidata.
- Reusar o lifecycle aprovado **com os ajustes humanos** da SPEC0222; a
  proposta integral antiga não é autorização para capacidades adiadas.
- Sem dependência reversa de PAR-T07: referências de skills resolvem somente
  contra entradas já aprovadas fornecidas pelo host/registry existente. A
  inspeção0255, o catálogo persistido e o watcher não são implementados aqui.

## 3. Contrato de dados proposto

Envelope JSON estrito `schemaVersion: 1`, com mapas `profiles`, `presets` e
`personas`; cada entrada tem id e versão explícitos. Chaves desconhecidas,
duplicadas, referências ausentes e IDs duplicados são erros, sem recuperação
parcial. Mapas devem usar propriedade própria; nomes como `__proto__`,
`constructor` e `prototype` são recusados. Não aceitar getters, funções,
símbolos, ciclos, protótipos arbitrários nem objetos Proxy como entrada da API;
o parser recebe bytes JSON UTF8 limitados e produz dados próprios.

Proposta de limites antes do parse: 256 KiB por envelope; 128 perfis, 128
presets, 128 personas; cadeia de herança de até 16 perfis; 256 referências por
lista; string de até 16 KiB. O resultado deve respeitar os limites aprovados do
port consumidor, usando o menor limite. Esses números são propostas novas,
não os limites adiados da SPEC0222. A revisão técnica deve confirmá-los antes
de congelar o gate T3.

Perfil: `id`, `version`, `extends?`, objetivo, instruções, ferramentas, skills,
policies e controles exigidos. Preset: id/versão, perfil de origem, subconjunto
de ferramentas, referências de skills e instruções adicionais. Persona:
id/versão e instruções adicionais, sem campo de policy, ferramentas, controles
ou autoridade. Toda referência usa id **e** versão, sem `latest`.

Os nomes das APIs e o export público serão congelados após a recon de K04;
não publicar uma API que dependa de um port ainda inexistente. Este ponto
impede BUILD enquanto estiver aberto.

## 4. Resolução e autoridade

1. Validar envelope e referências antes de chamar port, modelo ou ferramenta.
2. Resolver uma única cadeia pai→filho; ciclo ou profundidade excedida recusa.
   Sem herança múltipla nem precedência dependente de ordem de objeto.
3. Identidade/objetivo final vêm da seleção explícita do host. Instruções são
   concatenadas na ordem base→filho→preset→persona, com separadores fixos.
   A ordem das listas integra o digest; ordenar apenas chaves dos objetos.
4. Ferramentas efetivas são interseção do grant atual do host, perfil resolvido
   e preset. Uma declaração que tenta ampliar o pai/grant é erro explícito,
   não expansão silenciosa. `*` é recusado nos documentos; um wildcard do
   host nunca é copiado como grant para o perfil. Lista vazia concede zero.
5. Policies e controles do host são a base obrigatória: documentos podem
   acrescentar exigências, nunca remover, substituir, reordenar ou oferecer
   implementação de controle. `policy`, `approvals`, `effects`, `audit`,
   `budget`, `pause`, `log` vêm da lista canônica `CONTROL_SERVICES`; também
   exigir os serviços de loop definidos em `REQUIRED_SERVICES`. Não manter
   uma segunda lista executável divergente.
6. Sandbox continua obrigatório para ferramentas contidas. Ausência do port
   resulta em recusa; um perfil `headless` não retira aprovação nem contenção.
7. Skill é referência de dados, não grant. Requisito fora das ferramentas ou
   conhecimento autorizado recusa a composição. Nenhum corpo de skill ou
   persona registra ferramenta, executa ação ou satisfaz approval.
8. Produzir representação canônica e SHA-256 do resultado para identidade de
   configuração, sem segredos. O digest não é autorização, assinatura nem
   concessão de acesso.
9. Verificar serviços reais no boot pelo kernel: declarar nomes em JSON não
   satisfaz a presença do serviço. Nenhum I/O sensível antes desse gate.

Persona pode dizer “ignore a policy”; isso continua sendo texto sem autoridade.
O controle do kernel decide antes de cada chamada e nega a ação. Não tentar
provar segurança só com busca de palavras no texto.

## 5. Sessões e troca de preset

O host resolve a composição uma vez na criação da sessão, copia arrays/objetos,
congela recursivamente e vincula id/versões/digest ao mecanismo de sessão/K04.
A sessão usa esse snapshot em todos os turnos. Mutação do objeto original,
edição no catálogo ou alteração do preset padrão não muda o snapshot.

Trocar preset afeta somente sessões novas. Uma API para alterar sessão ativa,
reativar acesso, trocar tenant ou substituir perfil sob o mesmo id está fora
do escopo e deve recusar, sem alteração parcial. Revogação/pausa e policy do
host continuam aplicáveis às sessões existentes; imutabilidade de preset não
congela uma concessão revogada.

Retomada precisa usar snapshot/versionamento da sessão já criada. Não resolver
o nome novamente contra o preset atual. A recon técnica deve ligar essa regra
ao armazenamento/port efetivo de S01/K04 e testar restart. Se o port não
persistir o vínculo necessário, parar e submeter o delta concreto de schema à
revisão humana; esta proposta não autoriza migration por associação.

## 6. Erros e observabilidade

Códigos estáveis propostos: `PROFILE_INVALID`, `PROFILE_REFERENCE_MISSING`,
`PROFILE_INHERITANCE_CYCLE`, `PROFILE_LIMIT_EXCEEDED`,
`PROFILE_AUTHORITY_EXPANSION`, `PROFILE_CONTROL_MISSING`,
`PROFILE_SKILL_REQUIREMENT_DENIED`, `SESSION_PROFILE_IMMUTABLE`.
Mensagens são constantes revisadas, sem interpolar caminho absoluto, chave
arbitrária, corpo de instrução, segredo ou erro de terceiro. Nenhum sucesso
parcial após recusa. Registrar código e IDs validados/digest, sem conteúdo de
prompt/persona. Falha de audit deve seguir o comportamento fechado do port
canônico, sem inventar fila de audit própria.

## 7. Plano de código, após gates

- `packages/harness/src/profiles/`: parser limitado, resolução e composição
  de dados; API experimental exportada conscientemente em `src/index.ts`.
- `packages/harness/src/kernel/profile.ts`: adaptação explícita da composição
  existente; controles continuam criados pelo host, na ordem canônica.
- Adaptador do port de sessão/lifecycle identificado na recon K04: criação,
  vínculo de snapshot, retomada e descarte. **Path e API ainda a congelar**,
  sem implementação especulativa na plataforma ou terceira registry.
- `packages/harness/src/__tests__/profiles-*.test.ts`, consumidor empacotado e
  prova sintética de sessão/restart. Atualizar `PUBLIC_API.md` conscientemente.
- Não alterar `products/**`, regras de scanner, lockfile, pins ou fixtures
  históricas. Qualquer necessidade nova retorna à revisão de escopo.

## 8. Critérios verificáveis

| ID   | Positivo                                                                      | Negativo obrigatório                                                                                               |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| KP01 | Os quatro perfis nomeados compõem e bootam com ports sintéticos válidos       | Remover cada controle/serviço, ou só declarar seu nome sem port, recusa antes de modelo/ferramenta                 |
| KP02 | Herança e resultado determinísticos com mesmas entradas                       | Ciclo, pai ausente, chave duplicada/desconhecida, referência sem versão e limite excedido recusam sem I/O          |
| KP03 | Preset restringe ferramentas e admite skill cujos requisitos foram concedidos | Filho/preset tenta ampliar grant; wildcard; skill com ferramenta/conhecimento fora do grant: recusa, zero execução |
| KP04 | Sessão A usa snapshot original; nova B usa preset novo                        | Mutar entrada ou trocar padrão não muda A, incluindo após restart; nunca resolver A pelo nome atual                |
| KP05 | Persona altera instrução textual da sessão nova                               | Persona tenta WRITE proibida ou retirar approval: kernel recusa, corpo da ferramenta zero e audit correto          |
| KP06 | Revogação/pausa do host alcança sessão já aberta                              | Snapshot antigo não reutiliza grant/approval revogado nem remove sandbox                                           |
| KP07 | Consumidor usa artefato empacotado e API publicada                            | Não depende de source checkout, dados locais, segredos ou import do produto                                        |
| KP08 | Erros contêm código estável e dados revisados                                 | Chave/valor com caminho ou segredo sintético não aparece em erro, log ou audit                                     |

Matar mutantes que removem controle, substituem interseção por união, não copiam
arrays, resolvem preset por nome no segundo turno/restart, deixam persona
sobrescrever policy ou ignoram revogação. Usar spies de corpos de ferramenta,
contadores do modelo e leitura independente de snapshot/audit; não só comparar
strings de mensagens.

## 9. Gates, dependências abertas e próxima ação

Preparação documental não fecha PAR-K05, Q01/M1 ou PAR-T07. Antes de BUILD:

1. Reconciliar K04 e os ajustes humanos aprovados, sem reimplementar a proposta
   integral adiada; identificar API e path reais do vínculo de sessão.
2. Congelar contrato do parser, limites, exports e prova de retomada/restart;
   resolver os pontos explicitamente abertos nas seções 3, 5 e 7.
3. Revisão técnica sem obrigatórios e revisão humana T3 explícita da SPEC
   congelada, conforme [D-12](../07_agents/AGENTS.md#governança-proporcional-d-12-26092026).
4. K04 integrada/qualificada, claim de código/recursos disjunto e task de BUILD
   registrada. Nenhuma aprovação0238/0222/0255 transfere para0256.
5. Executar positivos/negativos/mutantes, typecheck, lint, suíte completa,
   PostgreSQL/E2E pertinentes em Node22 e certificação da candidata, cada gate
   com claim próprio e mesmo SHA; nenhum crédito por subconjunto.

Próxima ação autorizada: recon técnica do port de sessão/K04 e fechamento dos
pontos abertos desta r1. Somente depois produzir o pacote T3 revisável. O
pedido atual não é registrado como aprovação dessa SPEC recém-criada.
