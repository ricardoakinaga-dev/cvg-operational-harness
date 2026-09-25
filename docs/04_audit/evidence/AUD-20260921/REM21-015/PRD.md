# REM21-015 — PRD

Data: 2026-09-22  
Status: `PRD_READY_FOR_SPEC`  
Finding: `A21-F17` — hotspots elevam risco de mudança.

## Problema

Quatro módulos concentram fronteiras que pertencem a owners diferentes. A
concentração não produziu, por si só, um novo comportamento incorreto, mas
torna mais difícil localizar policy, revisar mudanças e provar que uma
alteração não atravessou uma fronteira de segurança ou tenant. A resposta deve
ser incremental, observável e reversível.

## Usuários e owners

| slice | owner após a extração | consumidor preservado |
| --- | --- | --- |
| sessão trusted no API | API identity/session boundary | `buildServer` |
| migrations PostgreSQL | persistence/schema lifecycle | `@cvg/persistence` e callers atuais |
| loop detection | harness execution policy | `IterativeGovernedRuntime` e exports atuais |
| trace viewer | web platform presentation | `PlatformPanel` |

## Objetivo do produto técnico

Reduzir a responsabilidade direta dos hotspots por quatro seams de baixo risco,
sem alterar os contratos existentes, a ordem de execução ou os dados exibidos.
Cada seam deve ter uma fronteira nomeada, teste direto e caracterização do
comportamento anterior.

## Escopo desta entrega

- criar os quatro módulos descritos em `DISCOVERY.md`;
- mover implementação, não duplicar lógica;
- manter reexports públicos e imports existentes;
- adicionar testes de contrato para cada seam;
- registrar antes/depois de linhas e mapa de ownership;
- executar testes focados e regressão proporcional em Node 22.

## Fora de escopo

- redesign de API HTTP ou alteração de payload/status;
- mudança de SQL, schema, checksum, ordem de migration ou RLS;
- mudança de semântica de loop, budget, checkpoint, tool dispatch ou claims;
- extração do formulário inteiro ou de mutations do Control Center;
- alteração de dependências, produção, IdP, provider, canal ou dados reais;
- refatoração big-bang, renomeação de contratos ou remoção de histórico.

## Requisitos funcionais

1. O hook de sessão deve tratar cookie válido, expirado, store indisponível e
   rotas de sessão com os mesmos status, headers e corpo seguro.
2. O facade PostgreSQL deve continuar exportando
   `PostgresQueryable`, `PostgresMigrationOptions`, funções de migration e
   arrays de baseline usados pelos callers.
3. A assinatura de decisão deve permanecer determinística e a detecção de
   ciclos deve conservar as regras de repetição/ciclo atuais.
4. O Trace Viewer deve filtrar por agente, renderizar `traceText`, preservar a
   seleção de trace e manter nome acessível e navegação existente.
5. Nenhum slice pode introduzir autoridade simulada em escopo não controlado,
   dado real ou ação externa.

## Requisitos não funcionais

- compatibilidade de módulo/exports;
- ownership legível no caminho do arquivo;
- diff pequeno e revisável por slice;
- testes determinísticos sem rede, provider ou banco real;
- falha explícita em caso de import/reexport perdido;
- nenhuma diminuição de threshold, cobertura ou severidade para acomodar a
  extração.

## Critérios de aceite

- [ ] cada hotspot possui um seam extraído e uma redução mensurável de linhas;
- [ ] não há duplicação das implementações movidas;
- [ ] testes de caracterização e testes diretos passam;
- [ ] typecheck, lint, format e `git diff --check` passam;
- [ ] a API pública e o comportamento dos callers permanecem iguais;
- [ ] mapa de ownership, comandos, hashes e limitações são registrados;
- [ ] produção permanece `NO_GO` e a decisão é somente `VERIFIED_LOCAL` se a
  auditoria passar.

## Métricas de sucesso

| slice | métrica mínima |
| --- | --- |
| API session hook | `server.ts` reduz pelo menos 40 linhas; hooks preservam ordem |
| PostgreSQL migrations | `postgres.ts` reduz pelo menos 250 linhas; todos os exports atuais seguem resolvendo |
| loop detection | `iterative-runtime.ts` reduz pelo menos 35 linhas; hashes/ciclos sem alteração |
| Trace Viewer | `index.tsx` reduz pelo menos 35 linhas; queries/labels dos testes preservadas |

## Decisão de produto técnico

Autorizar SPEC e BUILD controlado apenas para esses quatro slices. Qualquer
necessidade de atravessar outra fronteira deve abrir novo slice e não ser
absorvida silenciosamente nesta task.
