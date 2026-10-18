# 0201 — SPEC: PDSH-016 — Egress de exames (upload/download por canal aprovado, SSRF, aprovação e journal)

- Task: `PARE-DSH-20261011`, cartão `PDSH-016` (plano [0375](../03_build/0375_plano_pareamento_motor_dsh.md), Onda 2, trilha T3).
- Dependência `DONE`: PDSH-012 (tools fs sandboxadas). Reutiliza infra existente: `packages/shared/src/ssrf.ts` (SSRF) e `packages/channel-gateway` (journal, idempotência, gate de saída).
- Invariantes: ADR-010 (`boundary:products`), ADR-011 (um spine — o egress reusa o canal, não cria um spine paralelo), fail-closed, produção `NO_GO`, sem dado real, sem provider externo, `products/**` intocado, push/deploy/release não autorizados.

## Contexto

Agentes hospitalares precisam **enviar e receber arquivos de exame** (upload do workspace do tenant para um destino aprovado, e download de um destino aprovado para o workspace). Hoje não existe capacidade de egress de arquivo: as tools fs de PDSH-012 só operam dentro do workspace, e o gateway de canal só transporta mensagens (`body.text` + anexos ≤ 25 MiB). Este cartão adiciona um caminho de egress de **arquivo de exame** que:

- valida o destino com o guard SSRF existente (fail-closed);
- exige aprovação humana em toda chamada (`requiresApproval: true`, `risk: HIGH`, `sideEffect: EXTERNAL`);
- grava no journal de efeitos do canal (lease atômico → provedor → confirmação), reusando o `ChannelEffectJournal` de PDSH-011/016 existente;
- nunca cria um segundo ponto de interceptação nem uma cópia do spine.

## Decisões de design

### 1. Duas capacidades, um módulo novo

Novo módulo `packages/channel-gateway/src/exam-egress.ts` (sem workspace novo; `@cvg/channel-gateway` já é publicado). Exporta duas fábricas de tool no formato `ToolDefinition` de contratos:

```ts
export interface ExamEgressOptions {
  readonly effectJournal: ChannelEffectJournal
  readonly workspaceRoot: string // raiz real (realpath) do workspace do tenant
  readonly urlGuard?: EgressGuardOptions // allowlist obrigatória; HTTPS/rede pública não relaxáveis
  readonly dnsLookup?: EgressDns['lookup'] // seam de composição/teste
  readonly requireApproval: boolean // true em produção/composição; false só em teste
  readonly maxFileBytes?: number // default 25 MiB (teto do schema de anexo)
  readonly leaseMs?: number // default 30s; 1..120s
  readonly timeoutMs?: number // default 20s, estritamente menor que leaseMs
  readonly leaseOwner?: string // prefixo; owner único por execução
  readonly fetchImpl?: typeof fetch // injetável para testes; default global fetch
}
export function createExamUploadTool(options: ExamEgressOptions): ToolDefinition
export function createExamDownloadTool(
  options: ExamEgressOptions
): ToolDefinition
```

- Ambas declararam `sandbox: 'WORKSPACE'` (reusam a contenção de path de PDSH-012) e `requiresApproval: true` (o kernel de PDSH-010 faz o gate; `requireApproval: false` é só para guarda unitária e falha no boot se `requireApproval` não for booleano).
- `requireApproval` **não** pode ser silenciado em produção: a composição que não injetar `control.approvals` recebe `APPROVAL_REQUIRED` e nunca efetua egress (fail-closed do kernel, não do módulo).

### 2. Upload (`exam.upload`)

Input (estrito):

| Campo          | Regra                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| `path`         | caminho **relativo** ao workspace; confinado por `confinePath` (reusado de PDSH-012) |
| `url`          | URL https; validada por `assertSafeUrl` com allowlist de hosts obrigatória           |
| `intent`       | string 1..200 chars, obrigatória                                                     |
| `operationKey` | idempotência; ausente → `REJECTED`                                                   |

Fluxo: confinar `path` → `resolveAndGuardOutboundUrl` (estática+DNS sem HTTP, antes de leitura/reserva) → ler arquivo regular com tamanho limitado e hash SHA-256 do conteúdo → `reserve` atômico → replay terminal ou conflito/in-flight/uncertain sem rede → `claimSend` (`PENDING → SENDING`) → POST com `fetchWithSsrfGuard` (valida cada redirect) → `complete` committed → `SUCCEEDED`. Falha após início da rede, timeout ou confirmação ambígua → `markUncertain` + `FAILED`, nunca `release` autorizando reenvio. HTTP não-2xx → `fail(provider_rejected)` terminal; replay de FAILED permanece FAILED. Nenhum byte sai sem reserva e claim.

### 3. Download (`exam.download`)

Input estrito igual ao upload. Fluxo: confinar `path` → guard estático+DNS → `reserve → claimSend` → GET guardado → ler stream com teto `maxFileBytes` e cancelamento → renovar/fence da lease → revalidar confinamento após awaits → criar diretório pai no workspace → temp exclusivo privado no namespace `.cvg-fs-tmp-` + rename → `complete` committed. Replay confirmado não faz GET nem reescreve arquivo local. Resposta não-2xx, corpo ausente/excessivo ou falha de escrita → FAILED terminal. Se arquivo já foi escrito mas confirmação falha, UNCERTAIN exige reconciliação; não se promete rollback remoto/local. Conteúdo é dado do provedor, classificação pertence ao consumidor.

### 4. SSRF: reuso, não reimplementação

- Importa `resolveAndGuardOutboundUrl`/`fetchWithSsrfGuard`/`EgressGuardOptions` de `@cvg/shared`; não copia o guard. Transporte default reutiliza `adapters/ssrf-node.ts`, pinando sockets ao endereço validado em cada hop (Host/SNI preservados). O transporte recebe `maxResponseBytes` para limitar buffering antes de construir Response. `fetchImpl` é seam confiável de composição, nunca input do agente.
- Default de composição: `allowedHosts` **obrigatório** (vazio → boot `throw`, fail-closed — não há egress para host não listado); `allowPrivateNetworks: false`; `allowedProtocols: ['https:']`.
- Guardas cobrem: host privado, loopback, metadata, scheme http, allowlist vazia, URL malformada — todos `REJECTED` antes de journal e antes de `fetch`.

### 5. Journal e idempotência (reuso do gateway)

- Reusa `ChannelEffectJournal` (`prepare`/lease → `confirm`/`fail`/`uncertain`) e a identidade de efeito já existente; `operationKey` do input é a chave de idempotência (chave ausente → `REJECTED`; replay com a mesma chave → resultado cacheado, sem segundo `fetch`).
- `uncertain` é o estado para timeout/abort de rede (nunca `confirm` sem resposta); o consumidor reconcilia. Nenhuma segunda cópia do spine.
- Hash inclui operação, raiz vinculada, path, URL normalizada, intenção e hash dos bytes de upload (tamanhos iguais não mascaram conteúdo divergente). Identidade inclui tenant, channel `exam-file` e operationKey; upload/download com mesma chave conflitam pelo hash da operação. Lease owner único por chamada. Sucesso depende de `complete === committed`; falha do journal depois de envio preserva SENDING/UNCERTAIN não repetível, sem sucesso presumido.
- A raiz é vinculada ao tenant pela composição, como PDSH-012. Revalidação recusa troca de symlink durante awaits; isto não é contenção contra um processo host adversarial trocando ancestors no intervalo síncrono. Não concede modo EGRESS irrestrito: WORKSPACE + approval + canal/DNS-bound guard governam a ferramenta.

### 6. O que este cartão NÃO faz

- **Não** publica provider real (nenhum host de exame é alcançado neste repo; `fetchImpl` é injetado nas testes).
- **Não** muda o schema de anexo do canal (`MessageAttachment`, 25 MiB) — o egress de arquivo é tool separada, não mensagem.
- **Não** adiciona tool ao perfil do Assistente de Plantão (`products/**` intocado; a exposição ao agente é cartão do produto).
- Não cria workspace novo nem dependência de terceiros. Lockfile sincroniza apenas dependências locais `channel-gateway → harness-contracts/sandbox` e devDep `harness → channel-gateway` para a guarda de integração.

## Critérios de pronto (plano 0375)

- [x] `packages/channel-gateway/src/exam-egress.ts` com `createExamUploadTool`/`createExamDownloadTool` no formato `ToolDefinition`.
- [x] Upload e download com `sandbox: 'WORKSPACE'`, `requiresApproval: true`, `risk: 'HIGH'`, `sideEffect: 'EXTERNAL'`, `idempotent: false`.
- [x] SSRF fail-closed: allowlist vazia → boot throw; host/scheme privado → `REJECTED` antes de journal e `fetch`.
- [x] Journal reservado antes de qualquer egress; `uncertain` em timeout; idempotência por `operationKey`.
- [x] Download: teto `maxFileBytes`, escrita atômica, nada escrito em resposta não-2xx.
- [x] Exports em `packages/channel-gateway/src/index.ts` + PUBLIC_API/consumer-surface.
- [x] Guardas cobrindo os casos acima; guards/suíte completa/typecheck/lint/prettier passaram; links foram validados e serão rechecados no fechamento documental.

## Verificação

- `npx vitest run packages/channel-gateway/src/__tests__/pdsh-016-exam-egress.test.ts`.
- `npx tsc -p tsconfig.typecheck.json --noEmit`; `npm run lint`; prettier; `npm run docs:check-links`.
- Suíte completa sem regressão (guards PDSH-010..015 e PDSH-004 intactos).

## Fora de escopo

PDSH-020..033 (Ondas 3–4), `products/**`, push/deploy/release.

## Fechamento local — 12/10/2026

`DONE_LOCAL`, evidência [PDSH-016](../04_audit/evidence/PDSH-016-20261012/summary.md).
28 guardas de egress + 1 transporte real loopback + 3 integração kernel; superfície pública 7 e catálogo 4. Catálogo regenerado agora contém 7 ferramentas (inclui `exam.upload`/`exam.download`).

Gates em Node 22.23.2: suíte completa com PG 376 arquivos/3180 PASS e 1 skip; `test:postgres` 37 arquivos/302 PASS, zero skips; typecheck/lint/prettier/catalog verdes. A fronteira retornou inicialmente INCOMPLETE em 13 sítios PDSH-011/014: self-review separada + exceções por expressão/linha/ocorrência e pins SHA-256 dos arquivos inteiros, com negativos de mutação e import proibido; resultado local PASS. Não é aceite independente HISO-005.

O gate PG revelou regressão de compatibilidade PDSH-001: a ponte injetava signal interno em `ToolInvocation` sem opt-in do caller, tornando o executor sintético que devolve a chamada não serializável. Campo opcional preservado quando `cancelSignal` ausente, sinal combinado mantido quando presente; guarda de resultado serializável e fluxo PG original passaram (144 testes focados). Falha posterior da infraestrutura temporária (512 MiB, ENOSPC no WAL) foi preservada e corrigida com contêiner próprio 4 GiB; suíte completa e PG reexecutados sem mudar critérios.

Limites: composição deve vincular raiz ao tenant e usar journal durável para durabilidade entre processos. A guarda unitária usa journal in-memory; a regressão PG comprova o runtime existente, não envio real de exames. Sem provider/dado real/GO. E2E/certify/coverage nova e execução GitHub Actions não rodados neste cartão; integração CI dos catálogos permanece PDSH-033 e Dockerfile sandbox permanece diferido de PDSH-011.
