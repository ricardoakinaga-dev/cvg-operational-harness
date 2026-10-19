# Parecer independente R2 final — SPEC0239

**REVISE — mandatory_count: 2, ambos P1.** O reparo fecha materialmente R1-01, R1-03 e R1-05. R1-02 e R1-04 avançaram, mas não satisfazem integralmente seus mínimos: perdeu-se o envelope público de eventos na mudança para anexos e QR05 conflita com o contrato de roles do qualificador. São lacunas de desenho verificadas nos documentos/fontes; não falhas observadas de runtime nem bloqueios artificiais por implementação ainda ausente.

Mesmo crítico da R1; nenhum descendente; 18 verificações substantivas. Segunda e última revisão, único reparo agrupado consumido. Nenhuma terceira revisão, novo crítico ou retrabalho automático é autorizado por este parecer. Somente `review-r2/**` foi escrito. A skill engineering-framework continua aplicada no mesmo recorte documental.

## Sujeito e evidência

**S** = [SPEC0239](../../../../../../02_spec/0239_codex_native_journey.md). **M** = [model-bridge](../contracts/model-bridge.md), **D** = [native-data](../contracts/native-data.md), **Q** = [qualification-rules](../contracts/qualification-rules.md), **C** = [concurrency-schedules](../concurrency-schedules.json). Intervalos abaixo são inclusivos nos arquivos congelados; os caminhos originais das fontes R/A/Sxx constam nos manifests. [review.json](review.json) contém referências estruturadas.

- Freeze R2 SHA-256: `8128cec55f1239ab3af42bc4a7db3319ad5801dbfd6d45e9424fa70aa6830f74`, **134/134 arquivos exatos**, antes e depois.
- Primeiro SHA do sujeito: `24a2ea104b782c8690d02468e5f6f492168d65eb8ab35bbf257d83daf333349f`.
- Último SHA do sujeito: `24a2ea104b782c8690d02468e5f6f492168d65eb8ab35bbf257d83daf333349f`.
- task.json SHA: `85ba841d758f4f8f70e858a4d6698d96b97b8281ac921c5052313e28f627b61b`.
- 57 fontes primárias e 32 snapshots do scout autenticados; 45 excertos primários conferidos. O snapshot S02 é autenticado por seus bytes iniciais arquivados; seu path vivo de coordenação continua concorrente, sem declaração de imutabilidade.
- Os oito hashes de anexos são exatos e aparecem em S:243–250. Isso os vincula à decisão futura; não substitui a crítica semântica.
- R1 reconstruída independentemente: quatro pré-imagens mapeadas mais 101 paths originais dão os 105 hashes originais. Oito outputs originalmente hashados da R1 permanecem exatos; seu manifesto continua SHA `3f8e656924dff4ca5c743e45774cdf1cc212b2eafd3edeab939ef346f04d213c`. A view formatada posterior do Lead não substituiu os outputs originais.

[Inventário inicial](first-hash-inventory.json), [inventário final](last-hash-inventory.json), [integridade documental](static-integrity.json), [contraexemplos inertes](counterexample-witnesses.json) e [manifesto](manifest.json). Nenhum relatório/self-review do implementador foi usado como aprovação.

## Disposição dos cinco achados R1

| Achado | Disposição final | Evidência e julgamento |
| --- | --- | --- |
| R1-01 · ponte de modelo | RESOLVIDO NO DESENHO | M:7–15 fixa owner/export/novos métodos e preserva legado; M:23–43 define cada campo, wrappers UNTRUSTED e limites; M:47–59 liga bytes preparados, contador e reserva no mesmo CAS; M:65–88 fecha uniões, conversão e provas contra slice/validador legado. A execução e a qualificação do par continuam futuras. |
| R1-02 · dados e DTOs | PARCIAL; obrigatório R2-01 | D:7–35 preserva o vetor text e presença/anotações; D:39–100 fecha refs/accounting/cancel-before-claim; D:122–149 fecha projeção tool e papéis de processo. Entretanto S:55 e D:102 fazem referência circular ao envelope comum que foi removido da definição canônica. |
| R1-03 · sessão física e epoch | RESOLVIDO NO DESENHO | C:10–29 separa backend vivo/lease expirada de backend realmente perdido com processo A vivo. O discriminador privado chama o mesmo guard de produção e isola worker, epoch e expiry, evitando máscara pelo precheck do handle. C:32–265 preserva os 19EA e adapta suas condições, inclusive EA05 e EA19, sem reescrever o pacote antigo. |
| R1-04 · regra de qualificação | PARCIAL; obrigatório R2-02 | Q:15–54 define projetor, bijeções, frescor, causalidade, resíduos e gate de recomputação; Q:79–96 exige mutantes semânticos e rejeita dois diagnósticos iguais como positivo. Q:66/75 e rules-matrix:132–145, porém, escolhem o role errado para o frame opaco preservando simultaneamente o stdout original no mesmo role. |
| R1-05 · quota agregada | RESOLVIDO NO DESENHO | C:268–308 fixa duas execuções/sessões/backends, barreira após as leituras da soma, Q01–Q05, closure atômico e mutant READ COMMITTED. O observador compara bytes reais/counters/ACKs; a prova já não pode ser satisfeita apenas pelo mutex da mesma execução ou por bordas sequenciais. |

## Achados obrigatórios remanescentes

### R2-01 — P1 — Relocação dos tipos apagou o envelope comum do evento público

**Disposição:** regressão material na tentativa de resolver R1-02; mantém esse achado aberto parcialmente. **Critérios:** FN01/FN02/FN03/FN04/FN07; CQ01/CQ06/CQ07/CQ09/CQ10/CQ14.

**Evidência direta:** S:48–55, 83–93, 145–155; D:95–118; [pré-imagem canônica R1](../R1-preimages/01-0239_codex_native_journey.md.raw.txt):53–61. A lista dos oito anexos normativos está em S:243–250.

R1 definia expressamente `NativeEventV1 = {version:1,eventId,executionId,sessionId,ordinal,type,observedAt,payload}` e a alocação/contiguidade do ordinal. R2 substitui esse bloco por S:55, que remete os payloads ao anexo; D:102 diz que cada evento tem os campos comuns “definidos na SPEC”. A SPEC atual já não os define. D fornece payloads e o frame externo, mas não o envelope comum. `observedAt`, por exemplo, não aparece mais em S ou D; colunas SQL e cursor não definem automaticamente o objeto público nem os bytes do native_record. Os tipos atuais também não incorporam a pré-imagem R1 como anexo normativo.

**Contraexemplo:** um produtor grava `{version,eventId,executionId,sessionId,ordinal,type,payload}`; outro inclui um timestamp observado persistido. Ambos podem apontar para D:102 e cumprir os payloads da tabela, mas divergem no digest, overhead, reader e reentrega. Não existe contrato fechado atual que permita ao consumidor instalado rejeitar uma dessas formas. O cenário de delta/replay exige precisamente essa definição antes de código.

**Impacto:** consumidores, persistência e calculadores de quota podem construir formatos diferentes a partir do mesmo SHA de SPEC. O que falta é o contrato externo, não um detalhe de serialização deixado legitimamente ao implementador. A remoção do antigo bloco também perdeu a forma exata de `error.data.cvg` antes declarada na R1:61; a referência genérica a data versionada em S:193 não a repõe.

**Correção mínima exigida:** repor uma definição normativa única de NativeEventV1 com campos/tipos/presença, versão, ordinal contíguo/alocação, timestamp/unidade/origem, correspondência com colunas e domínio exato do digest; fechar NativeFrame e a união fechada de tipos/payloads por referência inequívoca. Preservar também o schema de dataCVG do erro governado, ou declarar uma substituição explícita. Um consumidor deve poder validar o envelope sem consultar o sujeito histórico da R1. Incluir o negativo de campo comum omitido/extra e o positivo de persistir/relê-lo sem recriar timestamp. Este parecer não realiza esse reparo.

### R2-02 — P1 — QR05 exige dois significados incompatíveis de RAW_STDOUT

**Disposição:** R1-04 parcialmente não resolvido. **Critérios:** FN01/FN02/FN06/FN07; CQ01/CQ13/CQ14, especialmente NJ24.

**Evidência direta:** Q:11, 19–26, 60–75; [rules-matrix](../rules-matrix.json):122–149; [R39 schemas.mjs](../inputs/R39.source.txt):190–218; [R40 qualify.mjs](../inputs/R40.source.txt):244–257, 447–458; [A11 SPEC0231](../inputs/A11.source.txt):61–79. Esses são arquivos lidos, não módulos executados.

QR05 inicializa uma conexão e depois envia initialize duplicado com cada ID exato. Q:66/75 e a matriz mandam comparar o frame de erro inteiro via `EXACT_BYTES`, com `referenceRole=cvgRole=RAW_STDOUT`. Q:11/26, contudo, exige que RAW_STDOUT original continue listado e autenticado. O stdout completo contém também a resposta do initialize de setup. R39:213 proíbe duplicar roles; R40:448–458 encontra um único artefato pelo role e compara **todos** os seus bytes, sem seletor de frame ou normalização no modo opaco.

**Contraexemplo:** referência e candidata enviam quatro campos initialize verdadeiros, com userAgent/codexHome diferentes, e depois o mesmo erro `Already initialized` com o mesmo token i64 e LF. O frame-alvo é igual; os stdout integrais são diferentes. Mantê-los em RAW_STDOUT rejeita o positivo autêntico. Substituir RAW_STDOUT pelo recorte descumpre a preservação desse role exigida pelo próprio contrato. Listar ambos como RAW_STDOUT falha no schema de unicidade. Lower/upperbounds garantem a origem do frame, mas não alteram a seleção do core pelo role.

**Impacto:** a matriz não é consumível pelo qualificador atual para a prova opaca especificada. O implementador teria de inventar um remapeamento de artefatos ou mudar o core, contrariando a escolha congelada. Não se pode tratar a recusa desse positivo como comprovação de CQ13 ou dispensar o ID i64 como variante fácil.

**Correção mínima exigida:** manter RAW_STDOUT original completo sob seu role e atribuir o frame opaco selecionado a outro role existente e único permitido por EXACT_BYTES, com contrato explícito de derivação e inventário/proveniência/brutos. Alinhar Q e rules-matrix para esse role e exigir o positivo com setup metadata diferente mas frame-alvo idêntico; o mutante que seleciona frame anterior ou altera o ID deve continuar rejeitado. Alternativamente, outra solução precisa respeitar tanto a unicidade quanto a preservação de stdout sem modificar implicitamente o qualificador. Nenhuma captura, execução de referência ou mudança de código é necessária para detectar essa contradição documental.

## Dezoito verificações substantivas

`ADEQUADO` abaixo significa suficiência documental no recorte indicado, nunca teste de runtime aprovado. Ranges referem-se aos aliases definidos acima ou às fontes arquivadas.

| Check | Critérios e veredito | Evidência e desafio concreto |
| --- | --- | --- |
| C01 | FN08 · ADEQUADO | Freeze134 e primeiro/último inventários: SHA exato do sujeito e inputs, nenhuma leitura de self-review como aprovação. |
| C02 | FN08 · ADEQUADO | R1-preimages/map e freezeR1: quatro substituições + 101 paths dão a R1 exata; manifesto/outputs originais preservados. Não confundir view formatada posterior com o relatório julgado. |
| C03 | FN02/FN08 · ADEQUADO | S:13, 233–250; normative-annexes.json: oito hashes vinculados à SPEC, mudança de anexo muda a decisão. A cadeia de hash não elimina R2-01/02. |
| C04 | FN01/FN03/FN07 · ADEQUADO | M:7–43; R01:256–291; R28:17–65; R13:475–526; R29:443–450: novos validators/métodos preservam legado e enfrentam o input32001 e o slice32000 com causas separadas de CONTEXT_OVERFLOW. |
| C05 | FN03/FN04/FN07 · ADEQUADO | M:47–59; A03:291–358: preparação opaca e payload contado estão ligados ao receipt no mesmo CAS. Mutar wrapper/model/prompt após reserva recusa invoke; gateway global e execução são escopos distintos, sem soma duplicada. |
| C06 | FN01/FN03 · ADEQUADO | M:65–88; S:133–141: uniões concretas, campos de resultado, fail-closed sem truncamento, completed retido por barreira e ramo responseText separado. Não converter complete em stream. |
| C07 | FN02/FN04 · ADEQUADO | D:7–35; S13:395–432,455–489: guardar vetor original, presença/ranges e normalização Serde do read. Dois inputs anotados devem reaparecer em B sem reconstrução por concatenação. |
| C08 | FN02/FN04 · ADEQUADO | D:39–100,128–141: cancel-before-claim tem refs null/zeros comprovados; outputPresent distingue ausente/null e toolGOVERNED não vira execução no cliente. UNKNOWN não usa medição0. |
| C09 | FN01/FN02/FN03/FN04/FN07 · REVISE R2-01 | S:55 ↔ D:102, contra R1 pré-imagem:55–61: deslocamento circular perdeu o envelope comum e shape de erro; payload completo não substitui o objeto de evento que será hasheado/entregue. |
| C10 | FN04/FN06 · ADEQUADO | C:10–21; S:61–73,221: lease expirada com backend vivo faz B recusar; perda real do backend, com A vivo, libera B. Nenhuma apropriação de lock ou morte presumida do socket. |
| C11 | FN04/FN06 · ADEQUADO | C:23–29: testar o mesmo guard SQL com positivo atual e um predicado alterado por vez; caso público A/B continua obrigatório. Assim um handle LOST não mascara sozinho a ausência do predicado de epoch. |
| C12 | FN01/FN04/FN06 · ADEQUADO | C:32–265; A08 original: todos19EA retidos, EA05 mantém a janela pós-admissão; EA19 só reatribui RESERVED comprovadamente não iniciado. Kill de A para restart e perda de backend mantendo A vivo são provas diferentes. |
| C13 | FN04/FN05/FN06 · ADEQUADO | S:95–113,159–165; D:98–100,145–149; C:147–173: controle usa conexão própria sem writer; cancel/success linearizam no executionrow; ACK só após fato persistido, sem turn/end semântico fabricado ou rollback externo inferido. |
| C14 | FN03/FN06 · ADEQUADO | S:153–157,237; C:268–308: Q01/Q02 colocam duas execuções atrás da mesma soma; Q03–05 cobrem fechamento/escaping/posições. Mutant READ COMMITTED deve perder para o observador; quota/counters não são dumps truncados. |
| C15 | FN01/FN02/FN06 · ADEQUADO no caminho SAFE_GRAPH | Q:15–54,79–96; R39/R40: relações fixas, brutos protegidos, recomputação independente e semânticos além de hash. Dois lados com o mesmo diagnóstico não produzem RAW_STATE elegível ou MATCH funcional. Ressalva opaca isolada em C16. |
| C16 | FN01/FN02/FN06/FN07 · REVISE R2-02 | Q:66/75; rules-matrix:132–145; R39:210–218; R40:447–458: role único + comparação integral conflitam com guardar stdout completo e comparar só o frame-alvo. Testemunho documental inclui setup diferente e alvo igual. |
| C17 | FN01/FN02/FN05/FN07 · ADEQUADO no escopo | S:7–15,181–217; Q:5–11,62–77; governance-proposals:5–46: 14CQ, 487+22,22famílias/49cartões/10fases conservados; variantes de protocolo/hosts não implementadas continuam abertas. CODEX não é backend; classe de controle não vira requisito funcional. |
| C18 | FN05/FN07/FN08 · ADEQUADO quanto à separação de gates | S:227–229,239; D:145–149: roleclient fecha leitor, não executor independente; qualification/owner/source e T3novo são entradas pendentes, sem reabrir aprovações resolvidas. Nada aqui concede BUILD/receipts/releases. |

## FN01–08 e conclusão delimitada

| Critério | Veredito | Motivo |
| --- | --- | --- |
| FN01 | REVISE | Jornada integral mantida; contrato de evento e positivo opaco ainda não são completos, R2-01/02. |
| FN02 | REVISE | Mapeamentos melhoraram materialmente; falta envelope público e compatibilidade de role opaco, R2-01/02. |
| FN03 | REVISE | Modelo/limites/quota/stream estão concretos, mas falta fechar quais bytes de evento/overhead são públicos, R2-01. |
| FN04 | REVISE | Autoridade, terminal ausente, contabilidade e transações coerentes; objeto comum de evento continua sem definição única, R2-01. |
| FN05 | ADEQUADO_DESENHO_CONDICIONAL | DDL/grants/migração/owners permanecem explícitos; qualificação de fonte/ponte não foi presumida. |
| FN06 | REVISE | Física dos19EA e Q01–05 resolvida no desenho; o positivo/negativo do qualificador opaco ainda não pode cumprir o contrato, R2-02. |
| FN07 | REVISE | Caminhos/exports/ponte/lifecycle definidos; consumidor de eventos e integração do qualificador exigem os dois contratos corrigidos. |
| FN08 | ADEQUADO_DESENHO | Mesmo crítico independente, dois rounds/um reparo, integridade comprovada e nenhuma execução funcional alegada. |

**Design readiness: REVISE**, mandatory_count2. **Implementation readiness: BLOCKED_ENTRY_GATES**, separadamente: fonte/export/manifest/qualificação dos owners e ponte, gate humano T3 novo vinculado ao SHA e preparação de task/claim/candidata/recursos. Não é BLOCKED como veredito desta crítica: há evidência suficiente para identificar as lacunas de desenho. Ausência de runtime concluído não foi usada como achado.

Procedimentos: leitura e diff documental, JSON/hash/text/ranges, autenticação R1/R2, análise manual de schedules e dois contraexemplos em dados inertes. Zero import de aplicação, execução de fonte/helper/alvo, PG/Docker/rede/install/migration/gates/broadtests. Nenhum código de schemas/qualify foi importado ou executado. Todos30NJ/19EA e os fragmentos do catálogo continuam NOT_RUN; o catálogo central509 não foi alterado ou requalificado pelo crítico.

**Orçamento encerrado: 2/2 revisões e 1/1 reparo agrupado.** A entrega final registra dois P1 remanescentes e não autoriza terceiro review/rework/reset ou novo crítico automático. Não houve edição de canonical/annex/source/owner/pin/R1/ledgers, promoção, aprovação humana ou mutação de crédito/status de programa.
