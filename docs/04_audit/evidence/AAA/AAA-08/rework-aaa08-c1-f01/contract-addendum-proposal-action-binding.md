# Adendo proposto ao `aaa_execution_contract` (AAA-03) — binding capability/action

- Origem: rework `AAA08-C1-F01`; o contrato revisão 2 (`9df1a05f…`) **não foi editado**.
- Status: `PROPOSED_NOT_NORMATIVE`. Só pode ser consumido como contrato após versionamento (`rev3` ou adendo datado), revisão independente e registro de hash. Enquanto isso, a implementação se apoia no aceite de AAA-08 ("toda combinação de perfil/role/action sensível tem decisão explícita") e no achado do coordenador.

## Texto proposto

Adicionar à §10 do contrato, após a regra de `resource.type`:

> **R-ACT-1** — A `action` deve pertencer ao conjunto fechado `CAPABILITY_ACTIONS[capability]`. O mapa é exaustivo para as 21 capabilities e o único alias tolerado é `read` para capabilities `*.read`. Qualquer outra divergência retorna `DENY` com código `action_capability_mismatch`.
>
> **R-ACT-2** — A checagem ocorre depois de tenant mismatch e de `resource.type`, e **antes** de grants, role ceiling e documentos de policy. Nenhum documento de tenant pode ampliar essa relação.
>
> **R-ACT-3** — Ações sensíveis (`appointment.confirm`, `appointment.reschedule`, `appointment.cancel`) nunca podem ser transportadas por capability de draft/leitura (`appointment.create`, `appointment.modify`, `schedule.read`, `conversation.read` etc.). O runtime não recebe autorização implícita por `action` divergente.
>
> **R-ACT-4** — `action_capability_mismatch` é fail-closed e aparece no `PolicyDecision.reason`; o runtime mapeia para `policy_denied` e não chama a ferramenta.

Acrescentar à matriz de testes (§12):

| ID   | Cenário negativo                                                     | Asserção esperada                                              | Owner  |
| ---- | -------------------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| T-21 | `capability=appointment.modify` + `action=confirm/reschedule/cancel` | `DENY action_capability_mismatch`; 0 chamadas de ferramenta    | AAA-08 |
| T-22 | `capability=read`+ `action` sensível, e policy de tenant com `ALLOW` | `DENY` antes de grants/documentos; nenhuma expansão por policy | AAA-08 |

## Mapa de aliases proposto (normativo se aprovado)

| Capability               | Actions aceitas                |
| ------------------------ | ------------------------------ |
| `schedule.read`          | `schedule.read`, `read`        |
| `conversation.read`      | `conversation.read`, `read`    |
| `patient.summary.read`   | `patient.summary.read`, `read` |
| `patient.record.read`    | `patient.record.read`, `read`  |
| `exam.read`              | `exam.read`, `read`            |
| `finance.read`           | `finance.read`, `read`         |
| `appointment.create`     | `appointment.create`           |
| `appointment.modify`     | `appointment.modify`           |
| `appointment.confirm`    | `appointment.confirm`          |
| `appointment.reschedule` | `appointment.reschedule`       |
| `appointment.cancel`     | `appointment.cancel`           |
| `message.draft`/`send`   | nome canônico                  |
| `patient.record.write`   | nome canônico                  |
| `exam.release`           | nome canônico                  |
| `finance.write`          | nome canônico                  |
| `hospitalization.manage` | nome canônico                  |
| `clinical.diagnose`      | nome canônico                  |
| `clinical.prescribe`     | nome canônico                  |
| `admin.policy.manage`    | nome canônico                  |
| `admin.agent.manage`     | nome canônico                  |

## Evidência que sustenta o adendo

- RED: 6 falhas antes do fix (`rework-aaa08-c1-f01/red-rework.log`).
- Probe do coordenador: antes `ALLOW/executed/1`; depois `DENY/denied/0` (`probe-before.json`/`probe-after.json`).
- GREEN focado 38/38; suíte 177 arquivos/904 testes; typecheck/lint/coverage verdes.

## Risco se não aprovado

A suíte e o probe continuam verdes, mas o comportamento passa a existir sem base normativa congelada; qualquer consumidor externo (AAA-09/AAA-21) não pode citar o contrato para justificar o DENY. Nesse caso o rework deve ser revertido ou reescrito para o texto aprovado.
