# SPEC 0316 — Serviço `tool-runner` para o sandbox `PROCESS`

Status: `PROPOSED_FOR_HUMAN_T3_REVIEW`. Trilha **T3** (segurança, contrato entre processos); ativar em ambiente real é gate **T4**. Data: 04/11/2026. Decide a D1' da [SPEC 0313](0313_process_sandbox_production_image.md). Nenhum BUILD autorizado.

## 1. Problema e fatos

- O código só habilita `PROCESS` com `bubblewrap` (`capabilities.ts`: `mode = bubblewrap ? 'PROCESS' : 'WORKSPACE'`); o helper Landlock é defesa adicional. O `bwrap` precisa criar user namespaces.
- O compose de produção roda API e worker com `cap_drop: [ALL]`, `read_only`, `no-new-privileges` e o seccomp padrão do Docker, que não deixa criar user namespaces sem relaxar o perfil. Relaxar isso na imagem do worker enfraqueceria a pilha inteira.
- Servidor-alvo: Ubuntu Server 24.04 (0393). O padrão dessa versão é `kernel.apparmor_restrict_unprivileged_userns=1`, que restringe user namespaces sem perfil AppArmor que os permita. A máquina de staging atual tem esse valor em `0`; **não reproduz o padrão do servidor** e precisa ser ajustada para `1` antes de qualquer prova.

## 2. Desenho proposto

R1. Novo serviço `tool-runner` no compose, com imagem própria contendo `bwrap` e o helper Landlock estático (compilado em estágio de build, `-Werror`), ambos por digest e somente leitura. É o **único** componente com seccomp/AppArmor relaxados, e só no necessário para `unshare(CLONE_NEWUSER)`.
R2. O worker não ganha capability nem relaxa perfil. Ele delega a execução ao runner por um canal local autenticado (socket Unix num volume só entre os dois, sem rede), com pedido e resposta validados por esquema, tamanho e tempo limitados.
R3. O runner nunca recebe segredo, credencial de banco nem rede. Roda sem acesso ao PostgreSQL, com workspace efêmero por execução e o mesmo perfil de contenção já testado (nível A: namespaces + Landlock ABI ≥ 3 provado por syscall).
R4. Fail-closed: sem runner saudável, ou com contenção não provada no preflight, `PROCESS` continua `unavailable`; sem fallback para execução no worker.
R5. O resultado do runner entra no mesmo caminho de approval, política e journal de efeito de hoje; nenhuma ferramenta de processo roda sem passar por eles.
R6. Habilitar o runner em ambiente real é T4: pacote de decisão com SHA-256, candidato congelado e decisão humana.

## 3. Critérios de pronto

C1. Imagem do runner reproduzível (digest estável) e coberta por SBOM, `image-scan` e licenças.
C2. Prova em staging com **`apparmor_restrict_unprivileged_userns=1`**: com o perfil mínimo, o runner reporta contenção provada; sem o perfil, fica `unavailable` com motivo fechado.
C3. Teste negativo ponta a ponta: o payload não lê fora do workspace, não herda ambiente, não alcança rede nem o socket do banco, e não consegue chamar o worker de volta.
C4. Worker e API continuam passando `--read-only --cap-drop ALL` com o seccomp padrão (teste de imagem).
C5. `verify.yml`, `test:postgres`, mutação do protocolo worker↔runner e cobertura por arquivo verdes.

## 4. Decisões

- **D1 — Protocolo worker↔runner:** socket Unix com mensagens JSON delimitadas (recomendado: sem rede e sem dependência nova) ou HTTP local.
- **D2 — Perfil de segurança:** seccomp customizado mínimo + perfil AppArmor próprio (recomendado), em vez de `seccomp=unconfined`.
- **D3 — Fase 1:** fica para depois do staging provar C2; o BUILD só começa com autorização.

## 5. Fora de escopo

Nível B (cgroup/pidfd/guardião), `PROCESS` com dado real, mudar o host do hospital, qualquer liberação de produção.
