# 0393 — Servidor do hospital: requisitos de compra e roteiro de instalação

- Data: 21–22/10/2026. Task: `HOSPITAL-SERVER-0393-20261021` (Claude Code, CONT-20261018-D9EF).
- Pedido do usuário: o servidor "ainda não existe"; preparar requisitos de compra e roteiro de instalação para quando chegar ([decisão de 21/10](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/user-decision-20261021.json)).
- Base: decisões de 16/10 ([production-0374.json](../04_audit/evidence/USER-DECISIONS-20261016/production-0374.json)), decisões delegadas ([RESOLVE-20261016](../04_audit/evidence/RESOLVE-20261016/README.md)), [`deploy/harness/`](../../deploy/harness/README.md), [plano 0374](0374_plano_producao_harness.md), [runbook 0805](../08_runtime/0805_runbook_ambiente_real.md) e itens de ambiente real da [0392](0392_aud0621_remediation.md).
- Números: cada requisito cita um fato do repositório ou uma medição desta task. As medições estão em [`HOSPITAL-SERVER-0393-20261021/`](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/sizing-measurements.json).
- Estado: nada foi comprado nem instalado. Produção do núcleo continua `NO_GO` até o parecer C10. Este documento não autoriza deploy, dado real nem publicação de imagem.

Quem compra ou cuida da TI do hospital lê a seção 1. Quem instala lê as seções 3 a 5.

## 1. Resumo para compra

| Item                | Requisito                                                                                                                 | Por quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Processador         | x86-64, **6 núcleos físicos / 12 threads** no mínimo                                                                      | Os limites do compose somam 5,0 vCPU (5,5 durante a migração). O pico medido foi 1,3 CPU com a carga máxima que a API aceita de uma origem. Os threads restantes ficam para SO, Vault, backup, ensaio de restore e o Keycloak futuro, que não têm limite no repositório. A imagem foi construída e medida em amd64.                                                                                                                                                                                               |
| Memória             | **16 GB**, ECC recomendado                                                                                                | Limites do compose: 3,6 GiB. Keycloak medido: 1,05 GiB. Vault: 41 MiB. Assistente de Plantão, se rodar aqui: 512 MiB. Soma: 5,2 GiB. Uso medido no pico: 0,27 GiB. Sobram cerca de 9,7 GiB para SO, cache de disco, o PostgreSQL descartável do ensaio de restore e o crescimento do banco.                                                                                                                                                                                                                       |
| Disco               | **2 × SSD de 960 GB**, classe servidor (com proteção contra queda de energia), em **RAID 1**                              | Medido: 17,9 kB por mensagem no banco e 1,6 kB no dump. Com 36 dumps guardados (retenção de 35 dias) e um restore de ensaio por mês, cada mensagem acumulada ocupa cerca de 95 kB. Com 24 GB fixos, 960 GB guardam cerca de 9,9 milhões de mensagens. O volume do hospital ainda é desconhecido (seção 2.4). RAID 1 é recomendação desta proposta, não exigência das decisões: banco, dumps locais e Vault ficam no mesmo disco. O que o repositório exige é guardar as âncoras do backup em outro disco ou host. |
| Rede                | 1 porta Ethernet cabeada, IP fixo numa VLAN de servidores                                                                 | Entrada: 443 e 80 só da VLAN interna e da VPN (decisão C5); SSH só das estações de administração. Saída: DNS, NTP, NFS do TrueNAS, HTTPS e 7844 TCP/UDP do túnel (seção 3, fase 2). Tráfego medido: 3,6 kB por webhook.                                                                                                                                                                                                                                                                                           |
| Sistema operacional | **Ubuntu Server 24.04 LTS** (alternativa equivalente: Debian 12)                                                          | A medição rodou em base Ubuntu 24.04 com Docker 29.1.3 e Compose 2.40.3. O deploy exige Compose ≥ 2.24, systemd (timers de backup), nftables, `jq` e a CLI do Vault.                                                                                                                                                                                                                                                                                                                                              |
| Energia             | UPS para servidor, TrueNAS e switch, com sinal de desligamento automático (USB ou rede)                                   | Depois de um reinício o Vault fica selado até duas pessoas fazerem o unseal. Queda sem desligamento limpo arrisca o banco. A autonomia sai do consumo do servidor escolhido.                                                                                                                                                                                                                                                                                                                                      |
| Monitor externo     | **Segunda máquina** Linux com Docker, ligada 24 h, fora do servidor (outro circuito ou UPS, se possível)                  | Um monitor no mesmo host não avisa que o host caiu. O contêiner do monitor do produto, o único do repositório, usa 0,25 CPU, 128 MiB e 32 processos; a imagem ocupa 329 MB. O monitor do núcleo ainda não existe (seção 4).                                                                                                                                                                                                                                                                                       |
| TrueNAS             | Datasets ZFS criptografados, NFS só para o IP do servidor, snapshot periódico que o servidor não apaga, quota por dataset | Quota dos backups ≥ (36 + dias de snapshot) × tamanho do último dump. Exemplo: 1 milhão de mensagens e 30 dias de snapshot pedem 108 GB. Datasets separados para snapshots do Vault e para as âncoras do backup.                                                                                                                                                                                                                                                                                                  |

O hospital precisa fornecer:

- nome DNS interno do servidor e certificado TLS desse nome (AC interna ou domínio do CVG com DNS-01);
- IP fixo, faixas da VLAN interna e da VPN, servidores DNS e NTP, regras no firewall de borda;
- TrueNAS com datasets, export NFS, quota e tarefa de snapshot;
- conta do Telegram do gestor, bot e grupo que recebem o alerta;
- conta da Cloudflare e o nome público só para webhooks;
- três pessoas que guardam as partes do Vault (duas abrem o cofre);
- a segunda máquina e o UPS.

## 2. De onde vêm os números

### 2.1 Como foi medido

- Pilha local com os dois arquivos do repositório, [`compose.production.yaml`](../../deploy/harness/compose.production.yaml) e [`compose.onprem.yaml`](../../deploy/harness/compose.onprem.yaml), mais um [override só de medição](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/tools/override.yaml) (nome de rede próprio, PostgreSQL em `127.0.0.1:56271`, `api.telegram.org` apontado para loopback). Imagens construídas do commit `24cdb463` pelos alvos `runtime` e `web` do `Dockerfile`. Dados sintéticos.
- Máquina: Ryzen 7 5700 (8 núcleos/16 threads), 62 GiB, Linux Mint 22.3 (base Ubuntu 24.04), compartilhada com outros projetos (load average 5 a 7 antes da medição). Os números de CPU são indicativos.
- Carga: 3 rodadas de 280 webhooks assinados pelo proxy TLS, concorrência 20, 90 s entre rodadas. São 280 porque a API aceita 300 requisições por minuto por IP de origem (`apps/api/src/server.ts`). `docker stats` a cada 3 s, aproximadamente.
- O gate `load` (`npm run test:load`) também rodou: 10.000 eventos, 907 eventos/s, 178 MB de memória. Ele mede o contrato do outbox em memória e, pelo [runbook 0803](../08_runtime/0803_runbook_gates_locais.md), não é benchmark. Não serve para dimensionar o servidor.
- Vault 2.2.0 (raft, TLS) e Keycloak 26.8.1 (modo dev) foram medidos parados.

### 2.2 CPU e memória por serviço

CPU em núcleos lógicos (1,0 = um núcleo inteiro).

| Grupo                     | Serviço                          | Limite CPU | Limite RAM | Pico CPU medido             | Pico RAM medido |
| ------------------------- | -------------------------------- | ---------- | ---------- | --------------------------- | --------------- |
| Núcleo                    | `api`                            | 1,0        | 512 MiB    | 0,46                        | 73 MiB          |
| Núcleo                    | `worker`                         | 1,0        | 512 MiB    | 0,41                        | 68 MiB          |
| Núcleo                    | `postgres`                       | 2,0        | 2 GiB      | 0,82                        | 108 MiB         |
| Núcleo                    | `migrate` (a cada `up`)          | 0,5        | 256 MiB    | termina em segundos         | —               |
| Apoio                     | `proxy`                          | 0,5        | 128 MiB    | 0,05                        | 24 MiB          |
| Apoio                     | `alert-relay`                    | 0,25       | 128 MiB    | 0,08                        | 15 MiB          |
| Apoio                     | `tunnel`                         | 0,25       | 128 MiB    | não medido (sem conta)      | —               |
| Apoio                     | Vault                            | sem limite | sem limite | 0,003 parado                | 41 MiB parado   |
| Apoio                     | `backup.sh` / `restore-drill.sh` | sem limite | sem limite | 5,7 s / 19,5 s por execução | —               |
| Futuro                    | Keycloak (IdP com MFA)           | sem limite | sem limite | 0,002 parado                | 1,05 GiB parado |
| Produto, se no mesmo host | Assistente de Plantão            | 1,0        | 512 MiB    | não medido aqui             | —               |

Totais: os limites de núcleo e apoio somam 5,0 vCPU e 3,4 GiB (5,5 vCPU e 3,6 GiB com o `migrate`). No pico, a pilha inteira usou 1,29 CPU e 273 MiB ao mesmo tempo; parada, 0,03 CPU e 191 MiB. O Keycloak rodou com H2 embutido e sem limite de memória; a JVM dimensiona a memória pelo que enxerga, então o número de produção precisa ser medido de novo quando a SPEC do IdP existir.

### 2.3 Vazão

- A API recebeu 57 a 87 webhooks por segundo em rajada, todos com 200; p95 de 372 a 1.718 ms.
- Teto de admissão: 300 requisições por minuto por IP de origem. Os webhooks que chegam pelo túnel saem do mesmo contêiner e dividem essa cota. O excedente recebe 429 e o emissor precisa reenviar.
- O worker processou 4,8 a 6,7 mensagens por segundo, uma por vez. A CPU dele não passou de 41% de um núcleo: mais núcleos não aumentam essa vazão. Ela fica perto da cota de uma origem (300 por minuto = 5 por segundo); na terceira rodada ficou um pouco abaixo (4,8 por segundo), então uma rajada longa no teto acumula fila, que o worker drena depois.

### 2.4 Disco

Parte fixa:

| Componente                                                                                                                               | Tamanho            | Fonte                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------- |
| SO, pacotes e Docker                                                                                                                     | 20 GB              | folga desta proposta; o repositório não fixa |
| Imagens: núcleo 319 MB e web 75 MB (duas versões cada, para rollback), postgres 420 MB, cloudflared 99 MB, Vault 762 MB, Keycloak 752 MB | 2,8 GB             | medido (`docker images`)                     |
| Logs dos contêineres: 10 MB × 5 arquivos × 7 serviços                                                                                    | 350 MB             | `x-logging` do compose                       |
| WAL do PostgreSQL                                                                                                                        | até cerca de 1 GB  | medido: `max_wal_size = 1GB`                 |
| Banco recém-migrado (sem WAL) e dados do Vault                                                                                           | 36 MB + 34 MB      | medido                                       |
| **Total fixo**                                                                                                                           | **cerca de 24 GB** |                                              |

Parte que cresce, por mensagem (turno sintético `record.update` com aprovação):

- banco: 17.935 bytes (6 linhas de auditoria, 1 de outbox, 1 de aprovação);
- dump `pg_dump --format=custom`: 1.635 bytes;
- escrita do PostgreSQL no disco: cerca de 252 kB (WAL e checkpoints), baixa para qualquer SSD.

O banco não tem purga (cartão [UP91-031](0367_program_backlog_reaudit_2026-09-30.md#up91-031), ainda proposto), então o crescimento é acumulado. Para N mensagens acumuladas:

```text
disco local ≈ 24 GB + N × (2 × 17,9 kB + 36 × 1,6 kB) ≈ 24 GB + N × 95 kB
```

Os três termos são o banco, a cópia temporária do banco no ensaio mensal de restore e os 36 dumps diários guardados (`CVG_BACKUP_RETENTION_DAYS=35`). Com 960 GB cabem cerca de 9,9 milhões de mensagens; com 1,92 TB, cerca de 20 milhões.

O volume do hospital é `UNKNOWN` no [PRD 0014](../01_prd/0014_up91_platform_prd_reconciliation.md). A tabela abaixo usa volumes ilustrativos, não estimativas:

| Mensagens por dia                      | Tempo até encher 960 GB |
| -------------------------------------- | ----------------------- |
| 1.000                                  | 27 anos                 |
| 5.000                                  | 5,4 anos                |
| 10.000                                 | 2,7 anos                |
| 50.000                                 | 198 dias                |
| 432.000 (teto de uma origem, 24 h/dia) | 23 dias                 |

Usando 5 anos como referência de vida útil (premissa desta proposta, não do repositório): se o hospital estimar mais de 5.000 mensagens por dia, comprar 2 × 1,92 TB. Em 22/10 o usuário estimou até 5.000 mensagens por dia, então ficam os 2 × 960 GB. Depois da instalação, refazer a conta todo mês com o tamanho real do último dump. As mensagens medidas são curtas e sintéticas; mensagens reais podem custar mais.

### 2.5 TrueNAS

O espelho guarda os mesmos 36 conjuntos. Um conjunto apagado continua no snapshot ZFS até o snapshot expirar. Com S dias de retenção de snapshot:

```text
quota dos backups ≥ (36 + S) × dump, com dump ≈ 0,29 MB + 1,6 kB × N
```

| Mensagens acumuladas                   | Dump    | Quota com S = 30 |
| -------------------------------------- | ------- | ---------------- |
| 1 milhão                               | 1,6 GB  | 108 GB           |
| 9,9 milhões (servidor de 960 GB cheio) | 16,2 GB | 1,07 TB          |

Snapshot do Vault: 26 kB por dia (medido). Âncoras: cerca de 1,2 kB por conjunto. Copiar um dump de 16 GB a 1 Gb/s leva cerca de 2 minutos.

## 3. Roteiro de instalação

Convenções:

- `<nome-interno>`: nome DNS do servidor na rede do hospital; `<ip-servidor>`: IP fixo dele; `<sha>`: commit certificado; `<org>/<repo>` e `<digest>`: imagem publicada pelo CI no GHCR.
- Atalho do compose no servidor, sempre com os dois arquivos ([README do deploy](../../deploy/harness/README.md)):

```sh
hc() { sudo docker compose -f /opt/cvg-harness/deploy/harness/compose.production.yaml \
  -f /opt/cvg-harness/deploy/harness/compose.onprem.yaml \
  --env-file /etc/cvg-harness/harness.env "$@"; }
```

- Não exportar variáveis do `harness.env` no shell: o compose dá precedência ao ambiente sobre o `--env-file`.
- "Medido" indica que o passo foi ensaiado nesta task com dados sintéticos e a saída esperada veio do ensaio.

### Fase 0 — Antes de ir ao hospital

| #   | Ação                                                                                                                              | Verificação esperada                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Ter as imagens `runtime` e `web` publicadas no GHCR pela `main`, com digest (G6; SPEC0253 em andamento, sem publicação até agora) | `docker buildx imagetools inspect ghcr.io/<org>/<repo>@<digest>` responde. Sem digest o compose recusa: `required variable CVG_HARNESS_IMAGE_DIGEST is missing a value` |
| 0.2 | Registrar o SHA certificado que acompanha o digest                                                                                | Mesmo SHA no registro do CI e no checkout do servidor (fase 4)                                                                                                          |
| 0.3 | Conferir a seção 4 deste documento                                                                                                | Todo item "fornecer" marcado; os que ficarem em aberto bloqueiam só a fase que depende deles                                                                            |

Não construir a imagem no servidor. Nesta task, três builds do mesmo commit deram três digests diferentes; só o digest do CI vale.

### Fase 1 — Preparar o host

1. **Instalar** Ubuntu Server 24.04 LTS com OpenSSH, os dois SSDs em RAID 1 (no instalador ou na controladora).
   Esperado: `cat /proc/mdstat` mostra `[UU]` (RAID por software) ou a ferramenta da controladora mostra o volume íntegro.
2. **Administrador nominal com chave SSH**, sem senha e sem root pelo SSH:

   ```sh
   printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' \
     | sudo tee /etc/ssh/sshd_config.d/10-cvg.conf
   sudo sshd -t && sudo systemctl reload ssh
   sudo sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
   ```

   Esperado: os três valores `no`. Testar o login por chave numa segunda sessão antes de fechar a primeira.

3. **Atualizar** e ligar as atualizações de segurança sem reinício automático (reiniciar sela o Vault):

   ```sh
   sudo apt update && sudo apt full-upgrade -y
   sudo apt install -y unattended-upgrades
   grep -R 'Automatic-Reboot "' /etc/apt/apt.conf.d/
   ```

   Esperado: `apt list --upgradable` vazio e `Unattended-Upgrade::Automatic-Reboot "false";`. Reinícios ficam para janela combinada com os guardiões do Vault.

4. **Relógio**: NTP do hospital e fuso UTC (os timers de backup estão em UTC).

   ```sh
   sudo timedatectl set-timezone UTC
   sudo sed -i 's/^#\?NTP=.*/NTP=<servidor-ntp>/' /etc/systemd/timesyncd.conf && sudo systemctl restart systemd-timesyncd
   timedatectl
   ```

   Esperado: `System clock synchronized: yes`. O relay recusa alerta com mais de 5 minutos de diferença e a API recusa webhook fora da janela de 300 s (`apps/api/src/webhook-security.ts`).

5. **Pacotes do deploy**: `sudo apt install -y jq nftables nfs-common git curl`.
   Esperado: `command -v jq nft mount.nfs4 flock mountpoint sha256sum git` lista todos.
6. **Conta de backup e diretórios** (o UID é combinado com o TrueNAS na fase 5):

   ```sh
   sudo useradd --system --uid <uid-combinado> --home-dir /var/lib/cvg-harness \
     --shell /usr/sbin/nologin cvg-backup
   sudo install -d -m 0755 /var/lib/cvg-harness /var/lib/cvg-harness/acme
   sudo install -d -m 0700 /var/lib/cvg-harness/postgres
   sudo install -d -o cvg-backup -g cvg-backup -m 0700 /var/backups/cvg-harness/sets \
     /var/lib/cvg-harness/restore-drills
   sudo install -d -o root -g cvg-backup -m 0750 /etc/cvg-harness
   ```

   Esperado: `stat -c '%U:%G %a %n'` mostra os donos e modos acima. O diretório `acme` precisa existir mesmo sem ACME: o compose monta esse caminho e falha se ele faltar.

### Fase 2 — Firewall nftables com contadores

O exemplo [`cvg-host.nft`](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/tools/cvg-host.nft) foi derivado do compose e da [prova de egress do produto](../04_audit/evidence/AUD0621-PRODUCT-PISO008-20261021/image/infra-egress-proof.json):

- entrada: SSH só das estações de administração; 80 e 443 publicados pelo proxy só para a VLAN interna e a VPN (filtro em `prerouting`, antes do DNAT do Docker);
- saída dos contêineres: tráfego interno da rede do compose; 443 para fora; 7844 TCP/UDP para o túnel; bloqueio de redes privadas, metadados de nuvem e IPv6;
- saída do host: DNS, NTP, NFS (2049) do TrueNAS, 80 e 443 (GHCR, Docker Hub, GitHub, repositórios do Ubuntu, Docker e HashiCorp).

A porta 7844 TCP/UDP para `region1.v2.argotunnel.com` e `region2.v2.argotunnel.com` vem da documentação da Cloudflare ([Tunnel with firewall](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/tunnel-with-firewall/), fonte externa consultada em 22/10/2026). O nftables não filtra por nome de domínio: restringir a saída 443 a GHCR, Docker Hub, GitHub, Telegram e repositórios é tarefa do firewall de borda ou de um proxy do hospital.

O arquivo passou em `nft -c` e foi carregado duas vezes num namespace descartável, com 20 contadores ([registro](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/nft-validate.log)). Ele não foi aplicado em nenhum host.

1. **Preencher** os `define` (IP do servidor, faixas da VLAN e da VPN, administração, DNS, NTP, TrueNAS, `CVG_HARNESS_NET_SUBNET`) e instalar sem `flush ruleset`, que apagaria as regras do Docker:

   ```sh
   sudo install -d /etc/nftables.d
   sudo install -m 0644 cvg-host.nft /etc/nftables.d/cvg-host.nft
   printf '#!/usr/sbin/nft -f\ninclude "/etc/nftables.d/*.nft"\n' | sudo tee /etc/nftables.conf
   sudo nft -c -f /etc/nftables.conf && echo CHECK_OK
   ```

   Esperado: `CHECK_OK`.

2. **Aplicar com desarme automático**, para não perder o SSH:

   ```sh
   sudo systemd-run --on-active=10min --unit cvg-nft-rollback nft delete table inet cvg_host
   sudo nft -f /etc/nftables.conf
   # abrir uma segunda sessão SSH; se entrar:
   sudo systemctl stop cvg-nft-rollback.timer && sudo systemctl enable nftables
   ```

   Esperado: a segunda sessão entra; `sudo nft list table inet cvg_host` mostra os contadores.

3. **Provar os contadores** depois da fase 9 (pilha no ar):

   ```sh
   probe='const s=require("net").connect({host:process.argv[1],port:+process.argv[2],timeout:5000});s.on("connect",()=>{console.log("CONNECTED");process.exit(0)});s.on("timeout",()=>{console.log("TIMEOUT");process.exit(1)});s.on("error",e=>{console.log(e.code);process.exit(1)})'
   hc exec -T api node -e "$probe" <ip-truenas> 2049          # rede privada: TIMEOUT
   hc exec -T alert-relay node -e "$probe" api.telegram.org 443 # saída permitida: CONNECTED
   sudo nft list chain inet cvg_host container_egress
   ```

   Esperado: `TIMEOUT` no primeiro, `CONNECTED` no segundo, e o contador da regra de redes privadas e o da regra 443 aumentam. De uma máquina fora das faixas permitidas, `curl -m 5 https://<ip-servidor>` falha e o contador de `published_guard` aumenta.

Limite: a rede do compose não fixa IP nem nome de bridge para `alert-relay` e `tunnel`, então a regra 443 vale para todos os contêineres dela, inclusive `api`, `worker` e `postgres` (seção 5).

### Fase 3 — Docker e Compose

1. **Instalar** Docker Engine e Compose: `sudo apt install -y docker.io docker-compose-v2` (os pacotes do Ubuntu usados na medição: `docker.io 29.1.3`, `docker-compose-v2 2.40.3`, `containerd 2.2.1`). O repositório oficial da Docker também serve.
   Esperado: `docker compose version` ≥ 2.24 (o override usa `!reset`) e `sudo nft list tables` mostra as tabelas do Docker e `inet cvg_host`.
2. **Grupo `docker`** só para a operação e para `cvg-backup` (o grupo equivale a root).
   Esperado: `getent group docker` lista só essas contas.

### Fase 4 — Checkout, TLS do proxy e arquivos fixos

1. **Checkout no SHA certificado** em `/opt/cvg-harness` (os arquivos de `deploy/harness/` são montados de lá):

   ```sh
   sudo git clone <url-do-repositorio> /opt/cvg-harness
   sudo git -C /opt/cvg-harness checkout --detach <sha>
   git -C /opt/cvg-harness rev-parse HEAD; git -C /opt/cvg-harness status --porcelain
   ```

   Esperado: o `<sha>` e `status` vazio.

2. **Certificado do proxy** para `<nome-interno>`, emitido pela AC interna (ou domínio do CVG com DNS-01):

   ```sh
   sudo install -d -m 0755 /etc/cvg-harness/tls
   sudo install -m 0644 fullchain.pem /etc/cvg-harness/tls/fullchain.pem
   sudo install -o 101 -g 101 -m 0400 privkey.pem /etc/cvg-harness/tls/privkey.pem
   sudo install -m 0644 /dev/null /etc/cvg-harness/db-ca.pem
   openssl x509 -in /etc/cvg-harness/tls/fullchain.pem -noout -subject -ext subjectAltName -enddate
   ```

   Esperado: o SAN contém `<nome-interno>`. A chave pertence ao uid 101 porque o nginx-unprivileged roda como 101. O `db-ca.pem` vazio é exigido pelo arquivo base e não é usado no servidor local.

### Fase 5 — TrueNAS

1. **No TrueNAS** (TI do hospital): datasets `cvg-harness/backups`, `cvg-harness/anchors` e `cvg-harness/vault-snapshots`, com criptografia nativa ZFS; dono com o mesmo UID de `cvg-backup`; export NFS só para `<ip-servidor>`, sem root; tarefa de snapshot periódico; quota da seção 2.5.
   Esperado: a conta do servidor não administra o TrueNAS e não apaga snapshot.
2. **Montar no servidor**:

   ```sh
   sudo install -d /mnt/truenas/cvg-harness/backups /mnt/truenas/cvg-harness/anchors /mnt/truenas/cvg-harness/vault-snapshots
   echo '<truenas>:/mnt/<pool>/cvg-harness/backups /mnt/truenas/cvg-harness/backups nfs4 _netdev,nofail,hard 0 0' | sudo tee -a /etc/fstab
   # idem para anchors e vault-snapshots
   sudo systemctl daemon-reload && sudo mount -a
   mountpoint /mnt/truenas/cvg-harness/backups
   ```

   Esperado: `is a mountpoint` nos três caminhos.

3. **Teste de escrita** como a conta do backup:

   ```sh
   sudo -u cvg-backup sh -c 'f=/mnt/truenas/cvg-harness/backups/.probe; head -c 1048576 /dev/urandom > "$f" && a=$(sha256sum < "$f") && sync && b=$(sha256sum < "$f") && [ "$a" = "$b" ] && rm "$f" && echo WRITE_OK'
   ```

   Esperado: `WRITE_OK` e o contador da regra 2049 aumenta.

### Fase 6 — Vault

Ensaiado nesta task com Vault 2.2.0 em contêiner, raft e TLS ([passos](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/vault-steps.txt), [configuração](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/tools/vault.hcl)). No servidor, a proposta é o pacote oficial da HashiCorp, que traz o servidor e a CLI exigida por `render-env.sh`.

1. **Instalar** pelo repositório apt da HashiCorp e fixar a versão.
   Esperado: `vault version`.
2. **TLS local**: certificado para `127.0.0.1` emitido pela AC interna (ou autoassinado com a AC em `VAULT_CACERT`); listener só em `127.0.0.1:8200`; armazenamento raft; mesma configuração da medição, com `address = "127.0.0.1:8200"`.
   Esperado: `sudo systemctl enable --now vault`; `vault status` sai com código 2, `Initialized false`, `Sealed true`.
3. **Iniciar com Shamir 2 de 3**, com os três guardiões presentes:

   ```sh
   export VAULT_ADDR=https://127.0.0.1:8200 VAULT_CACERT=<ac-do-vault>
   vault operator init -key-shares=3 -key-threshold=2
   vault operator unseal   # guardião 1
   vault operator unseal   # guardião 2
   ```

   Esperado (medido): com uma parte, `Sealed true`; com duas, `Sealed false`. Cada parte fica só com o seu guardião, nunca no servidor. O token raiz serve só para a configuração e é revogado ao final (`vault token revoke -self`).

4. **KV v2, política do repositório e AppRole**:

   ```sh
   read -rs VAULT_TOKEN && export VAULT_TOKEN   # token raiz, só nesta sessão
   vault secrets enable -path=secret kv-v2
   vault policy write cvg-harness-deploy /opt/cvg-harness/deploy/harness/vault/cvg-harness-policy.hcl
   vault auth enable approle
   vault write auth/approle/role/cvg-harness-deploy token_policies=cvg-harness-deploy \
     token_ttl=15m token_max_ttl=30m secret_id_ttl=24h secret_id_num_uses=1
   vault read -field=role_id auth/approle/role/cvg-harness-deploy/role-id | sudo tee /etc/cvg-harness/vault-role-id >/dev/null
   sudo chmod 0600 /etc/cvg-harness/vault-role-id
   ```

   Esperado (medido): com o token do AppRole, `vault kv put` em `secret/cvg-harness/*` responde `permission denied` e a leitura fora de `cvg-harness/*` também. Os TTLs acima são proposta desta task.

5. **Snapshot diário do Vault no TrueNAS**: o repositório não tem a política nem o timer. Enquanto o cartão não existir, rodar à mão depois de cada mudança no cofre, com um token de administrador e gravando como a conta dona do dataset:

   ```sh
   sudo -u cvg-backup --preserve-env=VAULT_ADDR,VAULT_CACERT,VAULT_TOKEN \
     vault operator raft snapshot save /mnt/truenas/cvg-harness/vault-snapshots/vault-$(date -u +%Y%m%dT%H%M%SZ).snap
   ```

   Esperado: arquivo com tamanho maior que zero (26 kB na medição).

6. **Depois de qualquer reinício**: dois guardiões fazem `vault operator unseal` (medido: depois de reiniciar, `Sealed true`). Os contêineres voltam pelo `restart: unless-stopped` do Docker, com o ambiente gravado na criação (não ensaiado com reinício do host); o Vault só é necessário para deploy, rotação e snapshot.

### Fase 7 — Segredos no Vault e `render-env.sh`

1. **Gravar o ambiente** em `secret/cvg-harness/harness` (todas as chaves do [`.env.example`](../../deploy/harness/.env.example), incluindo a seção do servidor no hospital) e em `secret/cvg-harness/backup` (chaves `CVG_BACKUP_*` e as repetidas). Gerar cada segredo pelo stdin, para não aparecer em `ps` ([secrets/README](../../deploy/harness/secrets/README.md)):

   ```sh
   vault kv put -mount=secret cvg-harness/harness POSTGRES_SCHEMA=cvg_data
   openssl rand -hex 32 | vault kv patch -mount=secret cvg-harness/harness WEBHOOK_SIGNING_SECRET=-
   ```

   Valores do servidor local: URLs `postgres://<papel>:<senha>@postgres:5432/cvg` sem `sslmode`; `CVG_STOP_ALERT_WEBHOOK_URL=http://alert-relay:8790/alert`; `CVG_HARNESS_PUBLIC_BIND=<ip-servidor>`; `API_ALLOWED_ORIGINS=https://<nome-interno>`; `CVG_HARNESS_LOCAL_PG_IMAGE` e `CVG_HARNESS_TUNNEL_IMAGE` fixados por digest (o padrão do compose é a tag `postgres:16-alpine`); `CVG_BACKUP_ANCHOR_DIR=/mnt/truenas/cvg-harness/anchors` se a proposta da seção 4 for aceita. Nenhum valor pode conter `$`, porque o compose interpola o arquivo renderizado.

2. **Renderizar** com um `secret_id` de uso único:

   ```sh
   read -rs SECRET_ID
   export VAULT_TOKEN=$(printf '%s' "$SECRET_ID" | vault write -field=token auth/approle/login \
     role_id="$(sudo cat /etc/cvg-harness/vault-role-id)" secret_id=-)
   sudo --preserve-env=VAULT_ADDR,VAULT_CACERT,VAULT_TOKEN \
     /opt/cvg-harness/deploy/harness/vault/render-env.sh harness backup
   sudo stat -c '%a %U %n' /etc/cvg-harness/harness.env /etc/cvg-harness/backup.env
   ```

   Esperado (medido): `{"event":"render_env.rendered","message":"name=harness keys=<n>"}` para cada nome, arquivos `600 root`, nenhum valor impresso.

3. **Conferir o compose**: `hc config -q && echo CONFIG_OK; hc config | grep -c DATABASE_MIGRATION_URL`.
   Esperado (medido): `CONFIG_OK` e `1` (só o `migrate` recebe a credencial DDL).

### Fase 8 — Imagens por digest

```sh
vault kv get -mount=secret -field=GHCR_READ_TOKEN cvg-harness/registry \
  | sudo docker login ghcr.io -u <conta> --password-stdin
hc pull
sudo docker logout ghcr.io
sudo docker image inspect --format '{{json .RepoDigests}}' ghcr.io/<org>/<repo>@<digest>
```

Esperado: `Login Succeeded`, pull sem erro e o digest certificado em `RepoDigests`. O caminho `cvg-harness/registry` é proposta desta task (G6 só diz que o token fica no Vault).

### Fase 9 — PostgreSQL, papéis, migração e subida

1. **Banco**: `hc up -d postgres` e esperar duas consultas reais seguidas (a imagem reinicia uma vez depois do init):

   ```sh
   hc exec -T postgres psql -U postgres -d cvg -tAc 'select 1'
   hc exec -T postgres psql -U postgres -d cvg -tAc 'show data_checksums; select version()'
   ```

   Esperado (medido): `1` duas vezes, `on` e `PostgreSQL 16`.

2. **Papéis** ([postgres/README](../../deploy/harness/postgres/README.md)):

   ```sh
   hc exec -T postgres psql -U postgres -d cvg -X -v database=cvg -v data_schema=cvg_data \
     -v migration_role=cvg_migration -v runtime_role=cvg_runtime -v auth_owner_role=cvg_auth_owner \
     -v session_role=cvg_session -v backup_role=cvg_backup -f /cvg-postgres/roles.sql
   hc exec postgres psql -U postgres -d cvg   # \password para cada um dos cinco papéis, com o valor do Vault
   ```

   Esperado (medido): cinco `CREATE ROLE`, `CREATE SCHEMA` e três `ALTER ROLE`.

3. **Janela de migração e subida**, sem o túnel (ele entra na fase 14):

   ```sh
   hc exec -T postgres psql -U postgres -d cvg -X -c 'GRANT CREATE ON DATABASE cvg TO cvg_auth_owner'
   hc up -d postgres migrate api worker proxy alert-relay
   hc exec -T postgres psql -U postgres -d cvg -X -c 'REVOKE CREATE ON DATABASE cvg FROM cvg_auth_owner'
   hc ps -a; hc logs migrate
   ```

   Esperado (medido, 14 s): `migrate` `Exited (0)` com `migration.operator_auth_applied` e `migration.product_applied ... "runtimeGrants":true`; `api`, `worker`, `proxy` e `alert-relay` `(healthy)`.

4. **Leitura do backup e verificação**: rodar `backup-grants.sql` como `cvg_migration` e `verify-roles.sql` como `cvg_runtime`, com os comandos do [postgres/README](../../deploy/harness/postgres/README.md) trocando a conexão por `hc exec -T postgres psql -U <papel> -d cvg`.
   Esperado ([medido](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/verify-roles.txt)): Q1 com cinco papéis e só `cvg_backup` com `bypassrls=t`; Q2 e Q6 vazias; Q3 `cvg_auth → cvg_auth_owner` e `cvg_data → cvg_migration`; Q4 `db_create=f` para todos; Q8 com 29 migrações e a última `0029_case_assignment_authorization` (no SHA `24cdb463`).
5. **Recusa da credencial DDL**:

   ```sh
   hc run --rm --no-deps -e DATABASE_MIGRATION_URL=postgres://refusal-probe@127.0.0.1:1/refusal_probe api; echo "exit=$?"
   ```

   Esperado (medido): `exit=1` e `"message":"Production serving must not receive DATABASE_MIGRATION_URL"`.

6. **Regra de operação** (medida nesta task, [registro](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/single-service-up.txt)): fora da janela de `GRANT`/`REVOKE`, `hc start <serviço>` e `hc up -d <serviço>` rodam o `migrate` de novo, que falha com `permission denied for database cvg`; com `--force-recreate`, a `api` ficou parada em `Created`. Para mexer num serviço só, usar `hc up -d --no-deps <serviço>` (e `hc restart proxy` depois de recriar a `api`) ou abrir a janela de novo.

### Fase 10 — Prontidão e smoke de produção

1. **Sondas**:

   ```sh
   curl -sS -o /dev/null -w '%{http_code}\n' http://<nome-interno>/live            # 426
   curl -sS -o /dev/null -w '%{http_code}\n' https://<nome-interno>/live           # 200
   curl -sS -o /dev/null -w '%{http_code}\n' https://<nome-interno>/ready          # 200
   curl -sSI https://<nome-interno>/live | grep -i '^strict-transport-security'    # max-age=31536000
   curl -sS -o /dev/null -w '%{http_code}\n' https://<nome-interno>/health/metrics # 404
   hc exec -T api node scripts/runtime-healthcheck.mjs; echo "probe=$?"           # probe=0
   ```

   Esperado (medido): os valores nos comentários.

2. **Digest implantado**, no servidor:

   ```sh
   for s in migrate api worker; do sudo docker inspect --format '{{.Config.Image}}' "$(hc ps -a -q "$s")"; done
   ```

   Esperado: três linhas terminando no digest certificado.

3. **Smoke de produção** ([`scripts/production-target-smoke.ts`](../../scripts/production-target-smoke.ts)) a partir da máquina do operador, com checkout no mesmo SHA, Node 22 e `npm ci`. Os dois tokens são emitidos pelo custodiante da chave ([secrets/README](../../deploy/harness/secrets/README.md#emissor-de-token-de-operador-c8)), valem 5 minutos e uma vez:

   ```sh
   read -rs SMOKE_OPERATOR_A_TOKEN && export SMOKE_OPERATOR_A_TOKEN
   read -rs SMOKE_OPERATOR_B_TOKEN && export SMOKE_OPERATOR_B_TOKEN
   NODE_EXTRA_CA_CERTS=<ac-interna.pem> \
   SMOKE_TARGET_URL=https://<nome-interno> SMOKE_ALLOWED_ORIGIN=https://<nome-interno> \
   SMOKE_OPERATOR_A_ROLE=Admin SMOKE_OPERATOR_B_ROLE=Operator \
   SMOKE_EXPECTED_IMAGE_DIGEST=<digest do CI> SMOKE_DEPLOYED_IMAGE_DIGEST=<digest lido no passo 2> \
     npx tsx scripts/production-target-smoke.ts --output docs/04_audit/evidence/<task>/production-target-smoke.json
   ```

   Esperado ([medido](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/production-target-smoke.json)): 15 `PASS` (`c5.*`, `c7.*`, `c8.*`, `c9.image_digest_match`), `"status":"PASS"`, `complete: true`. Os operadores do ensaio são `ensaio-admin` e `ensaio-operador` (decisão delegada).

4. **Leitura de caso continua bloqueada**: com sessão Admin, `GET /v1/cases` e `GET /v1/conversations` respondem `503 configuration_error`; `GET /v1/tasks` e `GET /v1/admin/agents` respondem 200 ([medido](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/case-read-probe.json)). Isso é falha fechada por desenho até a [UP91-025](0367_program_backlog_reaudit_2026-09-30.md#up91-025) ligar o produtor verificado de `case_principals` ao login OIDC/MFA.

### Fase 11 — Backup e restore de prova

1. **Instalar** conforme a seção C6 do [README do deploy](../../deploy/harness/README.md): `usermod -aG docker cvg-backup`, unidades e timers systemd, `/etc/cvg-harness/backup.env` com `root:cvg-backup 0640` (o `render-env.sh` grava `0600`; reaplicar o grupo e o modo depois de cada renderização), `CVG_BACKUP_MIRROR_DIR=/mnt/truenas/cvg-harness/backups` e `CVG_BACKUP_MIRROR_REQUIRE_MOUNT=true`.
2. **Primeiro backup**: `sudo systemctl start cvg-harness-backup.service && journalctl -u cvg-harness-backup.service -o cat -n 5`.
   Esperado (medido em 5,7 s): `backup.mirrored` e `backup.completed ... bytes=... sha256=...`; conjunto `AAAAMMDDTHHMMSSZ/` com `harness.dump`, `anchors.json`, `SHA256SUMS` e `manifest.json`, igual no TrueNAS.
3. **Restore de prova**: `sudo systemctl start cvg-harness-restore-drill.service && journalctl -u cvg-harness-restore-drill.service -o cat -n 5`.
   Esperado (medido em 19,5 s, [relatório](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/restore-drill-report.json)): `restore_drill.completed` e relatório com `"status":"PASS"` e a cadeia conferida contra as âncoras. Copiar o relatório para `docs/04_audit/evidence/<task>/` (aceite C6).
4. **Timers**: `systemctl list-timers 'cvg-harness-*'`.
   Esperado: backup diário às 03:15 UTC e restore no primeiro domingo do mês às 05:00 UTC.
5. **Falha do backup vira alerta**: a linha `OnFailure=` das unidades está comentada e o repositório não tem a unidade de notificação. Até o cartão existir, conferir `journalctl -u cvg-harness-backup.service` todo dia útil.

### Fase 12 — Alerta no Telegram

1. **Bot e grupo**: o gestor cria o bot e o grupo; `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` entram em `secret/cvg-harness/harness`; renderizar (fase 7) e `hc up -d --no-deps --force-recreate alert-relay`.
2. **Ensaio de parada**:

   ```sh
   hc logs api | grep -c stop_alert.disabled   # esperado: 0
   hc stop worker
   # esperar CVG_STOP_ALERT_WORKER_STALE_MS + CVG_STOP_ALERT_INTERVAL_MS (150 s com os padrões)
   hc up -d --no-deps worker                   # não usar "hc start worker" (fase 9, passo 6)
   ```

   Esperado: mensagem `worker_down` `firing` no Telegram e depois `resolved`; o relay registra `alert_relay.forwarded`; o contador 443 de `container_egress` aumenta.
   Medido nesta task com o Telegram bloqueado de propósito ([registro](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/raw/alert-drill.txt)): a API enviou o alerta assinado 135 s depois da parada; o relay aceitou a assinatura e respondeu 502 `telegram_unavailable`; a API registrou `stop_alert.delivery_failed` e tentou de novo.

### Fase 13 — Monitor externo

1. **Segunda máquina**: Linux com Docker, fora do servidor, com acesso a `https://<nome-interno>/ready` e ao receptor do alerta.
2. **Bloqueado para o núcleo**: o repositório não tem monitor externo do núcleo. O alerta de parada roda dentro da API e não avisa se o host ou a API caírem.
3. **Produto**: se o Assistente de Plantão for implantado (barra 0368), o monitor dele está em [`monitor.example.yaml`](../../products/shift-assistant/deploy/monitor.example.yaml). Ele exige um receptor que devolva `{receiptId, payloadSha256}`; o relay do Telegram responde `{outcome}` e só escuta dentro da rede do compose, então não serve para esse monitor.
   Esperado, quando houver monitor e receptor: desligar o servidor gera alerta no receptor (meta do produto: até 30 s, [operations.md](../../products/shift-assistant/docs/operations.md)).

### Fase 14 — Túnel só para webhooks

1. **Na Cloudflare** (máquina de administração): criar o túnel, gerar `credentials.json` e apontar o nome público de webhooks para ele.
2. **No servidor**: copiar [`tunnel/config.example.yml`](../../deploy/harness/tunnel/config.example.yml) para `/etc/cvg-harness/tunnel/config.yml` e preencher UUID, nome público, `originServerName` (o nome do certificado do proxy) e `origin-ca.pem` (a AC que assinou esse certificado). Os arquivos precisam ser legíveis pelo uid 65532, com que o `cloudflared` roda.
3. **Subir**: `hc up -d --no-deps tunnel`.
   Esperado: `hc logs tunnel` mostra conexões registradas e o contador 7844 aumenta. De fora do hospital, `https://<nome-webhook>/live` responde 404 (só a rota de webhook passa) e um POST sem assinatura em `/v1/webhooks/channels/<canal>/messages` é recusado com 4xx, nunca 200.

### Fase 15 — O que continua bloqueado depois da instalação

- Leitura de caso em modo `trusted` responde 503 até a [UP91-025](0367_program_backlog_reaudit_2026-09-30.md#up91-025) (produtor de `case_principals` ligado ao login OIDC/MFA).
- Tasks e approvals sem escopo por caso até a SPEC0251 entrar na `main` (decisão do usuário de 21/10; BUILD em andamento).
- Uso pela equipe: depende do Keycloak com MFA no servidor e da SPEC T3 que compõe as rotas OIDC (G2).
- Métricas autenticadas: cartão futuro (G1); valem logs, `/ready`, heartbeat e alerta.
- Produção: `NO_GO` até a reauditoria C10 no mesmo SHA e no mesmo digest. O produto segue a própria barra (0368).

## 4. O que o usuário e o hospital precisam decidir ou fornecer

| Item                                                                            | Estado                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Servidor no hospital, Docker Compose, PostgreSQL local                          | Decidido (C1, [production-0374](../04_audit/evidence/USER-DECISIONS-20261016/production-0374.json))                                                                                              |
| Vault no servidor                                                               | Decidido (C4); raft, TLS local, Shamir 2 de 3 e snapshot diário no TrueNAS por delegação ([RESOLVE-20261016](../04_audit/evidence/RESOLVE-20261016/README.md))                                   |
| Console só na rede interna/VPN; túnel só para webhooks                          | Decidido (C5)                                                                                                                                                                                    |
| Backup local + TrueNAS; papel de backup com `BYPASSRLS`                         | Decidido (C6, G3); cópia fora do prédio recomendada, risco aceito                                                                                                                                |
| Alerta no Telegram do gestor                                                    | Decidido (A3)                                                                                                                                                                                    |
| Logs, `/ready`, heartbeat e alerta como evidência                               | Decidido (G1)                                                                                                                                                                                    |
| GHCR privado por digest, token de leitura no Vault                              | Decidido (G6); primeira publicação só da `main` com os checks obrigatórios verdes ([21/10](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/user-decision-20261021.json)); ainda não publicado |
| Keycloak com MFA (TOTP) no servidor                                             | Decidido por delegação; futuro, depende de SPEC T3                                                                                                                                               |
| Operadores do ensaio C8                                                         | Decidido por delegação: `ensaio-admin` e `ensaio-operador`, sintéticos                                                                                                                           |
| Rotação do segredo de webhook                                                   | Decidido (G7): corte coordenado                                                                                                                                                                  |
| CPU, RAM, disco, SO, Vault por pacote, TTLs do AppRole                          | Proposta desta task (seções 1 e 3); falta o aceite do usuário                                                                                                                                    |
| Compra e fornecedor do servidor, da segunda máquina e do UPS                    | Falta                                                                                                                                                                                            |
| Volume esperado de mensagens por dia                                            | Decidido em 22/10: até 5.000 por dia ([decisão](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/user-decision-20261022.json)); 2 × 960 GB em RAID 1                                           |
| Quem recebe o alerta no Telegram; bot e grupo criados                           | Decidido em 22/10: só o usuário, num grupo com o bot; o gestor entra depois. Falta criar o bot e o grupo                                                                                         |
| Os três guardiões das partes do Vault e onde guardam                            | Falta                                                                                                                                                                                            |
| Nome DNS interno e AC interna ou certificado                                    | Falta                                                                                                                                                                                            |
| Conta Cloudflare e nome público de webhooks                                     | Falta                                                                                                                                                                                            |
| Dono do token de leitura do GHCR                                                | Falta                                                                                                                                                                                            |
| TrueNAS: pool, datasets, UID, retenção de snapshot, quota                       | Falta                                                                                                                                                                                            |
| Local independente das âncoras                                                  | Falta (lista do README do deploy); proposta: dataset `cvg-harness/anchors` no TrueNAS                                                                                                            |
| Retenção `CVG_BACKUP_RETENTION_DAYS`                                            | Falta (padrão 35 no `.env.example`, usado nas contas)                                                                                                                                            |
| Cópia fora do prédio (Cloud Sync criptografado)                                 | Falta; recomendada, depende de conta paga                                                                                                                                                        |
| Faixas da VLAN interna e da VPN, administração, DNS, NTP                        | Falta                                                                                                                                                                                            |
| Quem tem `sudo` e grupo `docker`                                                | Falta                                                                                                                                                                                            |
| Coletor de logs                                                                 | Falta (README do deploy)                                                                                                                                                                         |
| Monitor externo do núcleo e receptor com recibo                                 | Falta: não existe no repositório; cartão [SRV-01](0374_plano_producao_harness.md#srv-01)                                                                                                         |
| Notificação de falha do backup (`OnFailure=`)                                   | Falta: unidade não existe; cartão [SRV-02](0374_plano_producao_harness.md#srv-02)                                                                                                                |
| Política e timer do snapshot do Vault; política humana com MFA                  | Falta: não existem no repositório; cartão [SRV-03](0374_plano_producao_harness.md#srv-03)                                                                                                        |
| Docker Hub liberado ou imagens de `postgres` e `cloudflared` espelhadas no GHCR | Falta; cartão [SRV-05](0374_plano_producao_harness.md#srv-05)                                                                                                                                    |
| IP fixo ou nome de bridge para separar o egress de cada contêiner               | Falta: mudança no compose, com task própria; cartão [SRV-04](0374_plano_producao_harness.md#srv-04)                                                                                              |
| Assistente de Plantão no mesmo host                                             | Falta; decisão da barra 0368                                                                                                                                                                     |
| Escopo por caso em tasks e approvals; UP91-025                                  | Decidido em 21/10: SPEC0251 em BUILD; UP91-025 depois, com IdP sintético local                                                                                                                   |

## 5. Riscos e limites

- **Mesmo prédio sem cópia externa.** Incêndio, roubo ou desastre local atingem servidor e TrueNAS juntos (risco aceito em C6).
- **Unseal manual depois de reiniciar.** Os contêineres voltam sozinhos, mas deploy, rotação, renderização e snapshot do Vault esperam dois guardiões. Enquanto isso os segredos continuam em `/etc/cvg-harness/*.env` (0600) e visíveis por `docker inspect` para quem está no grupo `docker`.
- **Um host só.** `restart: unless-stopped` cobre queda de processo, não do host. Não há alta disponibilidade.
- **Sem monitor externo do núcleo.** O alerta de parada roda dentro da API; queda do host, da API ou da internet não chega ao Telegram. Cartão [SRV-01](0374_plano_producao_harness.md#srv-01).
- **Janela G5 em toda operação de serviço.** Fora da janela, `start` e `up -d <serviço>` rodam o `migrate` e falham; o README do deploy (C3 e C7) e o secrets/README (rotação) passaram a usar `up -d --no-deps <serviço>` em 22/10.
- **Imagem não reprodutível byte a byte.** Três builds do mesmo commit deram três digests. Só o digest do CI vale. Cartão [SRV-06](0374_plano_producao_harness.md#srv-06).
- **Egress comum na rede do compose.** Sem IP fixo ou nome de bridge, `api`, `worker` e `postgres` também alcançam a porta 443 externa pela mesma regra do `alert-relay`. Cartão [SRV-04](0374_plano_producao_harness.md#srv-04).
- **Volume desconhecido e banco sem purga.** O disco foi dimensionado com mensagens sintéticas curtas; revisar todo mês com o tamanho real do dump.
- **Vazão limitada por desenho.** Um worker serial (4,8 a 6,7 mensagens/s) e 300 requisições/min por origem; rajadas acima disso recebem 429, e uma rajada longa no teto pode acumular fila.
- **Medições indicativas.** Máquina de mesa compartilhada; Keycloak em modo dev sem limite; túnel não medido; o produto não rodou junto.
- **Dependência de internet.** Sem saída, não há alerta no Telegram nem webhook pelo túnel.
- **`cvg-backup` no grupo `docker`.** Equivale a root no host.
- **Queda de energia.** `--data-checksums` detecta corrupção, não a evita; o UPS com desligamento automático é parte do requisito.
- **Imagem do PostgreSQL por tag.** O padrão do compose é `postgres:16-alpine`; fixar o digest em `CVG_HARNESS_LOCAL_PG_IMAGE`, como na medição. Cartão [SRV-05](0374_plano_producao_harness.md#srv-05).
- **`NO_GO`.** Nada aqui libera produção, dado real ou uso pela equipe.

## 6. Evidência

Pasta [`HOSPITAL-SERVER-0393-20261021/`](../04_audit/evidence/HOSPITAL-SERVER-0393-20261021/sizing-measurements.json):

- `sizing-measurements.json`: todas as medições e contas desta página;
- `docker-stats-summary.json` e `raw/docker-stats.tsv`: CPU e memória por contêiner e por fase;
- `raw/load-rounds.jsonl`, `raw/sizes-*.json*`, `raw/phases.jsonl`: carga, tamanhos e horários;
- `load-gate-report.json`: gate `load` em memória;
- `restore-drill-report.json`, `raw/backup-manifest-*.json`, `raw/backup-restore-events.txt`: backup e restore reais com os scripts do repositório;
- `production-target-smoke.json`, `raw/case-read-probe.json`, `raw/alert-drill.txt`, `raw/single-service-up.txt`, `raw/verify-roles.txt`, `raw/c5-c3-checks.txt`, `raw/ddl-refusal.txt`: ensaio do roteiro;
- `raw/vault-steps.txt`, `raw/vault-stats.tsv`, `raw/keycloak-stats.tsv`: Vault e Keycloak;
- `tools/`: override, scripts de carga e coleta, `cvg-host.nft`, `vault.hcl`; `raw/nft-validate.log`;
- `commands.txt`, `sources.sha256`, `cleanup.json`: comandos, fontes lidas com hash e limpeza (nenhum contêiner `cvg-d9ef-sizing-*` restante).
