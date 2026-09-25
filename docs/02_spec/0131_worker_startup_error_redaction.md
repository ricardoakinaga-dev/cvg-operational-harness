# 0131 — SPEC: redação de erro no entrypoint do worker

- ID: `SPEC-OPS-001`
- Estado: `SPEC_DRAFT_FOR_REVIEW`
- Origem: [RA25-06](../03_build/0351_audit0573_backlog.md) (alias `RA24-05`), onda
  D3 de [0350](../03_build/0350_audit0573_roadmap.md).
- Alvo: `apps/worker/src/main.ts`, novo `apps/worker/src/startup-error.ts` e
  `redactSensitiveText` em `packages/shared/src/audit-governance.ts`.
- Fora de escopo: exit codes, códigos de evento, ordem dos ramos condicionais,
  comportamento fail-closed, `CompositeTelemetry` e qualquer gate de produção.

## Problema

Os `catch` do entrypoint escrevem `error.message` cru em `console.error` fora
do `CompositeTelemetry`, que é o único caminho com redação centralizada. A
política `redactSensitiveText` já cobre segredo (`api_key=`, `password:`),
token (`Bearer`, `authorization:`) e PII (e-mail, CPF, CNPJ, telefone, endereço,
nome, data de nascimento), mas **não** cobre credencial embutida em URL:
`postgres://usuario:senha@host:5432/banco` atravessa a política intacta.

## Regras normativas

1. **R1 — redação centralizada estendida.** `redactSensitiveText` passa a
   substituir o trecho `userinfo@` de uma URL (`esquema://usuario:senha@host`)
   por `[redacted-credentials]@`. O esquema, o host, a porta e o caminho
   permanecem visíveis para diagnóstico; usuário e senha nunca. Só há
   substituição quando o `:` do password está presente.
2. **R2 — boundary único.** Todo `catch` do `main.ts` que propaga
   `error.message` passa a montar a mensagem por
   `redactStartupErrorMessage(error, fallback)`, em módulo separado (o
   `main.ts` tem efeito colateral no import e não é importável por teste).
3. **R3 — não-Error preserva o fallback.** A função aceita `unknown` plus a
   string de fallback. `Error` usa `.message`; `string` usa o próprio texto;
   qualquer outro valor (objeto de domínio, `undefined`, número) usa o fallback
   literal já existente naquele `catch`, sem perda de informação nova.
4. **R4 — truncamento.** Mensagem redigida acima de 500 caracteres recebe
   sufixo `[truncated]`; o campo `event` e `code` nunca são truncados.
5. **R5 — contrato inalterado.** `event`, `code`, o valor de
   `process.exitCode` e a ordem/existência dos ramos condicionais não mudam.
   Nenhum `catch` passa a engolir o erro nem a alterar o exit status; fail-closed
   permanece idêntico.
6. **R6 — escopo do boundary.** A linha `startupFailure.message`
   (`worker.startup_failed`) também passa pela mesma função, porque é o outro
   ponto em que texto de startup chega ao stdout/stderr sem passar pelo
   telemetrio.

## Fixtures obrigatórias (teste negativo)

Mensagem sintética única contendo simultaneamente:

- segredo: `api_key=AKIA...`
- token: `Bearer eyJhbGciOi...`
- URL com credencial: `postgres://cvg_app:<senha>@10.0.0.7:5432/cvg`
- PII: e-mail institucional e CPF

Critério: `JSON.stringify({ event, code, message })` não contém nenhuma das
substrings sensíveis em claro, e `event`/`code` saem byte-idênticos ao esperado.

Cobertura de wiring: processo real spawnado (`main.ts`) deve sair com código 1,
emitir o mesmo `event`/`code` de antes e não conter `://userinfo@` em claro na
saída.

## Critério de pronto

- Teste negativo verde; `typecheck`, `lint`, `npm test` e cobertura → `PASS`.
- Nenhuma mudança de exit code nem de fail-closed (asserções de `code === 1` e
  de `event`/`code` existentes continuam verdes).
- `npm run docs:check-links` e `npm run evidence:check-hygiene` → exit 0.

## Autorização e gates

- Task registrada: RA25-06 em `docs/03_build/0351_audit0573_backlog.md`.
- BUILD executado sob a instrução explícita do usuário de 2026-09-25
  (“Implemente todo o conteúdo dos documentos planejados”).
- Revisão independente / humana desta SPEC: `NOT_RUN` — registro aqui não
  constitui aprovação humana. Nenhum gate de produção, dados reais, integração
  externa, IdP ou canal é afetado; produção permanece `NO_GO`.
