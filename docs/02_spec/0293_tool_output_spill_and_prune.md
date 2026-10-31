# SPEC 0293 — Spill de saídas grandes e poda de resultados de ferramenta (PAR-C03)

R2, 30/10/2026 (R1 + correções da revisão da 07 (`AUD0625-REVIEW-PAR-C03-07-20261030/REVIEW.md`, branch `claude/aud0625-par-s04-07` @ `3126680ae`), 1 P1, 5 P2 e 5 P3, todos tratados abaixo). Task `AUD0625-PAR-C03-D9-20261030`, cartão PAR-C03 da [0380](../03_build/0380_backlog_paridade_100_deepseek.md) (P1, tamanho M,
depende de PAR-S01; absorve P100-021 e o spill proposto na [0224](0224_pare100_complete_tool_result_context.md)). Estado
`PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: nova porta pública, novo conteúdo que o modelo recebe, nova ferramenta e (na fatia 4) migration.
**Sem BUILD até revisão humana explícita deste documento.** Base: `claude/aud0625-par-c01-d9` @ `5a715d4c5`. Mudanças de R1 para R2 estão marcadas com **[R2]**.

## 1. Evidência atual

Detalhes e medições em
[DISCOVERY](../04_audit/evidence/AUD0625-PAR-C03-D9-20261030/DISCOVERY.md); prova de fase 1:
`packages/harness/src/__tests__/aud0625-par-c03-spill-and-prune.test.ts` (2 controles, 9 `it.fails`: 5 de R1 e 4 de R2).

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
- **I11 [R2] A leitura não entra no ciclo.** O resultado de `spill.read` nunca é guardado de novo nem vira prévia: é entregue inteiro (até
  `readMaxBytes`), com o orçamento de contexto da leitura contado pelo estimador único; uma leitura que não cabe no que resta do contexto é recusada antes
  da chamada, não reduzida. A exceção vale só para a capacidade da casa `spill.read` (o nome é reservado no registro de ferramentas; terceiros não podem
  registrá-lo).
- **I12 [R2] Moldura não forjável.** O bloco declara o tamanho da prévia em bytes (`previewHeadBytes`, `previewTailBytes`) e usa um marcador por bloco
  (16 hex de CSPRNG, gerado pelo anfitrião depois que o conteúdo existe, regerado se o conteúdo o contiver); delimitadores sem o marcador não fecham o
  bloco. Uma linha do conteúdo que imite cabeçalho ou delimitador não altera o que o bloco declara.
- **I13 [R2] Texto podado é função pura.** A forma de uma saída (inline, prévia ou prévia + localizador) é função apenas do conteúdo, da política e do
  estado do armazenamento no instante da renderização, decidida **uma vez**, na chegada, e nunca reescrita: expirar um localizador muda a leitura, não o
  texto já enviado; a poda não é revertida (o cache de prompt do provedor não é invalidado por reescritas). O `sourceDigest` da C01 é calculado sobre o texto
  efetivamente enviado ao resumidor.
- **I14 [R2] Composição fail-closed.** Um depósito declara `durability: 'process' | 'shared'`. Sem um depósito `shared` na composição, ou se o
  depósito não responde, a política devolve `armazenado=não` (prévia sem localizador). Depósito `process` só é aceito em composição de teste explícita.

Fora de escopo: continuação do shell além do teto do sandbox (cartão de PAR-T04); imagens (PAR-C04); compactação manual (PAR-C05); qualidade do
resumo.

## 3. Mudança proposta

### 3.1 Porta `SpillStore` e contratos (`@cvg/harness-contracts`)

`put({tenantId, sessionId, executionId, operationKey, sourceId, classification, mediaType, content, signal}) → {locator, bytes, sha256, createdAt,
expiresAt}` e `read({tenantId, sessionId, locator, offset, length, signal}) → {text, offset, bytesRead, totalBytes, eof}`; `durability: 'process' |
'shared'` (I14). Erros distintos: `SpillNotFound` (inclui tenant/sessão errados), `SpillExpired`, `SpillTooLarge`, `SpillQuotaExceeded`,
`SpillStorageUnavailable`, `SpillCommitUnknown`. Localizador: `spill_` + 128 bits aleatórios em base64url; sem caminho, tenant, sessão ou conteúdo; o
armazenamento guarda só o hash do localizador. Adaptadores: em memória (`durability: 'process'`, só composição de teste) e Postgres (`'shared'`,
migration nova, tabela ligada a tenant e sessão).

**[R2] Marca nova em `ToolDescriptor`:** `requiresCompleteResult?: boolean` (opcional, padrão `false`), declarada pelo autor da ferramenta. Ela não existe
na 0224; é uma mudança de contrato desta SPEC e a 0224 pode adotá-la. Uma ferramenta só se declara decisiva no código do anfitrião, nunca pelo texto de
um resultado.

### 3.2 Política `SpillPolicy`

`thresholdBytes` 8 192, `previewHeadBytes` 2 048, `previewTailBytes` 1 024, `maxStoredBytes` 8 MiB (o teto do sandbox), `ttlMs` 24 h, `ttlMaxMs` 7
dias, `readMaxBytes` 32 768. **[R2]** Cota: `maxObjectsPerSession` 256 e `maxBytesPerTenant` 256 MiB; o estouro é `SpillQuotaExceeded`, que vira
`armazenado=não` (nunca expulsa um objeto existente em silêncio). Valores validados fail-closed. `keepRecentToolResults` e "orçamento de poda" **foram
retirados em R2**: ver §3.4.

### 3.3 Renderização para o modelo

**[R2] O ponto de mudança é `summarizeObservation` do `DefaultContextEngine` (`context-engine.ts:60`).** Hoje o modelo vê só `summary` (300 caracteres de
cabeça, ~400 com a proveniência) e a prévia fica invisível. Passa a valer, por observação `TOOL_RESULT`:

1. saída ≤ `thresholdBytes`: o texto da saída entra **inteiro** no item de contexto (no lugar do corte de 300 caracteres), medido pelo estimador único;
2. saída > `thresholdBytes`: entra o bloco abaixo (nunca `system`; `UNTRUSTED`), com o conteúdo completo no depósito;
3. `summary` (300) continua existindo para o checkpoint e ganha o marcador de corte quando cortado.

Bloco: `[resultado de ferramenta cortado:<marcador>] ferramenta=<id> bytes=<n> sha256=<16 hex> previewHeadBytes=<h> previewTailBytes=<t>
omitidos=<k> armazenado=sim|não [locator=<id>] [cortadoNaOrigem] [commitIncerto]`, depois `--- início:<marcador> ---`, a cabeça, `--- meio:<marcador>
---`, a cauda e `--- fim:<marcador> ---`.

**Relação com a [0224](0224_pare100_complete_tool_result_context.md).** A 0224 trata "resultado completo no contexto" (completo ou recusa, até 32 768
bytes) e ainda não foi construída. Esta SPEC cobre uma faixa menor (≤ 8 KiB inline) e o que a 0224 recusa (> limite dela); quando a 0224 entrar, a regra
dela prevalece para os resultados que ela admite completos, e o bloco acima é a terceira saída acima do seu limite, sem declarar "completo". Reconciliar
na fatia de integração.

### 3.4 Poda

**[R2] Poda é a mesma regra do §3.3 aplicada uma vez, na chegada** (função pura do conteúdo e da política, I13), e não uma segunda reescrita
posterior. As expressões de R1 "as `keepRecent` mais recentes" e "em uso na decisão corrente" foram retiradas: uma poda que depende da posição ou da
pressão do momento muda o texto de uma mesma mensagem entre duas tentativas, quebra a idempotência da C01 e invalida o cache de prompt. Reduzir o contexto
por pressão continua sendo trabalho da compactação da C01.

No controle de compactação da C01, mensagens `tool` do **prefixo** enviado ao resumidor passam pela mesma função (conteúdo > `thresholdBytes` vira bloco
com localizador); o `sourceDigest` é calculado sobre esse texto. Nunca são tocados: instruções `system` governadas, pins e o journal. O `put` é idempotente
(I6); se o objeto expirou entre duas compactações, a nova renderização gera outro texto e, por isso, outro `sourceDigest` (outro evento), o que é correto:
são fontes diferentes. O resultado de `spill.read` não é podado (I11); uma leitura antiga já enviada fica como foi enviada.

### 3.5 Gravação e falha

A gravação ocorre antes de a observação existir. **[R2] Regra única:** uma tentativa e, **somente** se o erro for `retryable === true` ou
`SpillCommitUnknown`, uma segunda (segura pela idempotência de I6); se a segunda também falhar, `armazenado=não` e, se foi commit incerto,
`commitIncerto` no bloco. Falha de gravação = prévia com `armazenado=não`. Se a ferramenta declara `requiresCompleteResult` o turno encerra com
`INSUFFICIENT_EVIDENCE` antes do modelo. Estouro de cota, depósito `process` fora de teste e depósito indisponível seguem a mesma regra.

### 3.6 Leitura: `spill.read`

Capacidade da casa, de leitura, `UNTRUSTED`, passa por política, orçamento e contagem de chamadas como qualquer ferramenta; devolve no máximo
`readMaxBytes` por chamada com `offset` e `length` validados. **[R2] O resultado não passa pelo spill nem pela poda (I11)**; o orçamento de contexto é
conferido antes da chamada (`length` reduzido ao que cabe, ou recusa). Localizador expirado devolve `{status:'EXPIRED'}`, e uma observação nova nunca
mostra `armazenado=sim` para ele. **[R2]** Fork e retomada (S04): o localizador é preso a tenant **e sessão**, logo um fork (sessão nova) não lê o spill do
pai e uma retomada (mesma sessão) lê; é o comportamento desejado.

### 3.7 Retenção, expurgo e proteção **[R2]**

O teto de 7 dias e a validade de 24 h são política desta SPEC (a persistência de sessão da S01 não tem retenção). O expurgo é um trabalho do worker
(varredura por validade, no molde de `sweepExpiredApprovals`) e há a operação `purge(tenant, sessão)` para apagamento a pedido. Proteção que existe de fato:
isolamento por tenant (RLS e tenant na chave), hash do localizador no banco, nenhum conteúdo em auditoria ou telemetria, e a criptografia de disco do
ambiente de implantação (não especificada neste repositório). Esta SPEC **não** promete cofre nem criptografia por objeto.

### 3.8 Por que não o armazenamento do journal de efeitos **[R2]**

O journal da [0225](0225_pare100_complete_tool_result_journal.md) guarda o resultado completo de **efeitos** (autoridade, até 1 MiB por linha, com RLS).
Reusá-lo para spill misturaria dois papéis (autoridade versus cópia de leitura descartável), limitaria o spill a 1 MiB (o sandbox chega a 8 MiB) e
tornaria expurgo e validade do spill capazes de afetar a autoridade do efeito (I3).

## 4. Fatias de BUILD previstas **[R2: reordenadas]**

1. Contratos (`SpillStore`, `SpillPolicy`, `requiresCompleteResult`), função pura de renderização com bloco não forjável, depósito em memória
   (`durability: 'process'`), regra de composição fail-closed (I14) e `summarizeObservation` (§3.3). Liga só em composição de teste.
2. Adaptador Postgres, migration e expurgo por validade (T3 própria). **Nada fora de teste usa spill antes desta fatia.**
3. `spill.read`, expiração, cota e `purge`.
4. Poda do prefixo no controle de compactação da C01 (liga com a C01).

## 5. Critérios de pronto

- Os 9 `it.fails` (5 de R1 e 4 de R2) viram `it`; os 2 controles seguem verdes.
- Prova por regra: prévia com cabeça, cauda, bytes, hash e aviso; conteúdo gravado byte a byte uma vez; falha de gravação nunca silenciosa; corte sem
  depósito também avisa; `truncated` do sandbox propagado; **[R2]** `spill.read` de 32 KiB volta inteiro e sem novo `put`; conteúdo que imita cabeçalho
  e delimitadores não altera o bloco; texto podado e `sourceDigest` estáveis entre duas passadas e depois de um localizador expirar; depósito `process`
  ou indisponível reporta `armazenado=não`.
- Limites: limiar exato (`=`/`+1`), cabeça/cauda em UTF-8 multibyte e par substituto, `bytes` ≠ `caracteres`, `readMaxBytes`, `offset`/`length`
  inválidos, cota (256 objetos por sessão, 256 MiB por tenant), 64 localizadores por turno, `put` repetido preserva `expiresAt`.
- Segurança: tenant ou sessão errados = `not_found`; localizador adivinhado; expirado não servido; conteúdo nunca em `system`; auditoria sem conteúdo;
  cancelamento antes, durante e depois do `put`; idempotência por `operationKey`; `commitIncerto` repete uma vez e marca.
- Interação: pins e journal intactos; estimador único; a função de poda é a mesma na chegada e no prefixo da C01.
- Mutantes: limiar fora por um; cauda perdida; corte no meio de ponto de código; `bytes` por caracteres; aviso omitido; falha da gravação engolida;
  `put` sem `await`; localizador derivado do conteúdo ou com tenant embutido; leitura entre tenants/sessões; expirado servido; leitura acima do máximo;
  idempotência quebrada; `put` repetido renova `expiresAt`; **[R2]** resultado de `spill.read` passa pelo spill; marcador do bloco derivado do conteúdo ou
  fixo; delimitador sem marcador aceito; `previewBytes` não conferido; poda dependente da posição ou da pressão; `sourceDigest` sobre o texto cru; depósito
  `process` aceito fora de teste; `commitIncerto` sem repetição; poda do `system` ou de pin; `put` depois do abort; conteúdo promovido a `system`; limite
  de 64 ignorado; `truncated` do sandbox perdido; conteúdo em auditoria.
- model-gateway, harness e consumidores verdes; 100% por arquivo em `packages/harness/src/**`; typecheck, eslint, prettier, `docs:check-links`,
  `skip:governance`.

## 6. Decisões pedidas ao Ricardo

- **D1. Onde guardar.** (A, recomendada) porta dedicada `SpillStore` com adaptador em memória (só teste) e Postgres (tabela nova por migration, ligada a
  tenant e sessão, expurgo por validade); nada fora de teste usa spill antes do Postgres. (B) pedaços no log de sessão da S01 (mistura trilha de
  auditoria com blob; evento de 1 MiB; replay caro). (C) arquivo no disco (expõe caminho, TOCTOU, sai do isolamento por tenant). (D) reusar o armazenamento
  do journal de efeitos (§3.8: papel e teto errados).
- **D2. Limiares.** (A, recomendada) saída ≤ 8 KiB entra inteira no contexto; acima disso bloco com prévia de 2 KiB + 1 KiB e conteúdo no depósito até 8
  MiB; leitura de 32 KiB por vez. (B) prévia maior (mais contexto por resultado, menos economia).
- **D3. Falha de gravação.** (A, recomendada) nunca silenciosa: prévia marcada `armazenado=não` (uma repetição segura se o erro for repetível ou o
  commit incerto); recusa o turno só para ferramenta com `requiresCompleteResult`. (B) recusar sempre. (C) continuar sem avisar: rejeitada pelo aceite.
- **D4. Retenção.** (A, recomendada) validade padrão de 24 h, teto de 7 dias, expurgo no worker e `purge` a pedido. (B) sem validade (retenção de dado
  clínico sem prazo).
- **D5. Como o modelo lê o resto.** (A, recomendada) `spill.read` governada, contada no orçamento, com resultado fora do spill e da poda. (B) o anfitrião
  reinjeta o conteúdo inteiro sob demanda (desfaz a redução de pressão).
- **D6. Poda.** (A, recomendada) a regra de §3.3 aplicada uma vez, na chegada e no prefixo da C01, sem reescrita posterior. (B) além disso, rebaixar
  resultados antigos por posição ou pressão (instável: muda o `sourceDigest` e o cache de prompt; só com um evento que registre a decisão).
- **D7. Conteúdo gravado.** (A, recomendada) bruto, com a classificação da ferramenta, preso a tenant e sessão, protegido por RLS e pela criptografia de
  disco do ambiente (sem promessa de cofre). (B) cópia redigida (altera o dado, quebra o `sha256`).
- **D8 [R2]. Cota e composição.** (A, recomendada) 256 objetos por sessão e 256 MiB por tenant, estouro vira `armazenado=não`; depósito `process` só em
  composição de teste. (B) sem cota (risco de estouro de disco por tenant).
