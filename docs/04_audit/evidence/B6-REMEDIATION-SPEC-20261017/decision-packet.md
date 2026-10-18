# Decisão T3 — SPEC0228 / contenção dos P1 da B6

Estado: **SPEC aceita em revisão técnica independente; decisão humana PENDING; BUILD não autorizado**.

Documento para revisar: [SPEC0228](../../../02_spec/0228_b6_boundary_fail_closed_remediation.md).
SHA-256: `05fa3140bff99be3b4b91c2a0f0212bd01f6dd10509785867e84d3fcd64bddfe`.

## O que a aprovação autoriza

BUILD local e sintético da primeira fatia, em candidata própria derivada de `5a199668`:

- retirar o PASS baseado somente em metadados de pacotes instalados;
- desativar a tabela atual de exceções sem prova suficiente, preservando dependências, diagnósticos, violações e drift;
- adaptar os testes ao contrato aprovado e executar os gates T2/T3 antes de declarar a implementação verificada.

**Consequência:** o gate normal da baseline deverá mudar de PASS para INCOMPLETE. O runtime não será alterado. Isto contém os falsos PASS conhecidos e não prova isolamento positivo nem encerra B6.

Não autoriza mecanismo novo de prova positiva, rede externa, dado real, implantação, produção, commit/push/deploy implícitos ou alterações em kernel, API/SDK, schema, produto, lock e workflows.

## Revisão e provas

- [Parecer técnico independente](review-r1/REPORT.md): ACCEPT_SPEC, sem correções obrigatórias; contrato revisado, implementação NOT_RUN.
- [Registro da revisão](review-r1/review.json) e [vínculo editorial da formatação](review-publication-format.json). [Conferência independente dos bytes finais](review-r1/final-bytes.json): ACCEPT_SPEC também no hash publicado, sem alteração do contrato.
- [Matriz de14aceites](acceptance-matrix.json), todos NOT_RUN; [inventário das16famílias](exception-inventory.json).
- Task futura: `B6-REMEDIATION-BUILD-0228`, filha de HISO-005/B1; candidato base e limites no [handoff](../../../08_runtime/handoffs/b6_remediation_spec_20261017.md).

## Por que há decisão humana antes de código

A [constituição operacional, D-12/T3](../../../07_agents/AGENTS.md) exige **“revisão explícita da SPEC pelo usuário antes do BUILD”** para mudança de segurança. O contrato proposto muda o significado de confiança e do resultado do gate; a antiga aprovação de extração não é usada como aprovação desta decisão nova.

Aprovação solicitada: **aprovar a SPEC0228 neste hash para BUILD local sintético da primeira fatia conservadora**. Pedidos de ajuste ou rejeição mantêm o BUILD fechado; silêncio não será registrado como aprovação.
