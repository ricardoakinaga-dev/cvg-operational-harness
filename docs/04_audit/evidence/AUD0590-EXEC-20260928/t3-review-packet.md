# Pedido de revisão humana T3 — AUD-0590 F01/F02

**Preparado:** 28/09/2026. **Decisão atual:** ambas aprovadas pelo usuário
para BUILD sintético nesta conversa, após apresentação deste pacote e dos
hashes `c3341087…`/`4d4ac269…`. **Produção:** `NO_GO`.

## Dois BUILDs sintéticos independentes

| Ficha | SPEC e hash SHA-256 | Decisão solicitada | Limite do BUILD |
| --- | --- | --- | --- |
| F01/A59-01 | [0162](../../../02_spec/0162_webhook_clock_highwater_marker.md) `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e` | Aprovar, revisar ou rejeitar o contrato T3 do marcador durável e da migration 0028 | PostgreSQL 16 descartável, Node 22, credenciais e dados sintéticos; nenhuma promoção, canal real ou migration em banco compartilhado |
| F02/A59-02 | [0158](../../../02_spec/0158_webhook_fencing_constraint_preflight.md) `4d4ac269a0843a668e8db21d34f4d8dd7604a5d4d262dc222169756016650380` | Aprovar, revisar ou rejeitar o contrato T3 de preflight semântico | boot/API e PostgreSQL 16 descartável, migrations reais apenas no schema sintético; sem serving real |

O [registro de validação](../../../02_spec/0190_spec_validation.md)
indica SPEC 0162 aceita por crítica independente I11 e **sem revisão T3 humana**.
A SPEC 0158 está pronta para revisão humana. A aprovação de uma ficha não
aprova a outra. O código local de F01 sobre expiração/SQL é só uma fatia da
SPEC 0160 já autorizada; a crítica I2 manteve F01 aberta por high-water e
falta de prova SQL na borda, esta última agora exercitada em PostgreSQL
descartável.

## Se houver aprovação

1. Registrar decisão explícita e hash exato da SPEC em 0190/ledgers, após
   liberação dos arquivos compartilhados e claim de paths de BUILD.
2. Executar apenas os deltas e negativos definidos na SPEC aprovada em
   worktree isolado, com PostgreSQL 16 descartável e Node 22. Qualquer
   alteração do contrato exige nova revisão; PR-L04 mantém `server.ts`.
3. Repetir crítica independente e gates vinculados ao mesmo commit. O
   resultado continuará `NO_GO` até F01–F15/G01–G13 e T4 completos.

## Resposta humana registrável

- `Aprovo T3 da SPEC 0162 no hash c3341087... para BUILD sintético` ou
  `Revisar/Rejeitar 0162: <motivo>`.
- `Aprovo T3 da SPEC 0158 no hash 4d4ac269... para BUILD sintético` ou
  `Revisar/Rejeitar 0158: <motivo>`.

**Resposta recebida:** “Aprovo ambas para BUILD sintético”. O escopo da
aprovação é somente o das duas fichas acima; não inclui release, dados
reais, provider/canal, migration em banco compartilhado ou alteração de
SPEC. Registrar esta decisão nos ledgers e em 0190 quando seus claims
concorrentes liberarem os caminhos.
