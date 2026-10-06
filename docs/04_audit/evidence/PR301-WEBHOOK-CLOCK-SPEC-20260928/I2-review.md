# I2 — crítica independente da SPEC 0162

- Data: 28/09/2026.
- Hash revisado: `da13430c6fc1d46c9c77ec67930d78233805495751a4bcd84072c6976c364a97`.
- Veredito: `REVISE`; nenhum P0, três P1 e dois P2.
- Método: fresh-context, somente revisão do contrato; sem edição, implementação, migration ou teste de banco.

## Achados

1. **P1 — Membership efetivo do runtime ainda pode permitir bypass do trigger.** O preflight cobre grants e `session_replication_role`, mas não fecha toda a cadeia de `INHERIT` e `SET ROLE` que poderia tornar o runtime owner do objeto ou dar-lhe `SUPERUSER`, `BYPASSRLS` ou DDL. Exigir que o preflight percorra a closure transitiva e que testes conectem como a identidade real de runtime para provar que ela não pode assumir papéis privilegiados nem alterar/desativar o trigger.
2. **P1 — Bootstrap da migration 0028 pode começar abaixo do maior relógio já observado.** Se o relógio PostgreSQL regredir antes da primeira inserção do singleton, inicializar com `clock_timestamp()` não preserva a máxima observada por instâncias anteriores. Exigir bootstrap que receba/valide a máxima anterior de todas as instâncias ou mantenha o ingress fechado quando essa prova faltar; testar regressão imediatamente antes da inicialização e rejeição de evento/receipt expirado.
3. **P1 — O orçamento de tempo não impõe limite duro a locks e statements.** A SPEC pede fail-closed quando o orçamento residual acaba, mas não exige deadlines do cliente, `lock_timeout` e `statement_timeout`; os dois últimos têm default zero, portanto podem deixar a operação bloqueada. Definir deadlines vinculados ao orçamento A2 e provar resposta fail-closed dentro do limite, sem mutação de inbox/receipt; incluir perfil de pico e skew de tenants.
4. **P2 — `append-only` não está garantido para o log de recovery.** Se o executor de recovery possui a tabela, pode editar ou apagar evidência. Separar owner e executor ou usar sink imutável independente; provar que a identidade de recovery não atualiza, deleta ou trunca registros.
5. **P2 — Aprovações não estão vinculadas ao reset exato.** IDs opacos não provam aprovação independente, atual e específica do incidente, digest de evidência e valores anteriores/novos. Vincular prova verificável a esses campos, exigir aprovadores distintos e one-use, e rejeitar evidência repetida, expirada ou divergente.

O parecer confirma que o guard global é coerente com A2 de 0160 e corretamente separado do inbox tenant-scoped de 0161. Mesmo se 0162 for aceita, reconciliação de pending, D-06 e idempotência do provider continuam gates independentes; nenhuma aceitação documental libera produção.

## Referências técnicas primárias consultadas

- [PostgreSQL 16 — Role Membership](https://www.postgresql.org/docs/16/role-membership.html): privilégios herdados e `SET ROLE` pela cadeia de membership.
- [PostgreSQL 16 — Privileges](https://www.postgresql.org/docs/16/ddl-priv.html): ownership implica direitos de modificar/destruir objetos e esses direitos podem ser herdados por membros.
- [PostgreSQL 16 — Client Connection Defaults](https://www.postgresql.org/docs/16/runtime-config-client.html): `lock_timeout` e `statement_timeout`; valor zero desabilita o limite.

Nenhuma alteração de arquivo de código/schema decorre deste parecer. Aprovação humana T3 e BUILD continuam pendentes.
