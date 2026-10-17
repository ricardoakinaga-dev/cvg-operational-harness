# ADR-011 — Kernel de plugins com controles obrigatórios

- Data: 06/10/2026.
- Direção: **confirmada pelo usuário em 06/10/2026**. Ele pediu para seguir a
  linha do DeepSeek Harness, com plugins como forma de controle do agente, e
  para executar o roteiro 1–6 na ordem.
- Implementação: **não autorizada por esta ADR.** O contrato de plugins (SPEC,
  T3) passa pela revisão do usuário antes do BUILD do kernel (passo 3 do
  [0372](../../03_build/0372_kernel_plugins_roadmap.md)).
- Fontes: [auditoria 0596](../../04_audit/0596_auditoria_motor_direcao_plugins_2026-10-06.md),
  [ADR-002](ADR-002-runtime-separated-orchestrator.md),
  [ADR-004](ADR-004-model-gateway-mandatory.md),
  [ADR-005](ADR-005-policy-governs-effects.md),
  [ADR-010](ADR-010-harness-product-isolation.md) e
  [backlog do motor 0371](../../03_build/0371_engine_production_backlog.md).
- Referência externa: DeepSeek Harness (MIT), cópia local em
  `~/deepseek-harness`, commit `280156b0a9`.

## Contexto

O Operational Harness é o produto. O Assistente de Plantão e os futuros agentes
hospitalares são camadas acima, que o consomem por interfaces públicas
(ADR-010). O motor é usado para tudo da área hospitalar, menos diagnóstico e
prescrição.

O pipeline de governança está escrito à mão em três runtimes:
`SinglePassGovernedRuntime`, o iterativo do `packages/harness` e o
`GovernedAgentRuntime`. Há ainda dois pacotes de política e 19 pacotes no total.
Cada defeito precisa ser corrigido mais de uma vez, e não existe um ponto único
onde um controle novo possa entrar com garantia de que nada passa por fora dele.

## Decisão

1. **Kernel mínimo.** O kernel contém só o loop do agente (turno → passo →
   chamada ao modelo → chamadas de ferramenta), o host de plugins e os pontos de
   interceptação. Não contém política, provedor, canal ou domínio.
2. **Tudo o mais é plugin**, registrado por chave de serviço, com dependências
   declaradas e registro reversível (descarregar desfaz; o dispose espera a
   quiescência).
3. **Duas classes de plugin.**
   - **Capacidade**, livremente trocável: adapter de modelo, ferramentas,
     canais, transcrição, armazenamento.
   - **Controle**, obrigatória: política, aprovação, orçamento, auditoria,
     journal de efeitos, pausa e, depois, guarda de saída.
4. **Pontos de interceptação**, com modo de despacho declarado:

   | Ponto                        | Uso típico                                                             |
   | ---------------------------- | ---------------------------------------------------------------------- |
   | antes do passo               | aceitar ou rejeitar a entrada; pausa                                   |
   | antes de chamar o modelo     | orçamento; redação de dados pessoais                                   |
   | antes de chamar a ferramenta | política: permitir, negar ou pedir aprovação                           |
   | guardas finais               | controles que só podem negar                                           |
   | em volta da execução         | timeout, retry, métricas                                               |
   | depois da ferramenta         | journal de efeitos; auditoria                                          |
   | saída ao usuário             | guarda de saída (bloqueio de diagnóstico e prescrição, fase posterior) |

5. **Invariantes de controle**, todas fail-closed:
   - O kernel **não inicia** sem os controles obrigatórios do perfil.
   - Controles não podem ser descarregados nem reordenados pelo agente, por
     plugin de capacidade ou por configuração em runtime.
   - **Guardas monotônicas** retornam "negar" ou "abster-se", nunca "permitir".
     Nenhum plugin posterior desfaz uma negação.
   - Aprovação ausente, sem canal ou sem resposta vira negação. Aprovação
     concedida é de uso único e vinculada a tenant, ação, recurso, agente e
     classificação.
   - Toda chamada de ferramenta é registrada antes de executar. O resultado
     final é imutável e registrado uma vez.
   - Toda requisição ao modelo é reconstruível pelo log.
   - Exceção em plugin vira erro normalizado e não derruba o loop.
   - O cancelamento (`signal`) é obrigatório em todo o pipeline.
6. **Um só pipeline.** Single-pass, iterativo e o kernel durável do worker
   passam a ser modos do mesmo loop, cumprindo o ENG-007.
7. **Preservar o que já é mais forte que a referência:** journal de efeitos e
   aprovação duráveis em PostgreSQL, RLS por tenant e auditoria encadeada por
   hash. Esses componentes viram plugins de controle sem perder comportamento.

## O que se copia do DeepSeek Harness, e o que não

| Copia-se (o padrão)                                                                       | Não se copia                                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Serviços por chave, dependência declarada e registro reversível (Cordis)                  | O código: é release candidate, avisa de quebras incompatíveis e o `SAFETY.md` diz que não está pronto para produção |
| Eventos com modo de despacho declarado (`waterfall`, `serial`, `bail`, `emit`)            | Presets com shell, sistema de arquivos e rede livre                                                                 |
| Pipeline pre-execute → guardas monotônicas → execute → post-execute → resultado congelado | Loop trocável por configuração: aqui o loop é do kernel                                                             |
| "Model-visible means logged" e `tool/call` antes da execução                              | Skills e plugins de registro público instalados em runtime                                                          |
| Padrões defensivos (`docs/defensive-patterns.md`)                                         | Sessão em JSONL local como fonte de verdade: aqui ela fica em PostgreSQL com RLS                                    |

## Consequências

- Os perfis de agente declaram plugins de capacidade. Os controles vêm do perfil
  do kernel e não são opcionais.
- O Assistente de Plantão passa a ser um conjunto de plugins (canal WhatsApp,
  transcrição, organizador) e usa aprovação, journal e auditoria do núcleo. Esta
  ADR emenda a ADR-009 no ponto da missão: o assistente é o consumidor de
  validação do harness. D1–D4, SPEC 0177 e barra 0368 continuam valendo para o
  produto.
- Antes do kernel, uma suíte de conformidade derivada das invariantes acima roda
  contra o motor atual (caracterização). Ela continua verde durante toda a
  migração.
- `packages/policy` e `packages/policy-engine`, assim como `agent-core`, são
  consolidados ou removidos na unificação (passo 4), conforme a SPEC.

## Fora do escopo

Dado real, provider externo em execução, release, push, deploy, mudança das
regras clínicas do `AGENTS.md` (agendamento automático depende de ADR própria)
e a lista de agentes hospitalares.
