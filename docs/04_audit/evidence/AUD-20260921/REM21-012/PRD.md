# REM21-012 — PRD — skip governance candidate/run-bound

## Problema

Um skip pode permanecer permitido depois de expirar, ser associado a gate
inexistente ou ser aceito sem que o gate dedicado tenha sido executado. Isso
reduz silenciosamente o denominador e torna impossível distinguir cobertura
condicional real de ausência de execução.

## Resultado desejado

Cada skip condicional deve ser uma exceção temporária, identificável,
hash-bound e coberta por um gate executado. A barra deve produzir um inventário
único para unit, PostgreSQL, chaos e E2E; qualquer incerteza deve falhar
fechado.

## Requisitos de produto

- `PR-01`: exigir `expiresAt` como data ISO-8601 futura no catálogo;
- `PR-02`: aceitar somente `unit`, `postgres`, `chaos` e `e2e` como gates
  dedicados e validar o gate de cada relatório;
- `PR-03`: rejeitar skip desconhecido, expirado, data inválida, obrigatório,
  source drift, relatório ausente/duplicado e dedicated gate não executado;
- `PR-04`: preservar contagem por gate, arquivo, teste, owner, razão, hash,
  expiração e `observedGates` no inventário;
- `PR-05`: produzir e anexar relatório JSON E2E no mesmo run, sem dado real;
- `PR-06`: ligar o inventário a `runId` e `candidateId`, com self-tests
  negativos reproduzíveis;
- `PR-07`: não converter skip aceito em aprovação produtiva; `NO_GO` externo
  continua intacto.

## Critérios de aceite

| ID | Critério verificável |
| --- | --- |
| AC-01 | Catálogo real e fixture sem `expiresAt`, com data inválida ou passada, falham. |
| AC-02 | Gate dedicado ou relatório fora de `unit/postgres/chaos/e2e` falha. |
| AC-03 | Skip aceito exige relatório do `dedicatedGate` e preserva essa relação. |
| AC-04 | Unit, PG, chaos e E2E entram no inventário; zero skips passa e skip desconhecido/required falha. |
| AC-05 | E2E gera JSON candidate/run-bound e o CI publica o artefato com ausência fatal. |
| AC-06 | `skip:governance`, testes focados, typecheck/lint/formato e barra local passam em Node 22. |
| AC-07 | Nenhuma credencial, integração externa ou ação sensível é usada; produção continua `NO_GO`. |

## Fora de escopo

Mutation por risco (`REM21-013`), hardening da imagem (`REM21-016`), matriz
Firefox/WebKit, infraestrutura produtiva, RPO/RTO, IdP/provider/canal, I1 e
freeze.

## Gate

`PRD_COMPLETE / SPEC_APPROVED_CONTROLLED_BUILD`.
