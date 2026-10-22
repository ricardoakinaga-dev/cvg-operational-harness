# 0374 — Plano para levar o Operational Harness a produção

- Data: 07/10/2026. Task: `FULLTEST-20261007` (Claude Code).
- Base: snapshot `31dc1c3` (main publicado), instância local `cvg-harness-local-20261006`
  (http://127.0.0.1:3410), bateria completa registrada em
  [`docs/04_audit/evidence/FULLTEST-20261007/summary.md`](../04_audit/evidence/FULLTEST-20261007/summary.md).
- Barra de referência: [0373](0373_barra_producao_harness.md) (dez condições no mesmo
  commit e na mesma imagem) e [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md)
  (harness como infraestrutura; produtos consumidores isolados).

## 1. Onde estamos

O código do harness está maduro: todos os gates executáveis do repositório passam no
snapshot `31dc1c3` em worktree limpo, a imagem endurecida sobe em modo produção com
PostgreSQL real, papéis separados, login, webhook assinado, aprovação, pausa e alerta
(smoke 22/22), o backup restaurado mantém a cadeia de auditoria íntegra e detecta
adulteração, e o CI remoto Verify/Security está verde no `main` atual.

O que falta não é código: é **infraestrutura, proteção de repositório, decisões de
operação e o aceite formal do isolamento para consumidores**. A barra 0373 tem nove
condições cumpridas localmente e uma (condição 5) cumprida pela metade: CI verde sim,
proteção do `main` não.

| Condição 0373         | Estado em 07/10/2026                                                  |
| --------------------- | --------------------------------------------------------------------- |
| 1 conformidade dsh    | ✅ `tests/conformance` sem `it.fails`                                 |
| 2 suítes verdes       | ✅ 359/2.952 + PG 37/302, zero skips fora do catálogo (SKIP-PG-021)   |
| 3 pilha real produção | ✅ smoke 22/22 na imagem própria `fulltest-31dc1c3`                   |
| 4 operadores entram   | ✅ login 200 / protegida 200 / sem sessão 401 (smoke)                 |
| 5 CI + proteção       | ⏳ Verify/Security verdes em `31dc1c3`; `main` **sem proteção** (404) |
| 6 segredos/deps       | ✅ gitleaks 0 na imagem; `npm audit` 0; ⚠ 1 HIGH sem correção na base |
| 7 imagem endurecida   | ✅ distroless, uid 10001, read-only, cap-drop ALL                     |
| 8 backup testado      | ✅ restore com cadeia íntegra e adulteração detectada                 |
| 9 alerta              | ✅ `worker_down` e `queue_stalled` assinados recebidos                |
| 10 botão de desligar  | ✅ pausa retém pendências e retomada drena                            |

## 2. Achados desta rodada (nenhum bloqueia código; todos entram no plano)

| Id   | Sev | Achado                                                                                                                                                                                                  | Encaminhamento                 |
| ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| F-01 | P1  | `main` sem branch protection nem rulesets; qualquer push entra sem checks obrigatórios                                                                                                                  | Fase A, item A1                |
| F-02 | P2  | `CVE-2026-84782` HIGH em `libssl3` do `distroless/cc-debian12`, sem versão corrigida publicada                                                                                                          | Fase A, item A4 (aceite + SLA) |
| F-03 | P3  | `scripts/restore-audit-chain-proof.ts` espera `pg_isready`; o contêiner oficial reinicia após init e a prova falha com "Connection terminated" (2/2 nesta máquina); passa com espera por consulta real  | Fase B, item B4                |
| F-04 | P3  | `npm run test:e2e` em clone limpo falha 10/12 porque o dev server do Vite não resolve `@cvg/*` sem `packages/*/dist`; passa 12/12 após `tsc -b`                                                         | Fase B, item B4                |
| F-05 | P3  | `verify:phase2`/`verify:phase3`/`test:phase4a` exigem `TEST_DATABASE_URL` e `PHASE4A_DISPOSABLE_PG=1`, não documentados no runbook de gates                                                             | Fase B, item B4                |
| F-06 | P3  | `boundary:products` leva ~22 min e termina `INCOMPLETE` (0 violações, 8.856 dependências instaladas não verificadas ao percorrer `node_modules`); fail-closed correto, mas inviável como gate de rotina | Fase B, itens B1 e B4          |
| F-07 | P3  | `npm audit` cobre dependências, mas a imagem não tem varredura de SO no CI (Trivy só foi rodado manualmente)                                                                                            | Fase A, item A4                |
| Obs  | —   | 150 requisições sem sessão em `/v1/tasks` retornaram 401 sem 429: rate limit não é acionado por tráfego anônimo no perfil memory                                                                        | Confirmar política na Fase C   |

## 3. Plano em quatro fases

Ordem pensada para custo crescente e dependência real. Cada fase termina com uma
reauditoria independente (Codex) sobre o mesmo SHA/digest e registro nos ledgers.

### Fase A — Fechar a condição 5 e as decisões pendentes (1 dia, sem código)

| Item | Ação                                                                                                                                                                   | Dono             | Aceite                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| A1   | Ativar proteção do `main`: checks obrigatórios `REM21 CI bar (Node 22)`, `codeql`, `secret-scan`, `supply-chain`; sem push direto; sem force-push; revisão obrigatória | usuário + Claude | `gh api .../branches/main/protection` 200 com os quatro contextos                        |
| A2   | Decidir a política do scan semanal de segredos: 6.548 achados são evidências históricas sintéticas em `docs/04_audit/evidence`; 9 fora dela são fixtures sintéticas    | usuário          | Allowlist por caminho registrada em `.gitleaks.toml` ou decisão de manter triagem manual |
| A3   | Definir destino e limiares reais do alerta (`CVG_STOP_ALERT_*`) e quem recebe                                                                                          | operação         | Receptor real validado com assinatura HMAC                                               |
| A4   | Política de vulnerabilidades da imagem: adicionar Trivy ao workflow Security; aceitar F-02 com prazo e rebuild automático quando a base distroless publicar correção   | Claude           | Security falha em HIGH/CRITICAL com correção disponível                                  |
| A5   | Reauditoria A (Codex) confirma condição 5 completa                                                                                                                     | Codex            | Parecer com SHA e proteção verificada                                                    |

### Fase B — Isolamento aceito para camadas consumidoras (3 a 5 dias)

Esta fase é o que torna o harness "pronto para receber programas acima". Cartões já
existem em [0370](0370_harness_product_isolation_backlog.md); aqui está a ordem.

| Item | Ação                                                                                                                                                                              | Cartão   | Aceite                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| B1   | Fechar os dois caminhos de dependência proibida que a crítica T2 reproduziu; gate `boundary:products` com caso negativo conhecido                                                 | HISO-005 | Gate falha ao introduzir import harness→produto; passa no `main`       |
| B2   | Publicar a lista de exports suportados (`@cvg/contracts`, `@cvg/harness`, `@cvg/model-gateway`, adapters) e o contrato de composição `createOperationalHarness` para consumidores | HISO-009 | Documento + teste de regressão que importa só o suportado              |
| B3   | Exemplo mínimo de consumidor fora de `products/shift-assistant` (um agente hospitalar sintético, por exemplo recepção) compondo o harness só por exports públicos                 | HISO-009 | Exemplo compila, roda jornada sintética e passa pelo gate de fronteira |
| B4   | Runbook de gates reproduzível em clone limpo: `tsc -b` antes de E2E, variáveis de PG por gate, espera robusta na prova de restore, tempo do `boundary:products`                   | HISO-006 | Novo colaborador reproduz todos os gates com um comando documentado    |
| B5   | CI e barra por artefato: harness e produto certificados separadamente                                                                                                             | HISO-010 | Workflow do harness não executa testes do produto e vice-versa         |
| B6   | Reauditoria B (Codex) e aceite documental da independência                                                                                                                        | HISO-014 | ADR-010 atualizada para "isolamento aceito"                            |

### Fase C — Ambiente real (1 a 2 semanas, depende de decisão de hospedagem)

| Item | Ação                                                                                                                                                                     | Aceite                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| C1   | Escolher destino (VM própria, Kubernetes ou PaaS) e registrar manifesto em `deploy/`                                                                                     | Manifesto versionado; segredos fora do repositório                    |
| C2   | PostgreSQL gerenciado ou dedicado com os quatro papéis (`migration`, `runtime`, `auth owner`, `session`), RLS ligado, sem SUPERUSER/BYPASSRLS                            | `scripts/production-stack-smoke.ts` adaptado ao destino passa 22/22   |
| C3   | Job de migração separado (`scripts/migrate-job.mjs`) executado antes da API/worker; serving sem credencial DDL                                                           | API recusa `DATABASE_MIGRATION_URL`; catálogo confirma dono do schema |
| C4   | Segredos: `CVG_OPERATOR_IDENTITY_KEYRING`, `WEBHOOK_SIGNING_SECRET`, `CVG_RATE_LIMIT_KEYRING`, `CVG_STOP_ALERT_WEBHOOK_SECRET` gerados e armazenados no cofre do destino | Rotação documentada; nenhum segredo em imagem ou repositório          |
| C5   | HTTPS com proxy reverso, `API_REQUIRE_HTTPS=true`, `API_TRUSTED_PROXY_ADDRESSES` com endereços reais; sonda `/live` por loopback                                         | `curl` externo sem TLS recebe 426; com TLS 200                        |
| C6   | Backup agendado (`pg_dump --format=custom`) com âncoras das cabeças dos ledgers guardadas fora do banco; ensaio de restore mensal                                        | Primeiro restore real registrado com cadeia íntegra                   |
| C7   | Observabilidade: logs estruturados coletados, métricas `/health/metrics` raspadas, alerta de parada ligado ao receptor da Fase A                                         | Parada induzida do worker gera alerta no canal real                   |
| C8   | Identidade de operador: `CVG_IDENTITY_MODE=trusted` com emissor de token (IdP corporativo ou emissor interno assinado); simulação desligada                              | Login real de dois operadores com papéis distintos; 401 sem sessão    |
| C9   | Smoke no destino com a mesma imagem e o mesmo digest da certificação; registro em `docs/04_audit/evidence/`                                                              | Mesmo digest da imagem em CI e em produção                            |
| C10  | Reauditoria C (Codex): dez condições 0373 no mesmo SHA/digest, em ambiente real                                                                                          | Parecer `GO` do núcleo; produtos continuam com barra própria          |

### Fase D — Operação assistida e primeiro consumidor (contínuo)

| Item | Ação                                                                                                                           | Aceite                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| D1   | Duas semanas de operação do núcleo sem produto, só com tráfego sintético e os alertas reais ligados                            | Zero incidentes sem alerta; pausa/retomada exercitada uma vez     |
| D2   | Primeiro consumidor real escolhido (o Assistente de Plantão tem barra 0368 e decisões D1–D4 próprias) passa pela própria barra | Release do produto registrado separadamente do release do harness |
| D3   | Revisão trimestral: dependências (`npm audit`, Trivy), rotação de chaves, ensaio de restore                                    | Evidência datada em `docs/04_audit/evidence/`                     |

## 4. O que NÃO está neste plano

- Nenhuma mudança funcional no kernel: os achados F-03 a F-06 são de ferramental de teste.
- Nenhum dado real, provider de modelo real ou canal real até a Fase C9 concluída.
- Nenhum release de produto: a separação da ADR-010 continua valendo.

## 5. Critério de "pronto para receber camadas acima"

O harness pode ser consumido por uma camada nova quando B1, B2 e B4 estiverem aceitos
(Fase B parcial). Pode ser consumido **em produção** quando a Fase C fechar com parecer
`GO`. Entre esses dois pontos, consumidores podem ser desenvolvidos e testados em
ambiente sintético contra os exports públicos, aceitando que o contrato ainda pode mudar
com SPEC e gate T3.

## 6. Execução — rodada PLAN0374-A (07/10/2026)

| Item | Estado             | Evidência / nota                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | DONE               | Proteção do `main` ativa: quatro checks obrigatórios, `enforce_admins`, sem force-push/exclusão, histórico linear ([prova](../04_audit/evidence/PLAN0374-A-20261007/raw/branch-protection-main.json)). Fluxo de publicação no [runbook 0803](../08_runtime/0803_runbook_gates_locais.md)                                                                                        |
| A2   | DECISÃO DO USUÁRIO | Triagem dos 105 achados do scan semanal concluída: todos sintéticos ([triagem](../04_audit/evidence/PLAN0374-A-20261007/raw/weekly-secret-scan-triage.json)). A ampliação dos allowlists em `.gitleaks.toml` foi bloqueada pela política de permissão da sessão como "enfraquecimento de segurança"; o texto proposto está na rodada e aguarda aplicação explícita pelo usuário |
| A3   | ABERTO             | Destino/limiares do alerta continuam decisão de operação                                                                                                                                                                                                                                                                                                                        |
| A4   | DONE_LOCAL         | Job `image-scan` em `security.yml` (Trivy v0.36.0 pinado): HIGH/CRITICAL com correção falham; sem correção só reportam. F-02 aceito até a base distroless publicar `libssl3` corrigido; prova no primeiro run do CI                                                                                                                                                             |
| B4   | PARCIAL            | F-03 corrigido em `scripts/restore-audit-chain-proof.ts` (3/3 PASS); F-04 mitigado com `npm run test:e2e:prepare`; F-05/F-06 documentados no runbook 0803. Falta: HISO-005 tornar `boundary:products` viável (com o Fable)                                                                                                                                                      |

## 7. Decisões do usuário — 16/10/2026

Registro completo: [production-0374.json](../04_audit/evidence/USER-DECISIONS-20261016/production-0374.json). A produção do núcleo segue separada da paridade (D7 do [roadmap 0379](0379_roadmap_paridade_100_deepseek.md)).

| Item          | Decisão                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 destino    | Servidor no hospital (on-premises), Docker Compose e PostgreSQL local. Substitui o padrão de VM em nuvem do runbook 0805, que precisa ser revisto |
| C4 cofre      | HashiCorp Vault auto-hospedado no servidor, com unseal e backup do próprio cofre documentados                                                     |
| C5 acesso     | Console só na rede interna, com VPN para acesso remoto; túnel de saída expõe apenas as rotas de webhook assinadas                                 |
| C6 backup     | Dump local e no TrueNAS; papel só de backup com `BYPASSRLS` aceito (G3); snapshots ZFS somente leitura; risco residual: sem cópia fora do prédio  |
| C7 e G1       | Logs, `/ready`, heartbeat e alerta valem como evidência; métricas autenticadas viram cartão futuro                                                |
| C8 identidade | Token interno assinado só para o ensaio; IdP corporativo OIDC com MFA (D-09) antes do uso pela equipe, provedor a escolher                        |
| C9 e G6       | Imagem no GitHub Container Registry privado, baixada pelo digest certificado                                                                      |
| A2            | Allowlist do gitleaks por caminho, restrita aos caminhos triados; aplicação em tarefa própria, com autorização explícita do usuário               |
| A3            | Alerta no Telegram do gestor, por receptor que verifica a assinatura HMAC                                                                         |
| G7            | Rotação do segredo de webhook por corte coordenado                                                                                                |
| B5            | Aprovado na revisão humana T3; pendentes a primeira execução real no GitHub Actions e a comprovação do check obrigatório do produto               |

Executado no mesmo dia ([resolução](../04_audit/evidence/RESOLVE-20261016/README.md)): runbook 0805 e `deploy/harness/` adaptados ao servidor local (`compose.onprem.yaml`, Vault, túnel, espelho no TrueNAS), receptor do Telegram com testes, allowlist A2 aplicada e verificada. Decisões delegadas: Keycloak no servidor como IdP com MFA antes do uso pela equipe, dois operadores sintéticos no ensaio, cópia fora do prédio recomendada. Próximo passo da trilha: preparar o servidor (Vault, bot, túnel, TrueNAS, certificado, GHCR), reauditoria B6 pelo Codex e depois C2–C10 no servidor.

## Reconciliação documental de B5 — 17/10/2026

A autoridade vigente é `decisions.B5_HISO010` do [recibo de16/10](../04_audit/evidence/USER-DECISIONS-20261016/production-0374.json). O estado canônico da tarefa continua em [HISO-010/0370](0370_harness_product_isolation_backlog.md#hiso-010--definir-ci-e-barras-por-artefato). Revisão T3 aprovada não comprova execução real do CI, check obrigatório do produto ou as demais obrigações do cartão. Não houve consulta/execução remota nesta reconciliação. Produção, candidata e identidade do artefato mantêm seus gates próprios. [Plano0388](0388_documentation_isolation_reconciliation.md).

## 8. Cartões do servidor do hospital (0393) — 22/10/2026

Lacunas que a [0393](0393_servidor_hospital_requisitos_e_instalacao.md) (task `HOSPITAL-SERVER-0393-20261021`) achou ao medir a pilha on-prem e que o repositório não cobre. `TODO` é trabalho registrado, não BUILD autorizado: cada cartão abre task e claim próprios. Dono é papel sugerido. Os cartões amplos da [0367](0367_program_backlog_reaudit_2026-09-30.md) (UP91-029 e UP91-035 a UP91-037) continuam valendo; estes são as fatias do servidor do hospital. Evidência: [`HOSPITAL-SERVER-0393-20261021/`](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/sizing-measurements.json). Produção do núcleo continua `NO_GO` até C10.

| Cartão                    | Estado | Ação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Dono sugerido                                                                                     | Risco e gate                                                                                                                                                        | Aceite                                                                                                                                                                                                                           |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="srv-01"></a>SRV-01 | TODO   | **Monitor externo do núcleo com receptor com recibo.** Monitor na segunda máquina que consulta `https://<nome-interno>/ready` e avisa quando host, API ou rede caem, por um receptor que devolve recibo (`{receiptId, payloadSha256}`) e repassa ao Telegram. Hoje o alerta de parada roda dentro da API, e o `alert-relay` responde só `{outcome}` e só escuta na rede do compose. O monitor do produto serve de referência, sem import pelo núcleo (ADR-010). Origem: [0393, fase 13](0393_servidor_hospital_requisitos_e_instalacao.md#fase-13--monitor-externo), [ensaio do alerta](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/alert-drill.txt)                                                                                | Claude (SPEC e BUILD); TI do hospital (segunda máquina)                                           | P1: queda do host, da API ou da internet não chega a ninguém. T2: SPEC curta do contrato monitor–receptor, dos limiares e do segredo do receptor no Vault           | Desligar o servidor ou parar a API gera alerta no Telegram pelo receptor, com recibo conferido e dentro do limiar aprovado; a volta gera `resolved`; ensaio registrado em `docs/04_audit/evidence/`                              |
| <a id="srv-02"></a>SRV-02 | TODO   | **Falha do backup vira alerta.** Unidade `cvg-harness-notify@.service` e `OnFailure=cvg-harness-notify@%n.service` em `cvg-harness-backup.service` e `cvg-harness-restore-drill.service` (hoje a linha está comentada e a unidade não existe), com envio ao Telegram e o token lido de arquivo `0600`, nunca de argumento. Origem: [0393, fase 11, passo 5](0393_servidor_hospital_requisitos_e_instalacao.md#fase-11--backup-e-restore-de-prova), [eventos do backup](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/backup-restore-events.txt)                                                                                                                                                                                       | Claude (BUILD em `deploy/harness/backup/`); usuário (bot e grupo)                                 | P1: backup quebrado passa despercebido; até lá, `journalctl` todo dia útil. T2, com task própria; sem mudança na API                                                | Falha induzida (espelho do TrueNAS desmontado; ensaio de restore contra âncora errada) gera mensagem no Telegram com unidade e horário, sem segredo nem dado; execução com sucesso não notifica                                  |
| <a id="srv-03"></a>SRV-03 | TODO   | **Snapshot diário do Vault e política humana com MFA.** Política do Vault só com leitura de `sys/storage/raft/snapshot`, AppRole próprio e timer systemd diário que grava em `/mnt/truenas/cvg-harness/vault-snapshots` com retenção; política de administrador humano com MFA (TOTP) no login, para não usar o token raiz depois da configuração. Hoje o snapshot é manual, com token de administrador. Origem: [0393, fase 6, passo 5](0393_servidor_hospital_requisitos_e_instalacao.md#fase-6--vault), [passos do Vault](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/vault-steps.txt)                                                                                                                                           | Claude (artefatos em `deploy/harness/vault/`); usuário e guardiões (aprovar as políticas e o MFA) | P1: perder o Vault sem snapshot recente obriga a gerar e redistribuir todos os segredos. T3: política de segurança e autenticação, com revisão explícita do usuário | O timer roda e o arquivo do dia tem mais de zero bytes no dataset; o snapshot restaurado num Vault descartável abre com duas partes; o token do snapshot não lê `secret/`; login humano sem MFA é recusado                       |
| <a id="srv-04"></a>SRV-04 | TODO   | **Egress separado por contêiner.** IP fixo (`ipv4_address`) ou rede com bridge nomeada para `alert-relay` e `tunnel`, e a regra `container_egress` do `cvg-host.nft` restrita a eles: 443 só para `alert-relay` e `tunnel`, 7844 só para `tunnel`. Hoje a regra 443 vale para toda a rede do compose, inclusive `api`, `worker` e `postgres`. Origem: [0393, fase 2](0393_servidor_hospital_requisitos_e_instalacao.md#fase-2--firewall-nftables-com-contadores), [`cvg-host.nft`](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/tools/cvg-host.nft), [validação](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/nft-validate.log)                                                                                                | Claude (compose, `.env.example` e `cvg-host.nft`)                                                 | P2: um contêiner do núcleo comprometido alcança a internet pela 443. T2: mudança no compose, com task própria                                                       | `hc config` válido; com as regras carregadas, a sonda a `api.telegram.org:443` falha a partir de `api`, `worker` e `postgres` e conecta a partir do `alert-relay`; o `tunnel` registra conexão pela 7844; contadores registrados |
| <a id="srv-05"></a>SRV-05 | TODO   | **Imagens de `postgres` e `cloudflared` por digest e espelhadas.** `CVG_HARNESS_LOCAL_PG_IMAGE` usa a tag `postgres:16-alpine` no compose e no `.env.example`; `CVG_BACKUP_PG_IMAGE` já exige digest e `CVG_HARNESS_TUNNEL_IMAGE` pede digest, mas o exemplo traz digest zerado, e as três vêm do Docker Hub. Fixar as três por digest e espelhá-las no GHCR privado (mesmo token de leitura do Vault) ou liberar o Docker Hub na borda. Origem: [0393, fase 7](0393_servidor_hospital_requisitos_e_instalacao.md#fase-7--segredos-no-vault-e-render-envsh), [imagens medidas](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/sizing-measurements.json)                                                                                    | Claude (pins e espelho); usuário e TI do hospital (GHCR ou Docker Hub)                            | P2: tag móvel troca o banco sem revisão; sem saída para o Docker Hub, `hc pull` falha. T2, depois da decisão da origem (0393, seção 4)                              | `hc config` mostra `@sha256:` em todas as imagens; `hc pull` no servidor passa só com as origens liberadas; atualizar a base é trocar um digest com revisão                                                                      |
| <a id="srv-06"></a>SRV-06 | TODO   | **Build não reprodutível byte a byte (limite registrado).** Três builds do commit `24cdb463` deram três digests para `runtime` e três para `web`; o servidor só baixa o digest do CI e nunca constrói. Investigar as fontes de variação (datas de arquivos e camadas, `SOURCE_DATE_EPOCH`, metadados do BuildKit, `npm ci`) e decidir entre build reprodutível e identidade pelo digest do CI com proveniência ([SPEC0253](../02_spec/0253_release_image_ghcr.md), [UP91-035](0367_program_backlog_reaudit_2026-09-30.md#up91-035)). Origem: [0393, fase 0](0393_servidor_hospital_requisitos_e_instalacao.md#fase-0--antes-de-ir-ao-hospital), [digests medidos](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/sizing-measurements.json) | Claude (investigação); usuário (aceitar o limite ou exigir reprodutibilidade)                     | P3: sem confiar no CI, um terceiro não confirma que o digest saiu do commit; a proveniência da SPEC0253 mitiga. T2, depois da primeira publicação da SPEC0253       | Dois builds limpos do mesmo commit no CI dão o mesmo digest, ou decisão registrada que aceita o limite e aponta a proveniência do CI como prova                                                                                  |
