# AUD0625: correções da auditoria 0625 (onda única)

Rascunho da descrição do PR, em português, para o Ricardo ler. Base `main` em `8429019b`. Todo o código foi feito e testado só com dados sintéticos, localmente. O PR da imagem Debian 13 (F09) vai **antes** deste, porque o `image-scan` reprova qualquer PR até a troca da base.

## Em uma frase

Fecha, em oito frentes, os achados da auditoria 0625 que cabiam a Claude: o texto aprovado é o que o modelo recebe, canais e exames não reenviam o que já saiu, as ferramentas de arquivo ficam presas ao diretório concedido, a decisão de uma aprovação deixa registro mesmo depois de a execução avançar, e o estado do programa fica escrito nos livros.

## As frentes

Sempre: achado → SPEC e recibo → o que mudou → SHAs locais → testes (Node 22) → revisão independente → testes antigos ajustados.

### 1. SPEC 0267, modelo (F06, F10, F11)

- **Achado:** a instrução enviada ao modelo podia ser outra que a aprovada (só o hash era conferido); a classificação do prompt não valia na rota; uso de tokens ausente virava zero.
- **SPEC e recibo:** 0267, aprovada com o texto de sha256 `d0d8b19c95cb94567f4218c91271cd73c970f68348e8e442c09fb5869fdcc8e6`; recibo `human-decisions-2` (`6d4659f1…`), com as três recomendações. O arquivo depois do BUILD tem `76b76479…` (só estado e §8).
- **O que mudou:** o gateway monta ele mesmo a instrução a partir do prompt aprovado e recusa (`prompt_content_mismatch`) qualquer outra; a classe mais restritiva entre prompt e pedido decide a rota; sem contadores o resultado vem como `unreported` com custo conservador, e uso e orçamento são registrados antes de a saída ser validada.
- **SHAs:** SPEC e testes `cb787dc4`/`ca515ac3`; BUILD `d6d92958`; correções da revisão `91b6777e`.
- **Testes:** pacote `model-gateway` mais servidor de falhas, 12 arquivos e 225 testes passam (eram 212); typecheck e lint sem erro.
- **Revisão independente (sessão 07, `26a4cd55`):** APPROVE com achados (sem P0/P1). Um P2 de teste: o teste de custo não reportado passa mesmo sem a regra nova. P3: o medidor não olha `usageStatus`, falta teste do digest do material e de alguns eventos. 12 de 22 mutações sobreviviam. **Corrigido em `91b6777e`:** o medidor passa a respeitar `usageStatus` (R2), o teste de custo ganhou preço e custo exato (R1), e há testes para o adaptador, os eventos, uso parcial, duas mensagens `system` e o corpo ponta a ponta (R3–R6); R7–R9 ficam registrados. Agora 21 das 22 mutações morrem; a que sobra é código defensivo inalcançável.
- **Testes antigos ajustados:** `gateway-hardening` (prompt CLINICAL virou CONFIDENTIAL, porque CLINICAL não alcança modelo algum); `local-http-providers` ×2 (sem contadores agora é indefinido, não 0/0); `tests/model-fault-server.test.ts`, 6 casos MF01/MF02, com um adaptador de teste que repassa só as mensagens dinâmicas porque o servidor de falhas fixa um corpo de uma mensagem (acompanhamento F06b).

### 2. SPEC 0268, canais (F12) e acompanhamento do 2xx grande

- **Achado:** um erro 5xx depois do envio liberava o reenvio da mesma mensagem.
- **SPEC e recibo:** 0268, sha256 `1c3f23978b34b919b53cb2bd91e98e5a122154df869551da307cf31077639992`; recibo `human-decisions-2`.
- **O que mudou:** 5xx deixa a operação incerta (`UNCERTAIN`) e não reenvia; 429 continua podendo repetir; 4xx continua definitivo. No acompanhamento, uma resposta 2xx com corpo acima do limite também fica incerta (antes virava `FAILED`, o que dizia "não enviado" de uma mensagem aceita). A SPEC não foi alterada; o complemento está em `BUILD-RESULT.md`.
- **SHAs:** BUILD `ba965eab` (sessão 07); acompanhamento `358d981b`, completado por `b1b5995f`.
- **Testes:** `channel-gateway` 185 passam; com o acompanhamento, `channel-gateway` + `apps/web` 50 arquivos e 356 testes. 10 mutações no código novo, 10 mortas; 12 de 13 no acompanhamento (a que sobra é equivalente).
- **Revisão independente:** minha, `1fa821e6`: APPROVE com um P2 anterior ao diff (o 2xx grande), corrigido em `358d981b`; a revisão da sessão 07 sobre o acompanhamento deu APPROVE.
- **Testes antigos ajustados:** `channel-gateway.test.ts:343` e `aud0621-0248-channel-bounds.test.ts:226` passaram de `retryable: true` para `retryable: false` + `effectUnknown: true` (mais fortes, não mais fracos); três casos de corpo grande do mesmo arquivo agora afirmam `UNCERTAIN`.
- **Decisão registrada (G2):** um 3xx com corpo grande continua `FAILED` (um redirecionamento não processa o pedido), agora fixado em teste nos dois adaptadores (`b1b5995f`). **Não corrige:** 429 sem espera nem teto de tentativas (F12c).

### 3. SPEC 0269, console (F17), mais testes

- **Achado:** o console só mostrava as 25 primeiras conversas; "Abrir caso" de uma aprovação mais distante nunca achava a conversa.
- **SPEC:** 0269 é T2 (sem mudança de contrato nem de API); não há recibo.
- **O que mudou:** botão "Carregar mais conversas" e busca por páginas ao abrir um caso, com teto de 20 páginas, mensagem própria para falha de rede, descarte de página que chega depois de trocar o operador, sem duplicar conversas. Só `App.tsx` e os testes.
- **SHAs:** implementação `8f22e350` (sessão 07); correções e testes `358d981b`, dentro do acompanhamento `b1b5995f`.
- **Testes:** 11 casos (eram 3); 12 de 13 mutações morrem.
- **Revisão:** minha em `1fa821e6` (APPROVE, com a lacuna de teste que `358d981b` fechou) e da sessão 07 (APPROVE).
- **Testes antigos ajustados:** nenhum.

### 4. SPEC 0270, ferramentas de arquivo (F03, F04) e revisão

- **Achado:** `fs.read`/`fs.write` ignoravam o diretório concedido e podiam escrever fora se o diretório fosse trocado por um link durante a espera do registro.
- **SPEC e recibo:** 0270, aprovada com o texto de sha256 `86f5178b79e7bf1cdd024fe3e7a1c397e9ea6ca92fa53cd90336978e4fd2375f`; recibo `human-decisions-2`. As decisões D1 (exigir a concessão), D2 (recusar qualquer link) e D3 (Linux, `/proc/self/fd`) foram aprovadas "como está".
- **O que mudou:** as quatro ferramentas exigem a concessão do sandbox, caminham por descritor de diretório sem seguir link, e a escrita falha, sem gravar, se o caminho mudou. Depois da revisão, `fs.write` também recusa um link final, leitura limitada ao tamanho máximo e identidade comparada em 64 bits.
- **SHAs:** SPEC `e52451bd`; BUILD `3f2693cb`; correções da revisão `0ddea872`, `d79baa0d`.
- **Testes:** 107/107 (sandbox, integração pdsh-012 e superfície pública) depois da revisão; antes dela, a suíte completa do DF teve 495 arquivos e 7.111 testes passando.
- **Revisão independente (minha):** primeira rodada REVISE pequeno (`f2e87a18`: um P2, `fs.write` trocava o link final); confirmação APPROVE (`4d633576`) em `0ddea872`, com as mutações que sobreviviam agora mortas.
- **Testes antigos ajustados:** `pdsh-012-fs-tools` só passa a enviar uma concessão `WORKSPACE`.
- **Limites aceitos, com acompanhamento F03b:** `fsync` síncrono, hardlink para fora, raiz aberta pelo nome.

### 5. SPEC 0272, decisão de aprovação (F08)

- **Achado:** se o sistema caía entre decidir a aprovação e registrar o evento, e a execução já avançava, o evento nunca mais era registrado.
- **SPEC e recibo:** 0272, sha256 `78b43491d82858257673c88351e8d1f1d908ce2331654028f32fe19f0b7e3477`; recibo `human-decisions-3` (`8e667305…`), opção A.
- **O que mudou:** a recuperação aceita as aprovações já avançadas (`RESERVED`, `EXECUTING`, `EXECUTED`) sem retomar a execução, e o worker passa a procurá-las; o evento recuperado leva `recovered: true`.
- **SHAs:** SPEC `2078711a`; BUILD `65cb22f0` (sessão 07); correções da revisão `f250bf72`, `94725d37`, `b90f2484` e `e5c1c732` (**SHA final**).
- **Testes:** PostgreSQL 16.15 descartável 16/16 (eram 11/11) com `EXPLAIN` (anti-join pelo índice `uq_audit_approval_decision`, 7,7 ms com 10 mil linhas); `vitest` focado de agent-core e worker 36 passam; a suíte completa da sessão 07 teve 7.109 testes passando e um tempo esgotado por carga em um arquivo não tocado. Dois testes antigos da migration 0021 (`CREATE INDEX CONCURRENTLY`) estouraram 120 s uma vez sob carga e passaram isolados e em duas execuções completas seguintes.
- **Revisão independente (minha):** primeira rodada REVISE pequeno (`5fee567b`): o seletor ampliado tinha dois P2 (uma linha irrecuperável travava as seguintes; custo crescente). A sessão 07 corrigiu (isolamento por linha, piso de 30 s, teto de 24 h configurável, pool de teste que interpreta o SQL): **APPROVE em `f250bf72`** (`33997910`). As duas observações novas (N1: o backfill travava com 25 linhas sem envelope; N2: erro de infraestrutura engolido por linha) foram corrigidas em `94725d37`: o SQL exclui e conta as linhas sem envelope, e erros de conexão derrubam o tick. A confirmação (`48d7a963`) deixou uma ressalva: os erros do cliente `pg` sem código ainda eram isolados por linha. Foi corrigida em `b90f2484` (só `ApprovalReconciliationDataError` é isolado, o resto relança), confirmação D9 `APPROVE` (`a58205979`). F08d corrigido em `e5c1c732`, confirmação D9 `APPROVE`: os erros tipados `invalid_action`, `conflict` e `ApprovalError not_found` são isolados por linha; `lease_lost` e o resto derrubam o tick. Observação (custo conhecido): `not_found` e `validation_failed` de `OperationalExecutionError` no resume ainda derrubam o tick.
- **Testes antigos ajustados:** o teste de caracterização "decision mismatch" foi trocado por "não retoma e marca recuperado"; o controle do seletor acompanha o novo SQL.

### 6. SPEC 0273, exames (F12b)

- **Achado:** o envio de exame (`exam.upload`) com resposta 5xx era gravado como `FAILED`, o que dizia "não enviado" e permitia recriar com outra chave, duplicando o exame no destino.
- **SPEC e recibo:** 0273, sha256 `f9dfc655d63fc043c508c4434539551201ced47660813f8c9beef3b66ca975fe`; recibo `human-decisions-4` (`45106f97…`): só o envio, 4xx e 429 seguem `FAILED`, ajustar o teste antigo.
- **O que mudou:** upload com 5xx depois do envio fica `UNCERTAIN` (pede reconciliação); download, 4xx, 429 e 2xx não mudam.
- **SHAs:** SPEC e testes `cd754e6c`; BUILD `d9a35aa9`.
- **Testes:** `channel-gateway` 17 arquivos e 198 testes; 8 de 8 mutações morrem.
- **Revisão independente:** Claude DF, APPROVE, sem achados (o upload com 5xx reusa o `uncertain()` existente e o predicado `statusEffectOptions`; download, 4xx e 429 seguem `FAILED`; as 8 mutações morrem).
- **Testes antigos ajustados:** `pdsh-016-exam-egress.test.ts:258–280` usava um 503 como exemplo de rejeição; passou a usar um 400, e o 503 do upload é afirmado por quatro testes novos.

### 7. Livros e README (F20)

- **O que mudou:** blocos de 28/10 em `99_runtime_state`, `20_master_execution_log` e `30_backlog_master` e no estado do `README` (auditoria 0625, PR #29, decisões, frentes com dono); cópia byte a byte do relatório 0625, das evidências do Codex e dos recibos `human-decisions` 1 a 4.
- **SHAs:** `581b5c07`, `3da38a35`, recibos `8f45a01a`, `add9812c`, `daf3839a`.
- **Testes:** `prettier`, `docs:check-links` e `gitleaks` sem achados. Os livros ainda serão atualizados uma vez, no fim, com a lista final de SHAs.
- **Ajuste conhecido:** 16 entradas em `doc-link-policy.json` cobrem links do `report-review.md` do Codex; saem quando o Codex corrigir os links dele.

### 8. Política de links da integração (`ba041eeb`)

- **Por quê:** a suíte da integração falhou em `doc-source-moves`: as 16 entradas acima foram contadas como as 20 movimentações históricas do HISO.
- **O que mudou:** o teste histórico passa a nomear HISO-004 e HISO-007 (continuam exatamente 20, mesmos pares e hashes), um teste novo fixa as entradas da AUD0625, e cada entrada ganha sua razão. Só teste e política de links.

## Fora desta onda (com dono)

- **Imagem com base Debian 13 (F09):** Codex AUD0625, PR próprio, vai antes. API, worker e TLS passam em `6494d2f63`; heartbeat e inventário estão em curso; **ainda não qualificada**.
- **F01, F02, F05; SPECs 0257, 0258, 0262, 0263; F13, F18, F19:** Codex.
- **F15 (SPEC 0271):** adiada, dono DF; só afeta bancos com eventos de atendimento anteriores à migration 0021.
- **Acompanhamentos:** F12c (429 sem espera), F06b (oráculo da SPEC 0232 aceitar o `system`), F03b (hardlink), F08b (`FAILED`/`CANCELLED`/`EXPIRED` depois de `APPROVED`, dono DF), F08c opcional (índice `(tenant_id, updated_at)` em `operational_executions`, sugerido pelo `EXPLAIN`); F08d (corrigido em `e5c1c732`).
- **Achado 9104:** `tests/claude100/reference-port/controller.test.js` falha também na `main` local, sem relação com a onda; dono Codex.
- **Servidor (U10), IdP (U09) e piloto (U23):** Ricardo e hospital.

## Não concede

- **Produção continua `NO_GO`.** Nada aqui é aceite de produção, deploy, servidor nem dado real.
- Regra de carga (8980): nada de `npm test` completo nem `test:postgres` em paralelo; só `vitest` focado com `--maxWorkers=2`.
- Os testes foram todos locais e sintéticos. A suíte completa da onda roda uma vez, na integração, com a máquina menos carregada; o PostgreSQL e o E2E dependem da CI deste PR.
- Merge só com `squash`, no SHA exato, depois dos 5 checks obrigatórios verdes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
