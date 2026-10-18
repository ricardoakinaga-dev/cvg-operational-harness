# Handoff — remediação P1 da B6 / SPEC0228

Task de autoria: `B6-REMEDIATION-SPEC-20261017`. Task futura de BUILD: `B6-REMEDIATION-BUILD-0228`, filha de HISO-005/B1, sem autorização de execução na etapa de autoria.

Contrato: [SPEC0228](../../02_spec/0228_b6_boundary_fail_closed_remediation.md). Origem: [auditoria B6/0619](../../04_audit/0619_b6_stable_isolation_reaudit_2026-10-17.md). Evidências: [inventário de exceções](../../04_audit/evidence/B6-REMEDIATION-SPEC-20261017/exception-inventory.json), [aceites](../../04_audit/evidence/B6-REMEDIATION-SPEC-20261017/acceptance-matrix.json) e [baseline](../../04_audit/evidence/B6-REMEDIATION-SPEC-20261017/baseline.json).

A proposta é uma primeira fatia conservadora: pacotes instalados sem prova de conteúdo não são verificados; nenhuma exceção da tabela corrente suprime os escapes. O gate da baseline passará de PASS para INCOMPLETE. Isso remove as duas classes reproduzidas de falso PASS, preserva FAIL conhecido e não concede isolamento, paridade, certificação de outra linha ou produção.

Não há parser de tarball/cache, nova raiz de confiança ou requalificação automática nesta fatia. Prova positiva futura exige identidade de artefato, fronteira de implementação e binding/implementação do receptor; hashes copiados da própria instalação e SRI apenas textual não bastam.

Base futura: candidata isolada derivada de `5a199668eef5db4ca7aa2adc3853169ca0953cbf`, preservando a candidata certificada, `core-fix`, PARE100 e Claude100. Apenas scripts de fronteira/testes e bloco correspondente do runbook serão alterados se aprovados; nenhuma mudança de runtime, schema, produto, lock ou workflow integra esta proposta.

Gate: D-12/T3 da constituição exige revisão explícita da SPEC pelo usuário antes de BUILD. O pedido de avançar não é registrado como aprovação de documento ainda não apresentado. Revisão técnica independente ocorre antes do pacote final; não substitui a decisão humana nem os gates posteriores.

Estado: `WAITING_HUMAN_APPROVAL`, com ACCEPT_SPEC independente nos bytes publicados. [Pacote de decisão com SHA](../../04_audit/evidence/B6-REMEDIATION-SPEC-20261017/decision-packet.md). Implementação e os 14 aceites estão NOT_RUN. A aprovação futura só autorizará BUILD local sintético sob claim próprio; não autoriza commit, push ou deploy automaticamente.
