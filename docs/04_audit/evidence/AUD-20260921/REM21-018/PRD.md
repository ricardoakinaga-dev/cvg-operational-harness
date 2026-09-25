# REM21-018 — PRD

## Resultado

Remover identidade operacional baseada em RNG fraco dos caminhos produtivos
identificados e tornar o `.env.example` uma linha de base executável e segura
para API, web controlada, worker contínuo e homologação sintética. A aplicação
deve falhar fechado quando um perfil recebe valor inválido, arming inseguro ou
configuração produtiva insuficiente, sem exigir ou registrar segredo real.

## Critérios de aceite congelados

| ID | Critério | Prova obrigatória |
|---|---|---|
| `REM21-018-A24-1` | Journal, execução PostgreSQL e chaves de idempotência da jornada web usam UUID seguro por padrão; nenhum desses caminhos usa `Math.random`. | teste focado + scan dirigido do código-fonte. |
| `REM21-018-A24-2` | Os dois componentes Node aceitam factory explícita para fixtures determinísticas, sem alterar o default seguro. | testes unitários com factory fixa e teste do formato default. |
| `REM21-018-A24-3` | A jornada web usa o helper compartilhado seguro e mantém a semântica de idempotency key. | teste da jornada + typecheck/lint. |
| `REM21-018-A25-1` | `.env.example` contém as chaves atuais de API, replay/identidade, health, telemetria documentada, worker, homologação e web, separando testes/CI. | parser de exemplo contra inventário congelado e revisão textual. |
| `REM21-018-A25-2` | Perfis API, worker, homolog, iterativo e web rejeitam valores inválidos/inseguros através dos validadores públicos existentes. | matriz sintética negativa/positiva, sem banco ou serviço real. |
| `REM21-018-A25-3` | O exemplo contém somente placeholders locais/sintéticos; keyrings e provider secrets não contêm material utilizável. | secret scan negativo e inspeção do conteúdo. |
| `REM21-018-A25-4` | A mudança é coberta por testes e não introduz regressão nos gates locais aplicáveis. | testes focados, typecheck, lint, format, docs, diff e regressão Node 22. |

## Fora de escopo

- Não criar ou rotacionar credencial real.
- Não conectar IdP, PostgreSQL externo, provider, canal ou telemetria externa.
- Não mudar política de produção para liberar memória, simulation, inbound
  inline, worker controlado ou homologação.
- Não transformar o jitter de retry do model gateway em identificador.
- Não alterar `/live`, `/health` ou `/ready`; apenas documentar que seus
  timeouts/exporters são code-defined quando não há env correspondente.
- Não tocar evidência histórica hash-bound nem o `.gauntlet/` da rodada anterior.

## Definição de pronto local

`REM21-018` será `VERIFIED_LOCAL / FINAL_CERT_DEFERRED` somente se todos os
critérios obrigatórios passarem no mesmo candidate/run local e a crítica fresca
I1 não encontrar gap material. A certificação integral, freeze, signoff e
produção continuam fora desta tarefa.
