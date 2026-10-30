# SPEC 0293 — Spill de saídas grandes e poda de resultados de ferramenta (PAR-C03)

R1, 30/10/2026. Task `AUD0625-PAR-C03-D9-20261030`, cartão PAR-C03 da [0380](../03_build/0380_backlog_paridade_100_deepseek.md) (P1, tamanho M,
depende de PAR-S01; absorve P100-021 e o spill proposto na [0224](0224_pare100_complete_tool_result_context.md)). Estado
`PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: nova porta pública, novo conteúdo que o modelo recebe, nova ferramenta e (na fatia 4) migration.
**Sem BUILD até revisão humana explícita deste documento.** Base: `claude/aud0625-par-c01-d9` @ `5a715d4c5`.

## 1. Evidência atual

Detalhes e medições em
[DISCOVERY](../04_audit/evidence/AUD0625-PAR-C03-D9-20261030/DISCOVERY.md); prova de fase 1:
`packages/harness/src/__tests__/aud0625-par-c03-spill-and-prune.test.ts` (2 controles, 5 `it.fails`).

- Uma saída de ferramenta chega ao modelo como **300 caracteres de cabeça, sem aviso de corte**; o `payload` guarda 4 000 caracteres de cabeça numa
  string que termina em `…[truncated]`, sem cauda, sem tamanho e sem localizador. O conteúdo completo de uma ferramenta de leitura não sobrevive.
- O sandbox corta a 1 MiB (teto 8 MiB) e informa só `truncated: true`; esse sinal não chega ao modelo.
- O log de sessão nunca carrega a saída (`tool/result` = identidade + `outcome`): o risco é perder o conteúdo, não vazá-lo pelo log.
- A compactação da C01 envia ao resumidor mensagens `tool` inteiras.

## 2. Objetivo, invariantes e limites

Texto grande é gravado fora do contexto e o modelo recebe **prévia (cabeça e cauda), tamanho exato, aviso de corte e um localizador opaco**; resultados
antigos saem do contexto do mesmo modo. Nada é descartado em silêncio.

- **I1 Sem descarte silencioso.** Todo corte mostra `bytes` exatos, `sha256` curto, quanto foi omitido e se o conteúdo foi armazenado.
- **I2 Conteúdo não é autoridade.** Prévia e conteúdo lido continuam `UNTRUSTED`, em moldura de dado, nunca `system`; o localizador não concede acesso
  sozinho (a leitura exige tenant e sessão corretos).
- **I3 O spill não substitui o journal.** O resultado de um efeito segue no journal da [0225](0225_pare100_complete_tool_result_journal.md); o spill é
  uma cópia de leitura. Poda e expiração nunca alteram journal, checkpoint, aprovação ou pin.
- **I4 Isolamento.** Leitura exige o mesmo tenant e a mesma sessão da escrita; qualquer divergência é `not_found`, indistinguível de ausência.
- **I5 Tudo limitado.** Gravação ≤ `maxStoredBytes`; prévia ≤ cabeça + cauda; leitura ≤ `readMaxBytes`; localizadores por turno ≤ 64; cota por tenant.
- **I6 Exatidão e idempotência.** O `sha256` e o `bytes` devolvidos são os do conteúdo gravado; regravar o mesmo `(tenant, sessão, operationKey,
sha256)` devolve o mesmo localizador.
- **I7 Cancelamento.** Nenhuma gravação começa depois do cancelamento; uma em voo é abortada e o objeto parcial nunca fica visível (commit atômico).
- **I8 Prévia segura.** Cortes caem em limite de ponto de código UTF-8; `bytes` são bytes, não caracteres.
- **I9 Origem.** `truncated: true` do sandbox vira `cortadoNaOrigem` no aviso; o que o sandbox já descartou não é recuperável e o aviso diz isso.
- **I10 Dado clínico.** O conteúdo herda a classificação da ferramenta; auditoria e telemetria carregam apenas hash do localizador, `bytes` e `sha256`.

Fora de escopo: continuação do shell além do teto do sandbox (cartão de PAR-T04); imagens (PAR-C04); compactação manual (PAR-C05); qualidade do
resumo.

## 3. Mudança proposta

### 3.1 Porta `SpillStore` (`@cvg/harness-contracts`)

`put({tenantId, sessionId, executionId, operationKey, sourceId, classification, mediaType, content, signal}) → {locator, bytes, sha256, createdAt,
expiresAt}` e `read({tenantId, sessionId, locator, offset, length, signal}) → {text, offset, bytesRead, totalBytes, eof}`. Erros distintos:
`SpillNotFound` (inclui tenant/sessão errados), `SpillExpired`, `SpillTooLarge`, `SpillQuotaExceeded`, `SpillStorageUnavailable`, `SpillCommitUnknown`
(nunca vira sucesso nem repetição automática). Localizador: `spill_` + 128 bits aleatórios em base64url; sem caminho, tenant, sessão ou conteúdo;
o armazenamento guarda apenas o hash do localizador. Adaptadores: em memória (testes e fatias 1–3) e Postgres (fatia 4, migration nova, tabela
ligada a tenant e sessão, expurgo por validade).

### 3.2 Política `SpillPolicy`

`thresholdBytes` 8 192 (acima, vai para o depósito), `previewHeadBytes` 2 048, `previewTailBytes` 1 024, `maxStoredBytes` 8 MiB (o teto do sandbox),
`ttlMs` 24 h limitado pela retenção da sessão, `readMaxBytes` 32 768, `keepRecentToolResults` 2. Valores validados fail-closed.

### 3.3 Representação para o modelo

Um bloco de dado (`user`/`UNTRUSTED`), nunca `system`: `[resultado de ferramenta cortado] ferramenta=<id> bytes=<n> sha256=<16 hex>
armazenado=sim|não locator=<id> omitidos=<k> [cortadoNaOrigem]`, seguido de `--- início ---`, cabeça, `--- fim ---`, cauda. Abaixo do limiar, o
resultado passa como hoje. O `summary` de 300 caracteres da observação também ganha o marcador de corte (corrige o achado 1 mesmo sem depósito).

### 3.4 Poda

Antes de a compactação da C01 resumir o prefixo (e antes do cálculo de pressão), mensagens `tool` fora das `keepRecentToolResults` mais recentes e
acima de um orçamento viram o mesmo bloco de prévia + localizador (ou, sem depósito, prévia + `armazenado=não`). Nunca são podados: instruções
`system` governadas, pins (aprovação, pergunta, efeito por referência, fato), o resultado em uso na decisão corrente.

### 3.5 Gravação e falha

A gravação ocorre antes de a observação existir, com uma tentativa mais uma nova tentativa só para erro `retryable === true` (regra da C01). Falha =
prévia com `armazenado=não`; se a ferramenta declara `requiresCompleteResult` (decisiva, [0224](0224_pare100_complete_tool_result_context.md)) o
turno encerra com `INSUFFICIENT_EVIDENCE` antes do modelo. `SpillCommitUnknown` conta como falha e fica marcado no aviso.

### 3.6 Leitura: ferramenta `spill.read`

Capacidade de leitura, `UNTRUSTED`, passa por política, orçamento e contagem de chamadas como qualquer ferramenta; devolve no máximo
`readMaxBytes` por chamada com `offset` e `length` validados. Localizador expirado devolve `{status:'EXPIRED'}`, e o contexto não mostra mais
`armazenado=sim` para ele.

## 4. Fatias de BUILD previstas

1. Contratos, política, prévia segura, depósito em memória e integração na observação do laço iterativo (inclui o marcador no `summary`).
2. Poda no controle de compactação (liga com a C01) e no histórico `tool`.
3. `spill.read`, expiração e cota.
4. Adaptador Postgres e migration (T3 própria).

## 5. Critérios de pronto

- Os 5 `it.fails` viram `it`; os 2 controles seguem verdes.
- Prova por regra: prévia com cabeça, cauda, bytes, hash e aviso; conteúdo gravado byte a byte uma vez; falha de gravação nunca silenciosa; corte sem
  depósito também avisa; poda com localizador no histórico da compactação; `truncated` do sandbox propagado.
- Limites: limiar exato (`=`/`+1`), cabeça/cauda em UTF-8 multibyte e par substituto, `bytes` ≠ `caracteres`, `readMaxBytes`, `offset`/`length`
  inválidos, cota, 64 localizadores por turno.
- Segurança: tenant ou sessão errados = `not_found`; localizador adivinhado; expirado não servido; conteúdo nunca em `system`; auditoria sem conteúdo;
  cancelamento antes, durante e depois do `put`; idempotência por `operationKey`.
- Interação: pins e journal intactos pela poda; estimador único; a poda antes do resumo da C01.
- Mutantes: limiar fora por um; cauda perdida; corte no meio de ponto de código; `bytes` por caracteres; aviso omitido; falha da gravação engolida;
  `put` sem `await`; localizador derivado do conteúdo ou com tenant embutido; leitura entre tenants/sessões; expirado servido; leitura acima do
  máximo; idempotência quebrada; poda atinge as `keepRecent` mais recentes, um pin ou o `system`; poda depois do resumo; `put` depois do abort;
  conteúdo promovido a `system`; limite de 64 ignorado; `truncated` do sandbox perdido; conteúdo em auditoria.
- model-gateway, harness e consumidores verdes; 100% por arquivo em `packages/harness/src/**`; typecheck, eslint, prettier, `docs:check-links`,
  `skip:governance`.

## 6. Decisões pedidas ao Ricardo

- **D1. Onde guardar.** (A, recomendada) porta dedicada `SpillStore` com adaptador em memória e Postgres (tabela nova por migration, ligada a tenant e
  sessão, expurgo por validade). (B) pedaços no log de sessão da S01 (mistura trilha de auditoria com blob; evento de 1 MiB; replay caro). (C) arquivo no
  disco (expõe caminho, TOCTOU, sai do isolamento por tenant).
- **D2. Limiares.** (A, recomendada) spill acima de 8 KiB; prévia 2 KiB + 1 KiB; gravar até 8 MiB; ler 32 KiB por vez. (B) prévia maior (mais contexto
  por resultado, menos poda).
- **D3. Falha de gravação.** (A, recomendada) nunca silenciosa: prévia marcada `armazenado=não`; recusa o turno só para ferramenta marcada
  `requiresCompleteResult`. (B) recusar sempre (mais estrito, bloqueia leituras banais). (C) continuar sem avisar: rejeitada pelo aceite do cartão.
- **D4. Retenção.** (A, recomendada) valida até a retenção da sessão, padrão 24 h, máximo 7 dias, expurgo no adaptador. (B) sem validade (retenção de
  dado clínico sem prazo).
- **D5. Como o modelo lê o resto.** (A, recomendada) ferramenta `spill.read` governada e contada no orçamento. (B) o anfitrião reinjeta o conteúdo
  inteiro sob demanda (desfaz a redução de pressão).
- **D6. Poda.** (A, recomendada) podar resultados `tool` além dos 2 mais recentes antes da compactação da C01, sem tocar pins, journal ou `system`.
  (B) só gravar na chegada, sem poda.
- **D7. Conteúdo gravado.** (A, recomendada) bruto, com a classificação da ferramenta, preso a tenant e sessão, protegido pelo cofre/criptografia do
  banco. (B) cópia redigida (altera o dado, quebra o `sha256` e o uso posterior).
