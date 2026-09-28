# AUD-0587 — crítica fresca I2

- Revisor: Parfit, contexto independente e somente leitura, 28/09/2026.
- Veredito: `ACCEPT_AUDIT_SCOPE / PRODUCTION_NO_GO`; nenhum P0 novo. Confirmou que código e negativos sustentam os dois P1, sem prova de efeito externo duplicado. O arquivo `webhook-security.ts` tem os mesmos bytes no root e no candidato isolado; `server.ts` e o teste diferem, de modo que o veredito HTTP pertence só ao SHA isolado.
- P2 de evidência: a suíte 16/16 contém apenas um teste com PostgreSQL real; os demais usam memória/mocks. Os JSONs das sondas são resumos, sem requests/responses brutos ou script arquivado. `proof.json` tinha timestamp de montagem anterior ao takeover. O relatório e a prova agora explicitam a contagem e distinguem captura inicial de montagem final. [Repetição adicional no PostgreSQL](future-replay-pg.json) confirmou o replay de timestamp futuro após envelhecer a linha de expiração.
- P2 condicional: tenant resolver futuro não pode escolher escopo por header não assinado. Configuração atual usa tenant fixo. Negativo de integração ainda necessário.
- A crítica não reexecutou os negativos nem alterou arquivos; a aceitação é da auditoria local, não do BUILD de correção, staging ou produção.
