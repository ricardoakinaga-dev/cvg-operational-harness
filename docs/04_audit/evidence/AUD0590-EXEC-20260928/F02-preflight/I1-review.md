# F02 I1 — crítica independente do commit isolado `239442f`

**Crítico:** Mill (`01a0eb24-feb6-7122-a9be-4c6974e6bca7`), contexto
novo, somente leitura. **Veredito:** `REJECT` da fatia local de F02;
produção `NO_GO`. Revisou os quatro arquivos do commit, SPEC 0158 e logs;
não executou testes nem alterou fonte. Sentinelas SHA de fonte/SPEC e HEAD
coincidiram antes e depois da inspeção.

| Prioridade | Achado | Correção exigida antes de integrar |
| --- | --- | --- |
| P1 | A matriz negativa PostgreSQL chama o preflight diretamente com cliente administrador; o boot público com role de serving/RLS testa só `CHECK(true)`. Trigger, regra e FK não demonstram efeito operacional negativo no boot. | Passar mutações reais pelo boot público `POSTGRES_RLS_ENFORCEMENT=true` e provar reserva/commit afetado nos casos exigidos. |
| P1 | `test:postgres` não inclui o novo arquivo de matriz; o gate de 35 arquivos pode passar sem executar esses negativos. | Registrar a matriz no teste já listado pelo gate, pois `package.json` pertence à PR-L04, e evitar execução duplicada. |
| P2 | Comparações por truthiness deixam campos booleanos obrigatórios ausentes parecerem `false`. | Comparar `true`/`false` explicitamente e testar respostas incompletas do catálogo. |

A revisão considerou coerentes, na leitura, vínculo por OID, guarda da
versão principal PG16, comparação da forma canônica, dependências built-in e
transação de leitura. Não demonstrou falha na execução real PostgreSQL dos
checks atuais; a rejeição é por alcance da prova e comportamento inesperado
do catálogo. Os gates do builder estão preservados no
[manifesto](.evidence/proof.json) da primeira rodada.
