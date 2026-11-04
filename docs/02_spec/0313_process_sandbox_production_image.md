# SPEC 0313 — Disponibilizar o sandbox `PROCESS` na imagem de produção

Status: `DECISIONS_RECORDED_AWAITING_BUILD_GO`. Trilha **T3** (segurança) com gate **T4** para ativar. Data: 04/11/2026. Origem: achado P1 da [auditoria 0626](../04_audit/0626_repository_audit_2026-11-04.md). Nenhum BUILD autorizado.

## 1. Reconhecimento (fatos verificados)

- A imagem final do `Dockerfile` é `gcr.io/distroless/cc-debian13:nonroot`: sem shell e sem `bubblewrap`. O helper Landlock (`packages/sandbox/native/cvg-landlock-exec.c`) só é compilado no passo do `verify.yml` (CI), não na imagem.
- Resultado: o serviço de processo (SPEC 0286/0288) não encontra nível de contenção admissível e `PROCESS` fica `unavailable` em produção. É o comportamento fail-closed desejado hoje.
- `deploy/systemd/user/README.md` proíbe, nesta rodada, instalar `bwrap`/helper na imagem e alterar `Delegate`/sysctl do user manager. Esta SPEC propõe revogar essa proibição só depois de aprovada.
- A qualificação da base Debian 13 está com o Codex (índice AUD0625); esta SPEC não a substitui.

## 2. Regras

R1. A imagem continua sem shell e sem gerenciador de pacotes. Só entram **artefatos estáticos e verificáveis**: o helper compilado em estágio de build (`cc -static`, mesmos flags do CI, `-Werror`) e, se aprovado, um `bwrap` estático ou copiado com suas bibliotecas por digest.
R2. Os binários entram em caminho de raiz do `root`, somente leitura, sem setuid. O usuário `cvg` não consegue reescrevê-los.
R3. `PROCESS` só fica `available` se o preflight provar, na partida, o nível de contenção exigido pelo perfil (namespace observado + Landlock ABI ≥ 3). Kernel sem Landlock ⇒ continua `unavailable` e a partida registra o motivo. Sem fallback silencioso para execução sem contenção.
R4. Nenhuma capability adicional (`cap_drop: ALL` mantido). Se o `bwrap` exigir user namespaces não privilegiados, isso é decisão D2 abaixo, não suposição.
R5. SBOM, `image-scan` (Trivy) e licenças cobrem os novos binários. Digest do helper registrado em `certification/runtime-image.json`.
R6. Habilitar `PROCESS` em ambiente real é gate **T4**: pacote de decisão com SHA-256, candidato congelado e decisão humana registrada. Esta SPEC só torna a capacidade _possível_; o default segue desligado.

## 3. Critérios de pronto

C1. Estágio `helper-build` no `Dockerfile`; imagem final contém o helper com digest estável entre dois builds.
C2. Teste de imagem: com `--read-only --cap-drop ALL`, preflight reporta `available` num kernel com Landlock ABI ≥ 3 e `unavailable` com motivo fechado em kernel sem ele.
C3. Teste negativo: processo no sandbox não lê arquivo fora do workspace, não herda o ambiente e não alcança a rede (reaproveitar `tests/aud0625-process-profile-lifecycle.test.ts`).
C4. `verify.yml` (barra REM21) e `image-scan` verdes no PR; nenhum CVE HIGH corrigível novo.
C5. Atualizar `deploy/systemd/user/README.md`, a barra 0373 e o runbook de operação.

## 4. Decisões para o usuário

- **D1 — Mecanismo:** (a) só Landlock via helper estático, sem `bwrap` (recomendado: menor superfície, sem user namespace); (b) Landlock + `bwrap` (nível A namespace-observado do X01).
- **D2 — User namespaces:** se escolher (b), aceitar `kernel.unprivileged_userns_clone`/equivalente no host de destino? Depende do servidor (U10).
- **D3 — Quem executa o BUILD:** coordenar com o Codex (imagem Debian 13) para não haver dois donos de `Dockerfile`.
- **D4 — Nível B (cgroup/pidfd/guardião):** fora desta SPEC (proposta separada); confirmar.

## 5. Fora de escopo

Ativar `PROCESS` com dado real, nível B de contenção, mudar `Delegate`/sysctl do host, qualquer liberação de produção.

## 6. Decisões registradas (04/11/2026, usuário)

- **D1 = só Landlock** via helper estático; sem `bwrap` e sem user namespaces. O requisito R4 vale como escrito e a opção `bwrap` fica descartada.
- D2 = não se aplica (consequência de D1). D4 = nível B fora desta SPEC.
- **Pendente:** D3 (coordenação do `Dockerfile` com o Codex) e a autorização explícita de BUILD, que ainda não foi dada. Ativar `PROCESS` continua sendo gate T4 separado.
