# HOW SPEC0231 — review R2 final

**READY_FOR_HUMAN_T3_REVIEW. Zero correções obrigatórias abertas; HOW-01 fechado documentalmente.** Esta é a segunda e última rodada do mesmo orçamento: 12 condições, zero rodadas restantes, nenhum descendente e nenhum novo ciclo iniciado.

SPEC: `docs/02_spec/0231_codex100_initial_qualification.md`
SHA-256: `e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af`.

## Fechamento de HOW-01

A contraprova R1 é a row real CDX100-CVG-01 com `kind=CVG_CONTROL`, `family=CROSS_CUTTING` e `mandatory=true`, repetida no mesmo agrupamento pelos outros 21 controles. O catálogo continua com 22 famílias declaradas CDX-01..CDX-22, 487 funcionais e 22 controles. Não existe CROSS_CUTTING no array families. A baseline509 preserva exatamente o conjunto de triples id/family/kind do catálogo.

A SPEC:53 agora proíbe CROSS_CUTTING em families e em sua contagem. A regra de SPEC:54 permite o sentinel somente para CVG_CONTROL; FUNCTIONAL_PARITY precisa referir família declarada e nunca usa o sentinel. Para controles em qualquer outro grupo, a família ainda precisa estar declarada. SPEC:55 mantém os 509 bindings imutáveis. Portanto, o catálogo corrente deixa de contradizer o schema proposto sem reclassificação, exclusão ou 23ª família artificial.

QK01 (linha 95) exige aceitar os bytes correntes com family_count22 e os 22 controles transversais. QK03 (linha 97) inclui a recusa de FUNCTIONAL_PARITY/CROSS_CUTTING, grupo de controle desconhecido e sentinel no array families. A regra 6 (linha 56), intacta, continua permitindo novas famílias/IDs válidos com contagens reconciliadas; family_count22 refere-se ao catálogo corrente, sem congelar a contagem das futuras revisões aditivas.

| Caso analisado no texto | Resultado contratual |
| --- | --- |
| Controle corrente CDX100-CVG-01..22 / CROSS_CUTTING | Permitido pela regra 4, com classe/família preservadas pela baseline |
| FUNCTIONAL_PARITY com CROSS_CUTTING | Recusado, mesmo em ID novo |
| CVG_CONTROL com grupo diferente e não declarado | Recusado por membership |
| CROSS_CUTTING adicionado a families | Recusado pela regra 3 |
| Binding original movido/reclassificado para contornar a validação | Recusado pela regra 5 |

Essa tabela é dedução estática do HOW, não corpus de testes executado nem prova de implementação. **Não há contraprova obrigatória residual identificada nesta rodada.**

## Delta e preservação

O arquivo `review-r1/SPEC-reviewed-draft.txt` tem 23166 bytes e SHA-256 `14af535242b5105a7fedac7016a88115493efcf11207cebadc2c66784f23cbbd`, idêntico à SPEC julgada em R1. O diff textual separa quatro mudanças semânticas: regras 3/4 e aceites QK01/QK03. As demais mudanças são alinhamento da tabela Markdown. O guard numérico, reuso C100, fronteiras de autoridade e plano condicional não mudaram. Os 14 inputs originais fora da SPEC têm os mesmos hashes R1; o parecer R1 preservado conserva seu REVISE histórico.

A proposta antiga `build-plan-proposal.json` continua explicitamente proposta sem BUILD e conserva o hash R1 `14af535242b5105a7fedac7016a88115493efcf11207cebadc2c66784f23cbbd`. É um artefato pré-reparo preservado, não o vínculo de aprovação do texto R2. O pacote humano concreto deve identificar o hash atual acima e este parecer, conforme a SPEC:112; não reutilizar o hash antigo como se aprovasse os bytes novos. Essa consolidação cabe ao Lead fora dos inputs congelados, sem nova condição de projeto ou reabertura do orçamento de crítica.

## As mesmas 12 condições

- **H01 — SATISFIED_IN_DESIGN — Unidade técnica inicial, pipeline e autoridade humana separados do aceite integral.** PRD permite mecanismo primeiro; T1 documental não é decisão humana T3. CQ01–14, M1, G04/Q01 e objetivo integral continuam abertos.
- **H02 — SATISFIED_STATIC — Integridade dos 17 inputs R2 e preservação dos bindings correntes.** 17/17 tamanhos e hashes coincidem antes/depois. Os 14 inputs originais fora da SPEC conservam os hashes R1. Arquivo da SPEC R1 confere com 14af5352…; catálogo e baseline conservam os mesmos 509 triples id/family/kind e 22 famílias.
- **H03 — SATISFIED_IN_DESIGN — Schema proposto aceita o próprio catálogo corrente sem reclassificação.** HOW-01 fechado documentalmente por SPEC:53–55/95/97. Os 22 CVG_CONTROL com CROSS_CUTTING passam a ter agrupamento reservado fora de families/family_count; FUNCTIONAL_PARITY exige família declarada e recusa o sentinel; controles em qualquer outro grupo exigem família declarada. Preservação dos triples continua obrigatória. QK01/QK03 cobrem os casos; nenhuma implementação/negativo executado.
- **H04 — SATISFIED_IN_DESIGN — Preservação de escopo e adições, sem redução pelo formato inicial.** Baseline509 e suas famílias/classes/mandatory permanecem obrigatórios; adições válidas continuam permitidas conforme caps e contagens reconciliadas. Sentinel transversal não é 23ª família. HOW-01 resolvido sem alteração dos dados. Caps 1MiB/4MiB não reduzem escopo nem concluem funções grandes.
- **H05 — SATISFIED_IN_DESIGN — Catálogo bruto CodeX separado da vista privada de bindings.** Vista requirements/id/verification_class é compatível com o consumidor estático; validar rows CodeX antes. Hashes continuam vinculados ao raw CODEX-CAP-v1, sem CLAUDE-CAP intermediário.
- **H06 — SATISFIED_IN_DESIGN — Perfil executável fechado e reuso do fluxo inteiro sem bypass ou clone.** Dois exports fechados; função com perfil privada. Reutilizar parseArgs não executa main sob o guard atual. Preservar oito estágios, normalização e projection-budget; dados não selecionam callback/import/profile.
- **H07 — SATISFIED_IN_DESIGN — Guard CodeX finito/safeInteger/negative-zero antes de digest e projeção.** Modo deve chegar a todo load JSON, inclusive controles/receipts e documento inteiro selecionado. Inteiros 9007199254740992/9007199254740993 recusados; -0/-0.0/-0e0 recusados. Default C100 permanece Number finito legado.
- **H08 — SATISFIED_IN_DESIGN — Roundtrip decimal exato com custo limitado e sem expansão exponencial.** Igualar sinal/coeficiente/expoente normalizados do token e JSON.stringify(Number) impede alias decimal. Limitar magnitude do expoente não zero a maxBytes+400 antes de conversão limitada, sem potência expandida/BigInt arbitrário. Zero tem tratamento separado. 1e0/1 e 1.2300e2/123 são equivalências pretendidas; decimal longo divergente/underflow são recusados. Esta é análise do algoritmo descrito, não execução.
- **H09 — SATISFIED_IN_DESIGN — EXACT_BYTES compara o documento completo selecionado e mantém domínio lossless honesto.** Buffer integral do role selecionado é comparado sem parse/normalização. Outros roles são autenticados por integridade, não automaticamente iguais. Regra nova é necessária para equivalência semântica lossless além de byte igualdade; nenhuma função recebe crédito por essa limitação.
- **H10 — SATISFIED_IN_DESIGN — SafeIO, caps, snapshots, publicação e recuperação herdados.** Reuso conserva controles físicos, bytes de handles/snapshots, caps agregados, saída nova exclusiva e publicação após cleanup com checagem final de autoridade. Nenhuma alegação de proteção contra operador local malicioso além da fronteira declarada.
- **H11 — SATISFIED_IN_DESIGN — Origem, autoridade, execução, precedência e revisão pendente.** Reutiliza índices/receipts separados e exatos. APPROVED atual não é inferido de hash ou fixture; timeout/infra não viram MATCH; revisão da SPEC não aprova regra/função. MATCH_REQUIRES_REVIEW conserva PENDING.
- **H12 — SATISFIED_IN_DESIGN — Plano condicional, testes rejeitáveis e compatibilidade C100 sem tocar runtime público.** QK01/QK03 corrigidos; QK02 e QK04–12 e o plano de claims/candidata/gates/regressão C100 mantêm o contrato anterior. BUILD depende de revisão humana explícita do hash R2. G03 permanece fechado, sem nova tentativa. Implementação e validação de runtime continuam NOT_RUN.

## Limites do veredito

Esta revisão autoriza apresentar a SPEC concreta para revisão humana T3; não aprova BUILD, regra de equivalência, função, captura, candidato ou release. Gate PRD T1 documental não foi convertido em aprovação humana. M1, G04/Q01, CQ01–CQ14 e o objetivo completo de 22 famílias/49 cartões/10 fases/487+22 permanecem abertos. Nenhum recibo funcional foi produzido.

O algoritmo numérico continua suficiente no contrato para o domínio declarado: finitude, safeInteger, negative-zero e roundtrip decimal exato por coeficiente/expoente normalizados, antes de digest/projeção, sem expansão de potências. O enum interno não é selecionável por dados e o default C100 Number finito fica intacto. As observações de alias numérico e arbitrary_precision continuam evidência anterior fornecida, não medição refeita nesta rodada. EXACT_BYTES continua igualdade de todos os bytes do role selecionado; integridade dos demais roles não implica sua igualdade automática. Uma equivalência semântica lossless de domínio mais amplo exige contrato próprio se necessária; não recebe PASS por esta SPEC.

Catálogo bruto e vista de bindings continuam separados; fluxo inteiro/safeIO/parser/projection-budget são reusados, sem clone/bypass/relabel CLAUDE. Nenhuma alteração foi feita em fonte C100, harness público, journal, SQL, SDK, provider ou adoção default0226. Caps 1MiB/4MiB são limites do formato inicial, sem redução do objetivo ou declaração de funções grandes completas.

Foram lidos textos/JSON e medidos bytes/SHA-256, incluindo a comparação estática com o rascunho R1 arquivado. Nenhum código de repositório foi executado/importado; nenhum helper, teste, qualificador/CLI alvo, ELF, CVG, rede, processo controlado, PG ou gate foi usado. Os programas de leitura/hash/diff não chamaram o código do alvo. Nodeformat/link PASS é informação do Lead, não gate reexecutado pelo crítico. Compatibilidade C100 e implementação CodeX reais continuam NOT_RUN nesta revisão. G02 e G03 continuam encerrados, sem retry ou reinterpretação de G03 como BUILD desta SPEC.

## Integridade antes/depois

17/17 inputs conferem com o freeze, em tamanho e SHA-256, antes e depois da análise. A coluna SHA-256 corresponde ao esperado e às duas medições. O rascunho R1 adicional também foi reconferido antes/depois com seu hash R1. Apenas review-r2/review.json e review-r2/report.md foram escritos.

| Input | Bytes antes/depois | SHA-256 antes/depois |
| --- | ---: | --- |
| `docs/02_spec/0231_codex100_initial_qualification.md` | 24834/24834 | `e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af` |
| `docs/01_prd/0030_codex100_initial_qualification.md` | 20052/20052 | `e8f1a99c5c93399a8dd67261d03bf289b8f7dda78c0c1ece25d79d2e678e120f` |
| `docs/01_prd/0090_prd_validation.md` | 4225/4225 | `a9479c4e4b32f0deb5a1d7972d0b5d9a64da5a8004b1aa68baea44d6472429c9` |
| `docs/02_spec/0229_claude100_initial_qualification.md` | 24203/24203 | `bb42eb61cbd30c5720b00ef3145d9fdac4196b942eb3c42bff1d94acf4fe8243` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/catalog-baseline-proposal.v1.json` | 62482/62482 | `33087dcbf76007ef251a2115b6da31a3d0a0bf0681a41ec9d22c44e49f888ea2` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/existing-helper-diagnostic.json` | 1030/1030 | `af9b2778b9d232d70f4609de947baa19481a668fabe2153b83019060f0bc534e` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/serde-json-feature-evidence.json` | 1536/1536 | `1b6000180838ee44663c5d78719c70871862884a58b6823045e94dfebd61e795` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/build-plan-proposal.json` | 2358/2358 | `800a2459be554f1c66d936e9f0dae7127014b0df9c0104547242589756b376cd` |
| `scripts/claude100-qualify.mjs` | 1676/1676 | `c09c8935e1c4681a46b73004095c41367bc2415766a728ca15ae22993760ce0f` |
| `tests/claude100/qualification/qualify.mjs` | 20407/20407 | `4eb2b8e67e5aa76b73c82efd1da4c9be524ef0094779432fc8bd1e6fb34b54dd` |
| `tests/claude100/qualification/schemas.mjs` | 16134/16134 | `de0488e6a121713f5f89855ec62b92d7383624722fe7d88a23c32bf2d60faba5` |
| `tests/claude100/qualification/strict-json.mjs` | 8079/8079 | `4e077111127f7db13de3d9d9024c5508be2a835a287847063a511c88c55923a9` |
| `tests/claude100/qualification/safe-io.mjs` | 15128/15128 | `e8c826a1e948f97f6cff3ae862e5278e686c5043ccb3a3305c7e11846f0d8bf7` |
| `tests/claude100/qualification/projection-budget.mjs` | 1667/1667 | `7cf08965d176e1ab87427c4fb93a91b0dd403dcbea756059adcd261ae107acc2` |
| `docs/03_build/tracking/codex100_catalog_v1.json` | 707586/707586 | `7526e9d172abb1eeffa6981d98f1317fe91af2b617aab2b18a6645a5fd101fa7` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/HOW-01-response-plan.json` | 885/885 | `843607a9c5bbf8f9089d584efd65eae18d828a42a474c82fc2518c28025f95e7` |
| `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/review-r1/review.json` | 25111/25111 | `6d7a5e8101fd6852643e1d50cfba3fc6d3855b5942396d84be29a9435ca3e443` |

Arquivo R1 adicional: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/review-r1/SPEC-reviewed-draft.txt`, 23166/23166 bytes, SHA-256 `14af535242b5105a7fedac7016a88115493efcf11207cebadc2c66784f23cbbd` antes/depois.

O orçamento de revisão HOW encerra nesta R2. Próximo passo do Lead: consolidar o pacote atual e apresentar a revisão humana T3; nenhum BUILD pode preceder a decisão explícita sobre esses bytes.
