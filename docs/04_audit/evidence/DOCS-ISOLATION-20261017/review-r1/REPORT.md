# Revisão documental independente — R1

Task `DOCS-ISOLATION-20261017` · T1 · 2026-10-17T23:10:36.402924+00:00

**Veredito: APPROVE_DOCUMENTARY_CLOSURE_ELIGIBILITY.** Não há achado material que impeça o encerramento documental de HISO-002/HISO-008. DOC-01–07 atendem ao recorte semântico e de preservação. DOC-08 permanece elegível, condicionado aos checks e à consolidação final do lead; este parecer não declara DOC-08 concluído.

## Escopo e método

Crítico independente em contexto novo, sem descendentes e sem autoria dos documentos. Julgamento dos15inputs atuais contra a baseline própria, seus19preimages e o patch fornecido. Não foi usado `git diff HEAD` para atribuir alterações a esta task. O corpo histórico não foi reauditado como implementação corrente. A escrita desta revisão fica exclusivamente neste relatório e no JSON companheiro.

Os15hashes coincidem com o congelamento. A reconstrução de `difflib.unified_diff` contra `before/` é byteidêntica a `changes.patch.source.txt`, SHA-256 `1f8176472601fbb2ed1c2ba07220fd10e2369697b703cf6c154726e8a0f285a8`. As diferenças mostram reconciliação de missão/navegação/autoridade, sem alteração de contrato ou conteúdo funcional dos cartões.

## Achados

Nenhum achado obrigatório: zero P0/P1/P2 ou bloqueador documental identificado. As localizações abaixo sustentam o julgamento; não representam defeitos.

## Critérios e evidências

### DOC-01 — PASS_SEMANTIC

Candidata exata, exit1/INCOMPLETE e tempos batem com os recibos históricos; regras legadas do principal explicitadas e fontes principais intactas. Execução do comando pertence ao lead e não foi repetida.

Evidência: `docs/08_runtime/0803_runbook_gates_locais.md:58`; `docs/08_runtime/0803_runbook_gates_locais.md:68`; `docs/08_runtime/0803_runbook_gates_locais.md:75`; `docs/04_audit/evidence/B6-0228-BUILD-20261017/boundary-final-receipts.json:1`.

### DOC-02 — PASS_SEMANTIC

Mesmo decisions.B5_HISO010: T3 aprovado, CI real/check obrigatório não comprovados. HISO-010 segue IN_PROGRESS; obrigações adicionais não foram apagadas.

Evidência: `docs/03_build/0370_harness_product_isolation_backlog.md:105`; `docs/03_build/0374_plano_producao_harness.md:142`; `docs/03_build/0374_plano_producao_harness.md:148`; `docs/04_audit/evidence/USER-DECISIONS-20261016/production-0374.json:1`.

### DOC-03 — PASS_SEMANTIC

Missão ADR-010 e consumidor separados, históricos claramente subordinados à navegação vigente, sem reabertura de UP91. Consolidação final de ledgers reservada ao lead.

Evidência: `README.md:7`; `docs/README.md:8`; `docs/README.md:17`; `docs/99_operational_index.md:17`; `docs/architecture/adrs/ADR-010-harness-product-isolation.md:12`; `AGENTS.md:5`; `docs/07_agents/AGENTS.md:10`; `docs/08_runtime/agent_coordination.md:1`.

### DOC-04 — PASS_SEMANTIC

SPEC0177, D1–D4 e0368 pertencem ao produto;0373/0374 ao núcleo. Recibo0179/0180 vale só para BUILD local sintético; D2/NO_MODEL e decisão de piloto preservados.

Evidência: `docs/architecture/adrs/ADR-010-harness-product-isolation.md:12`; `products/shift-assistant/docs/spec.md:8`; `products/shift-assistant/docs/spec.md:24`; `products/shift-assistant/docs/requisitos-ap.md:37`; `README.md:19`.

### DOC-05 — PASS_SEMANTIC

Dez IDs PISO únicos no consumidor; todo o corpo anterior após o título permanece byteidêntico. As dez seções PISO de0370 contêm links, sem campo Estado/aceite duplicado.

Evidência: `products/shift-assistant/docs/backlog.md:5`; `products/shift-assistant/docs/backlog.md:25`; `docs/03_build/0370_harness_product_isolation_backlog.md:140`.

### DOC-06 — PASS_SEMANTIC

16 linhas AP preservadas byte a byte e todas com dono HISO/PISO; mapa documental cobre contrato/operação/guia/corpus/autoridades. A presença das docs não concede AP, leitura humana, piloto ou commit.

Evidência: `products/shift-assistant/docs/requisitos-ap.md:3`; `products/shift-assistant/docs/requisitos-ap.md:7`; `products/shift-assistant/docs/requisitos-ap.md:26`; `products/shift-assistant/docs/README.md:6`; `products/shift-assistant/docs/spec.md:17`.

### DOC-07 — PASS_PRESERVATION_IN_SCOPE

17 protegidos e19preimages coincidem com a baseline.20moves com origem/destino/proveniência exatos e destinos presentes; política inteira inalterada. PUBLIC_API só muda linha de navegação452, sem delta de contrato.

Evidência: `docs/04_audit/evidence/DOCS-ISOLATION-20261017/baseline.json:1`; `docs/doc-link-policy.json:1`; `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/source-moves.json:1`; `docs/architecture/PUBLIC_API.md:452`.

### DOC-08 — ELIGIBLE_PENDING_LEAD_CHECKS_AND_BOOKKEEPING

Revisão sem bloqueador material. Lead ainda deve consolidar execução do comando, checksT1 completos, HISO-002/008 e ledgers finais e vincular a evidência à versão final. Essa fase pendente foi expressamente excluída da crítica de implementação.

Evidência: `docs/03_build/0388_documentation_isolation_reconciliation.md:21`; `docs/03_build/0370_harness_product_isolation_backlog.md:26`; `docs/03_build/0370_harness_product_isolation_backlog.md:81`; `docs/08_runtime/handoffs/docs_isolation_20261017.md:12`.

## Suficiência da organização

O harness tem missão e entrada documental próprias; o consumidor tem índice, contrato, operação, guia, corpus e backlog em seus paths. Os contratos aprovados preservados na raiz são acessíveis por ponteiros explícitos e continuam autoritativos para o produto. Não é necessário copiá-los, reescrevê-los ou duplicar status para concluir a organização documental.

HISO-004/HISO-007 continuam abertos, mas os paths estruturais necessários à organização já existem. Seus aceites técnicos de extração/deploy não são prova exigida para declarar esta organização documental suficiente. O fechamento de HISO-008 deve conservar essa distinção e seus vínculos, conforme0370:205 e o handoff:16. PISO, AP, D2/NO_MODEL, piloto e critérios de isolamento seguem nos donos originais.

B5 tem autoridade humana atual explícita e duas pendências reais preservadas. Não há transferência do PASS de certificação local ou da aprovaçãoT3 para CI remoto/check obrigatório. A SPEC0228 pertence à candidata exata; o principal mantém seus fontes da baseline.

## Verificações próprias

- `R1-FREEZE`: PASS — 15/15 inputs coincidem com review-inputs.json; revalidados imediatamente antes da escrita.
- `R1-BASELINE`: PASS — 19/19 preimages coincidem com baseline.json.
- `R1-DIFF`: PASS — difflib.unified_diff contra before/ reconstrói exatamente changes.patch.source.txt; nenhum git diff HEAD usado.
- `R1-PROTECTED`: PASS — 17/17 protegidos coincidem com a baseline; AGENTS/constituição/README do produto também intactos.
- `R1-PISO`: PASS — 10IDs únicos; corpo anterior do backlog do consumidor preservado e10seções de ponteiros sem Estado em0370.
- `R1-AP`: PASS — 16/16 linhas AP idênticas à baseline; confronto semântico com requisitos originais e seus cartões.
- `R1-MOVES`: PASS — 20/20 moves HISO-004/007 com origens/destinos únicos, proveniência igual a source-moves.json e destinos existentes. Outras3entradas da política preexistem; nenhuma allowlist adicionada.
- `R1-API`: PASS — PUBLIC_API mantém número de linhas; apenas linha452 de navegação difere da baseline.
- `R1-AUTHORITY`: PASS — Recibos16/10 e03/10 confrontados diretamente; hashes0179/0180 coincidem com autoridade03/10; números da candidata confrontados com recibos finais.

Essas verificações usam leitura de arquivos, SHA-256, comparação textual e inspeção semântica local. Não substituem os checkersT1 completos nem a execução do comando reservados ao lead. Os17hashes protegidos,19preimages e fontes de apoio estão individualizados em `review.json`.

## Arquivos julgados e SHA-256

- `README.md` — `48cc09600c41d85fe4be0d4f634891ab32bdcf1bbc251d057df267d1eae5b27e`
- `docs/README.md` — `b584b7230b74489b02cd2a59024f0d33d9211bde29acdc2b304c2880f67d03e0`
- `docs/99_operational_index.md` — `1e7f5ab54a991b30e319968d54b3e2b7787573ab11dc5f2c666ff7eb31df12eb`
- `docs/architecture/adrs/ADR-010-harness-product-isolation.md` — `372cc6806b4499b7ba58e99821fbeaf0c740b67d4cc1032ed6917d1852c90238`
- `docs/08_runtime/0803_runbook_gates_locais.md` — `280278d2acb5bf3884500339081e7a5e7aed95b4f62ef5892d009335b0fab28f`
- `docs/03_build/0369_harness_product_isolation_roadmap.md` — `40c8a897bfb22665eed12f14644c0c0bf8a8357e45d8f1645a7ef98b8f583cb7`
- `docs/03_build/0370_harness_product_isolation_backlog.md` — `bd08c9e3dd87db51af614e50db3bcedda6490182ea64429a530764bd3abbeed3`
- `docs/03_build/0374_plano_producao_harness.md` — `20db9430a1cbdac6042781b1d510cfdd120b54f9b66f5299c29d82538708cf67`
- `products/shift-assistant/docs/README.md` — `ee7801b3f2af014cd3abe82d78e9d098fb9c242eb2c8b8770d0be1448f47ea60`
- `products/shift-assistant/docs/spec.md` — `8e5b372d97460cfb707f56a9b2bd72fdae17b361a69493a7a83c9a4247532974`
- `products/shift-assistant/docs/requisitos-ap.md` — `e813e1d9c273fc9da50760318bc549f686dcb6b6c1c2122b1d55b8cf11c4e613`
- `products/shift-assistant/docs/backlog.md` — `462569fca7b0c181e43d3d5d2962bef57821d6aedd5e7a55af7a026527e8bb45`
- `docs/architecture/PUBLIC_API.md` — `1e0694ec10880c28efe38db118754aec23c5b46d5db7a1e104911c6c68dc9838`
- `docs/03_build/0388_documentation_isolation_reconciliation.md` — `29b1f788a62a749871ecb01efdad49e948d4c1890b26ab258a8d37d0969498e5`
- `docs/08_runtime/handoffs/docs_isolation_20261017.md` — `b7397324fa9d9a94292aca73493a6c7ac62bd9b162aa3ae6242a245574090dd1`

## Limitações e perímetro

- Parecer limitado aos15inputs congelados e às fontes de apoio necessárias; não é auditoria geral de todo o conteúdo histórico ou programas concorrentes.
- Não executei o comando do runbook, checkersT1 completos, testes de aplicação, certify, E2E, install, PG, Docker, rede, providers, commit, push ou deploy. Execução e checks finais ficam com o lead, conforme delegação.
- Integridade histórica aferida nos17arquivos protegidos e19preimages da baseline, não em todo membro transitivo de todo pacote histórico. Hash do manifesto B6 não substitui revalidar sua certificação; não a requalifiquei.
- DOC08 ainda não está concluído: HISO-002/008 e ledgers finais aguardam lead/checks. Ausência desse bookkeeping não foi classificada como defeito de implementação.
- Desvio de leitura: a primeira chamada à coordenação usou sed1,220 e retornou também trechos de outras seções, contrariando o recorte pedido. Depois foi usado awk limitado a DOCS-ISOLATION; conteúdo extra não foi usado como autoridade/evidência, nem motivou ações ou achados. Não afirmo aderência perfeita ao perímetro de leitura.
- Uma tentativa de leitura/verificação chamou python indisponível; foi refeita com python3 e passou. Nenhum resultado dessa tentativa falha foi tratado como sucesso.

## Condições para o fechamento pelo lead

1. Concluir os checks documentais e a prova do comando reservados ao lead, conservando falhas anteriores e resultados efetivos.
2. Consolidar HISO-002/HISO-008 e ledgers finais com links para as evidências, sem alterar os aceites técnicos/funcionais dos demais cartões.
3. Conferir a versão final contra os hashes desta revisão; mudanças materiais exigem reavaliar a aplicabilidade do parecer.

**Nenhuma autorização concedida:** produção, isolamento positivo, B6 geral, aceites AP/PISO, CI real/check obrigatório, integração de código, commit, push ou deploy.
