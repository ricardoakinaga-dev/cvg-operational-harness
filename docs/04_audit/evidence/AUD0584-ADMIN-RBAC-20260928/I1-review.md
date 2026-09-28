# AUD-0584 — crítica independente inicial

- Crítico: Kuhn, leitura somente, 28/09/2026.
- Veredito: `ACCEPT_LIMITED_LOCAL`, sem P0/P1 de bypass no candidato
  `7ef74e7`; produção `NO_GO`.

A crítica confirmou que `Operator` possui `approval:view` e
`approval:execute` na matriz e que os handlers de capability approval
verificam essas permissões e o tenant antes do lookup. Os três 400 não
indicam contorno de RBAC: `GET`/`HEAD` consultam ID inexistente e `POST
execute` retorna `invalid_action`. Quarenta e cinco dos 48 pares admin
foram negados com 403. `Admin` não possui `approval:execute` e recebeu
403; tenant divergente e headers de papel forjado receberam 403.

Lacunas apontadas:

- P1 para **qualquer alegação corporativa**: a sonda cria sessões em memória
  diretamente e desabilita callback; não prova IdP, MFA ou mapping em
  staging. O relatório mantém explicitamente essa fronteira.
- P2 local: IDs inexistentes não provavam leitura/execução positiva com
  sessão OIDC; teste de execução existente usava identidade simulada.
  Uma segunda sonda de approval real sintético foi adicionada para fechar
  esta lacuna local; revisão I2 pendente.
