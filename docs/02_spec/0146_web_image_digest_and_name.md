# SPEC-PR008-001 — imagem web fixada e nome de build corrente

- Estado: `SPEC_READY / BUILD_T2`. Task [PR-008](../03_build/0356_production_backlog_2026-09-26.md), classe T2 documental/de build, sem contrato público, schema, identidade ou efeito externo.
- Recon: o estágio `web` do `Dockerfile` usa `nginxinc/nginx-unprivileged:1.27-alpine` sem digest; o comentário de build ainda sugere `cvg-agent-secretary:local`, nome do produto legado. A imagem runtime Node já está fixada por digest.
- Consulta ao registry em 27/09/2026: `docker buildx imagetools inspect nginxinc/nginx-unprivileged:1.27-alpine` retornou índice OCI `sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0`, com manifesto `linux/amd64` `sha256:28d91bdce70ad09025ea901458fdd149259d8e05982ade79d4ef2c0d9470eb48` e `linux/arm64` `sha256:025de0b541bcc6cfbf508e4201aaa37b51d34daaf6d52e5e2753e29a8ddaa869`. O índice preserva suporte multiarch. Fonte upstream: [NGINX Unprivileged no Docker Hub](https://hub.docker.com/r/nginxinc/nginx-unprivileged/tags/).

## Regras e critério de pronto

1. Usar `nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0` no estágio `web`; mudar o comentário de build para `cvg-operational-harness:local`. Nenhum estágio, usuário, porta, dependência ou versão de NGINX muda nesta fatia.
2. Registrar a resolução do digest e verificar `docker build --target web` sob Node 22; executar smoke da imagem web na porta 8080 com conteúdo controlado. Não publicar nem usar dado real.
3. Gate T2: `typecheck`, `lint`, `npm test`, `test:postgres` e E2E verdes em Node 22, `format:check`, links e diff sem erro. O E2E usa worktree/portas próprios enquanto PR-L04 detiver os artefatos compartilhados. Registrar resultados e hashes nos ledgers e nesta SPEC.

A PR-008 melhora a identidade e a reprodutibilidade da imagem. Produção segue `NO_GO` até as 13 condições do [plano executivo](../03_build/0354_production_executive_plan_2026-09-26.md), certificado do SHA integrado, CI remoto e decisão humana.
