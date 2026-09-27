# SPEC-PR008-001 — imagem web fixada e nome de build corrente

- Estado: `BUILD_VERIFIED_LOCAL / CERTIFICATION_PENDING`. Task [PR-008](../03_build/0356_production_backlog_2026-09-26.md), classe T2 documental/de build, sem contrato público, schema, identidade ou efeito externo.
- Recon: o estágio `web` do `Dockerfile` usa `nginxinc/nginx-unprivileged:1.27-alpine` sem digest; o comentário de build ainda sugere `cvg-agent-secretary:local`, nome do produto legado. A imagem runtime Node já está fixada por digest.
- Consulta ao registry em 27/09/2026: `docker buildx imagetools inspect nginxinc/nginx-unprivileged:1.27-alpine` retornou índice OCI `sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0`, com manifesto `linux/amd64` `sha256:28d91bdce70ad09025ea901458fdd149259d8e05982ade79d4ef2c0d9470eb48` e `linux/arm64` `sha256:025de0b541bcc6cfbf508e4201aaa37b51d34daaf6d52e5e2753e29a8ddaa869`. O índice preserva suporte multiarch. Fonte upstream: [NGINX Unprivileged no Docker Hub](https://hub.docker.com/r/nginxinc/nginx-unprivileged/tags/).

## Regras e critério de pronto

1. Usar `nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0` no estágio `web`; mudar o comentário de build para `cvg-operational-harness:local`. Nenhum estágio, usuário, porta, dependência ou versão de NGINX muda nesta fatia.
2. Registrar a resolução do digest e verificar `docker build --target web` sob Node 22; executar smoke da imagem web na porta 8080 com conteúdo controlado. Não publicar nem usar dado real.
3. Gate T2: `typecheck`, `lint`, `npm test`, `test:postgres` e E2E verdes em Node 22, `format:check`, links e diff sem erro. O E2E usa worktree/portas próprios enquanto PR-L04 detiver os artefatos compartilhados. Registrar resultados e hashes nos ledgers e nesta SPEC.

A PR-008 melhora a identidade e a reprodutibilidade da imagem. Produção segue `NO_GO` até as 13 condições do [plano executivo](../03_build/0354_production_executive_plan_2026-09-26.md), certificado do SHA integrado, CI remoto e decisão humana.

## Verificação local de 27/09/2026

- `Dockerfile` usa o índice OCI da tag e o comentário de build com o nome
  corrente. `docker build --pull --target web` PASS; imagem local
  `sha256:f9e08901d9d010db5995f5dfaf5f082d894c2effe9d8fc44b4cf24543faa7290`.
  Sob `--read-only`, tmpfs, capabilities removidas e `no-new-privileges`,
  `GET /` retornou HTTP 200 e HTML de 407 bytes. A configuração NGINX
  exige resolução de `secretary-api` no arranque: sem esse alias, saiu 1;
  o smoke estático passou com alias sintético `127.0.0.1`. Esse nome de
  deploy permanece dependência da frente PR-L10, sem inferir prontidão do
  proxy implantado. [Log, hash e prova](../04_audit/evidence/PR008-20260927/proof.json).
- No candidato isolado `2a11435`, `ci-bar gate image` PASS: imagem runtime
  `sha256:9c263b482ba6a7a4809b810843907af76b4458734dce30ad99e2832e5f7371fb`,
  smoke `/live=200` e `/ready=200`; [registro e manifesto](../04_audit/evidence/PR008-20260927/runtime-image.json).
  Essa prova cobre o gate de imagem local, não um deploy.
- Node 22.23.2: `typecheck`, lint, formato, links, build e auditoria npm
  PASS; `npm test` 300 arquivos/2.182 PASS e 146 skips sem banco;
  PostgreSQL 35 arquivos/258 PASS; E2E do `ci-bar` 12/12 PASS no mesmo
  worktree. Certificado completo e CI remoto do SHA integrado pendentes.
