# IdP OIDC local com MFA

Esta configuração é apenas para desenvolvimento e homologação com identidades sintéticas. O issuer corporativo, o client e as regras de grupos de produção continuam pendentes em [D-09](../../docs/03_build/0357_production_decision_packet_2026-09-26.md). A API ainda não contém as rotas OIDC nem compõe o store PostgreSQL nesta fatia.

O [realm](realm-cvg-local.json) usa login por senha e **OTP obrigatório** em fluxo próprio. O client `cvg-local-operator` aceita apenas Authorization Code com PKCE `S256`, desabilita implicit flow e direct grants, e registra somente `http://127.0.0.1:3000/v1/auth/oidc/callback`. Não há usuários nem senhas no repositório. O único grupo inicial usa tenant sintético e papéis de teste. O login ainda deve ser rejeitado pela API se o token não comprovar MFA; configurar OTP pela primeira vez não equivale a validar um OTP no mesmo login.

Para iniciar, defina `CVG_LOCAL_IDP_ADMIN_PASSWORD` em seu ambiente local com um valor temporário sintético e execute:

```bash
docker compose -f deploy/local-oidc/compose.yaml up -d
```

Discovery: `http://127.0.0.1:8087/realms/cvg-local/.well-known/openid-configuration`. O serviço escuta apenas em `127.0.0.1`. A imagem usa `start-dev`, banco efêmero e HTTP para teste local. Execute a prova com Chromium instalado pelo Playwright do repositório:

```bash
node deploy/local-oidc/verify.mjs
```

O verificador cria um operador sintético com senha aleatória temporária, associa o grupo `Supervisor`, exercita PKCE/redirect/OTP e remove o usuário ao terminar. Para uso manual, crie operadores sintéticos no realm e associe cada um a exatamente um grupo de tenant/papel. Depois do primeiro cadastro de OTP, inicie uma nova autenticação para testar a prova de segundo fator. Para encerrar:

```bash
docker compose -f deploy/local-oidc/compose.yaml down
```

Fontes: [Keycloak Docker](https://www.keycloak.org/getting-started/getting-started-docker), [importação de realm](https://www.keycloak.org/server/importExport), [fluxos e OTP](https://www.keycloak.org/docs/latest/server_admin/).
