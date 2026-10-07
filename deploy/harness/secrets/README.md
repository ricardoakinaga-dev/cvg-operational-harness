# Segredos do núcleo — geração, guarda e rotação (C4)

- Plano: [0374, Fase C](../../../docs/03_build/0374_plano_producao_harness.md), item C4.
- Runbook da fase: [0805](../../../docs/08_runtime/0805_runbook_ambiente_real.md).
- Este arquivo só tem **comandos**. Nenhum valor gerado entra no repositório,
  em ticket, em chat ou em evidência. Nada aqui foi executado para um
  ambiente real.

## Onde os segredos vivem

1. **Cofre do destino** (decisão do usuário em C1: o gerenciador de segredos
   da plataforma escolhida). É a fonte da verdade e guarda o histórico de
   versões.
2. **Arquivos de ambiente no host**, renderizados do cofre no deploy:
   `/etc/cvg-harness/harness.env` (compose) e `/etc/cvg-harness/backup.env`
   (backup), dono `root`, modo `0600`, fora de qualquer checkout. O formato é
   o do [.env.example](../.env.example).
3. **Variáveis de ambiente dos contêineres.** A aplicação lê segredos só de
   variáveis (não há leitura de `*_FILE`). Quem tem acesso ao Docker do host
   vê esses valores com `docker inspect`: o grupo `docker` equivale a root e
   fica restrito à operação.

Nunca em: imagem (o build não recebe segredo; a varredura gitleaks da imagem
tem de continuar com 0 achados), repositório, `docker-compose` versionado,
logs (a aplicação não ecoa URLs de conexão), evidências em
`docs/04_audit/evidence/`, linha de comando (`ps` mostra argumentos).

## Geração

`openssl rand -hex 32` gera 64 caracteres hexadecimais: passa no mínimo de 32
caracteres que a API exige e não precisa de escape em URL, JSON ou env.
Redirecione a saída direto para o cofre (o comando exato depende do cofre
escolhido); não a exiba num terminal compartilhado.

| Segredo                         | Formato exigido pelo código                                                                                                                                                                                                                                                                     | Comando                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CVG_OPERATOR_IDENTITY_KEYRING` | JSON `{"current":{"keyId","secret"},"previous":[{"keyId","secret","rotatedAt"}],"revokedKeyIds":[],"rotationWindowSeconds":3600}`; `keyId` `^[A-Za-z0-9._:-]{3,80}$`, sem repetição; `secret` ≥ 32 e sem "replace_me/change_me/example"; janela ≤ 86400 s (`apps/api/src/operator-identity.ts`) | `node -e 'process.stdout.write(JSON.stringify({current:{keyId:process.argv[1],secret:require("crypto").randomBytes(32).toString("hex")}}))' operator-AAAA-MM`                              |
| `CVG_RATE_LIMIT_KEYRING`        | JSON `{"budgetSecret","current":{"keyId","secret"},"previous":[...]}`; até 8 anteriores; segredos ≥ 32 (`apps/api/src/rate-limit.ts`)                                                                                                                                                           | `node -e 'const s=()=>require("crypto").randomBytes(32).toString("hex");process.stdout.write(JSON.stringify({budgetSecret:s(),current:{keyId:process.argv[1],secret:s()}}))' rate-AAAA-MM` |
| `WEBHOOK_SIGNING_SECRET`        | Texto ≥ 32, sem placeholder (`packages/shared/src/env.ts`); um único segredo por processo                                                                                                                                                                                                       | `openssl rand -hex 32`                                                                                                                                                                     |
| `CVG_STOP_ALERT_WEBHOOK_SECRET` | Texto ≥ 32 (`packages/observability/src/stop-alert.ts`); o mesmo valor no receptor (A3)                                                                                                                                                                                                         | `openssl rand -hex 32`                                                                                                                                                                     |
| Senhas dos papéis PostgreSQL    | Senha do papel; vai na URL de conexão (backup: separada, em `CVG_BACKUP_DATABASE_PASSWORD`)                                                                                                                                                                                                     | `openssl rand -hex 32`, aplicada com `\password <papel>` no `psql` ([postgres](../postgres/README.md))                                                                                     |
| Chave TLS do proxy              | PEM em `CVG_HARNESS_TLS_KEY_FILE`, modo 0600                                                                                                                                                                                                                                                    | Emitida pela autoridade escolhida (ACME/plataforma); nunca copiada para fora do host ou do cofre                                                                                           |

`keyId` com o mês da emissão (`operator-2026-10`) facilita saber qual chave
está ativa sem expor o segredo.

## Rotação

Regra geral: gerar a nova versão no cofre, renderizar o arquivo de ambiente,
aplicar com `docker compose ... up -d <serviço>` (recria só o que mudou),
conferir `/ready` e o smoke de destino, e só então remover a versão antiga.
Registrar data e `keyId` (nunca o valor) no ledger da rodada.

| Segredo                           | Sobreposição                                                                                                                     | Ordem                                                                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chaveiro de identidade            | Sim: a chave antiga vai para `previous` com `rotatedAt` (epoch s) e vale até `rotatedAt + rotationWindowSeconds` (padrão 3600 s) | 1) novo `current` + antigo em `previous`; recriar `api`. 2) Emissor passa a assinar com o novo `keyId`. 3) Depois da janela, retirar a antiga (ou listá-la em `revokedKeyIds` para cortar na hora em caso de vazamento). Sessões já abertas continuam (vivem no banco) |
| Chaveiro de rate limit            | O `current` antigo vai para `previous` (até 8)                                                                                   | Recriar `api`; a contagem recomeça com a chave nova (janelas de 60 s). Retirar a anterior na rotação seguinte. `budgetSecret` **não** roda em rotação normal: trocar exige migração (comentário em `rate-limit.ts`), então só com SPEC                                 |
| `WEBHOOK_SIGNING_SECRET`          | **Não** pela variável (um segredo só)                                                                                            | Corte coordenado com o emissor do webhook: suspender o envio (ou contar com o reenvio dele), trocar no emissor e na API, recriar `api`, retomar. Uma sobreposição real pede mudança de código com SPEC (o verificador já aceita lista)                                 |
| `CVG_STOP_ALERT_WEBHOOK_SECRET`   | Do lado do receptor: ele aceita as duas assinaturas durante a troca                                                              | 1) receptor aceita antigo e novo; 2) recriar `api`; 3) induzir/aguardar um alerta de teste (C7); 4) receptor retira o antigo                                                                                                                                           |
| Senha do runtime (`DATABASE_URL`) | Não (um papel, uma senha)                                                                                                        | `\password cvg_runtime` e, em seguida, recriar `api` e `worker` no mesmo minuto. Conexões abertas seguem; só reconexões nesse intervalo falham, e os pools tratam a perda sem derrubar o processo (0802)                                                               |
| Senha de sessão                   | Não                                                                                                                              | `\password cvg_session` e recriar `api`. Durante o intervalo, rotas de operador respondem 503 (falha fechada, 0802)                                                                                                                                                    |
| Senhas de migração e dono de auth | Não, mas só são usadas no deploy                                                                                                 | Trocar entre deploys; o próximo `up -d` já usa a nova                                                                                                                                                                                                                  |
| Senha de backup                   | Não                                                                                                                              | Trocar fora do horário do timer e atualizar `/etc/cvg-harness/backup.env`                                                                                                                                                                                              |
| Certificado TLS                   | Sim (o novo é instalado antes de o antigo vencer)                                                                                | Renovar, gravar nos caminhos de `CVG_HARNESS_TLS_*` e `docker compose ... exec proxy nginx -s reload`                                                                                                                                                                  |

Em caso de vazamento: revogar primeiro (identidade: `revokedKeyIds`; demais:
trocar já), aceitar a indisponibilidade curta e registrar incidente.

## Emissor de token de operador (C8)

A API em `trusted` aceita tokens `x-cvg-operator-token` assinados com o
chaveiro de identidade (`createTrustedOperatorIdentityToken`, validade de no
máximo 300 s, uso único) e os troca por cookie em `GET /v1/session`. O
repositório **não** tem um emissor implantável; o IdP corporativo/OIDC
continua pendente (D-09) e as rotas OIDC não estão compostas na API. Escolher
o emissor é decisão do usuário antes de C8.

Só para o ensaio e para o primeiro smoke de C8, o custodiante da chave pode
emitir um token por operador numa máquina controlada, a partir de um checkout
no SHA implantado, com a chave lida do cofre para uma variável de ambiente:

```sh
KEY_ID=operator-AAAA-MM KEY_SECRET="$(<comando de leitura do cofre>)" \
OPERATOR_ID=<id do operador> ROLE=<Operator|Approver|Supervisor|Admin> \
TENANT=<tenant_...> \
npx tsx --eval "import { createTrustedOperatorIdentityToken } from './apps/api/src/operator-identity.ts'; const e = process.env; process.stdout.write(createTrustedOperatorIdentityToken({ operatorId: e.OPERATOR_ID, role: e.ROLE, tenantId: e.TENANT }, { keyId: e.KEY_ID, secret: e.KEY_SECRET }))"
```

O token sai no stdout, vale cinco minutos e uma vez; entregue-o direto ao
`SMOKE_OPERATOR_A_TOKEN`/`SMOKE_OPERATOR_B_TOKEN` do smoke. Isso não substitui
o emissor de produção.
