# Exemplo de consumidor neutro: agente de recepção

Exemplo sintético do cartão HISO-009 (itens B2/B3 do
[plano 0374](../../../docs/03_build/0374_plano_producao_harness.md)). Um agente
de recepção de hospital veterinário compõe o harness **somente** pelos exports
suportados publicados em
[PUBLIC_API.md](../../../docs/architecture/PUBLIC_API.md#superfície-suportada-para-consumidores-hiso-009):
`@cvg/harness`, `@cvg/harness-contracts` e `@cvg/model-gateway`.

Não é o Assistente de Plantão nem depende dele. Não há canal de mensagens,
prontuário, paciente, diagnóstico, prescrição, rede, banco de dados ou dado
real.

## O que o exemplo compõe

- `createOperationalHarness` com `createCapabilityRegistry` e
  `InMemoryEffectJournal` (sintético, sem durabilidade).
- Duas capacidades sintéticas:
  - `reception.lookup_opening_hours`: risco `LOW`, `READ`, idempotente, sem
    aprovação; responde a partir de uma fonte institucional fixa e sintética,
    com `sourceId` e versão;
  - `reception.request_appointment_slot`: risco `MEDIUM`, `WRITE`, marcada com
    `requiresApproval: true`; nunca altera agenda real.
- Portas fornecidas pelo consumidor: orquestrador determinístico por intenção,
  política (leitura permitida; escrita exige aprovação; risco alto vira
  handoff), aprovação que só devolve `PENDING` ou `DENIED` e não fornece porta
  `execution`, auditoria e telemetria em memória.
- Ponte do consumidor da porta `ModelGateway.complete` do harness para o
  `ModelGateway.generate` de `@cvg/model-gateway`, com
  `DeterministicModelProvider`, prompt aprovado em `PromptRegistry`, orçamento
  de custo (`InMemoryCostBudgetStore`) e eventos `onEvent`. Assim as duas
  camadas da ADR-004 se aplicam: orçamento, auditoria e telemetria do harness
  e as regras do gateway de provedores.

## Jornada sintética

`runReceptionJourney()` executa quatro turnos:

| Mensagem                                           | Caminho                                            | Resultado esperado                                         |
| -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `Bom dia!`                                         | resposta pelo modelo determinístico                | `COMPLETED`, uma chamada de modelo, eventos do gateway     |
| `Qual é o horário de funcionamento da recepção?`   | `reception.lookup_opening_hours`                   | `COMPLETED`, resposta da fonte fixa, journal `CONFIRMED`   |
| `Quero marcar uma consulta para a manhã de sexta.` | política `REQUIRE_APPROVAL` e aprovação `PENDING`  | `APPROVAL_REQUIRED`, capacidade não executada, sem journal |
| `Qual dose de remédio posso dar em casa?`          | handoff do orquestrador, sem modelo nem capacidade | `HUMAN_TAKEOVER`                                           |

Cada turno grava um evento de auditoria e um de telemetria. O teste
[`tests/consumers-reception-agent.test.ts`](../../../tests/consumers-reception-agent.test.ts)
verifica a jornada, a variante `DENIED`, a falha fechada de auditoria e a
ausência de chamada de rede. O teste
[`tests/consumers-public-surface.test.ts`](../../../tests/consumers-public-surface.test.ts)
verifica que o `index.ts` deste exemplo só importa nomes da lista suportada.

## Limites

O exemplo prova reutilização do harness por exports públicos em ambiente
sintético. Não prova durabilidade, isolamento de tenant, identidade de
operador, piloto, release ou aceite do isolamento (HISO-014). Para execução
durável, use os adaptadores de host listados na documentação e o caminho
completo API/worker.
