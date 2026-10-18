# R3 dirigida — recuperação do contrato SPEC0239

**APPROVE_TECHNICAL_SPEC_DESIGN — mandatory_count: 0.** R2-01 e R2-02 estão resolvidos no desenho atual. O contrato voltou a ter owner único para envelope/frame/erro e a rota opaca agora é compatível com os roles do core, com gate de procedência independente da igualdade. Não encontrei regressão material nas superfícies afetadas dos14CQ nesta revisão dirigida.

Este é julgamento de engenharia documental, sem PASS de runtime/funcional, aprovação de BUILD/T3/owners ou crédito no catálogo. O ciclo R2 continua historicamente FAILED; seus pareceres não foram reclassificados. A extensão foi decisão explícita do Lead sob a autorização T1 prévia para o objetivo integral, após replanejamento e seis novas observações, registrada antes do reparo em [attempt-disposition](../attempt-disposition.json), [targeted-recovery-task](../targeted-recovery-task.json) e coordenação CODEX100:533. O usuário não aprovou especificamente a extensão do orçamento, a nova SPEC ou seu gate T3. Totais declarados: três reviews e dois reparos. Esta R3 consome a única extensão dirigida; nenhuma quarta revisão, novo reparo ou novo crítico automático.

Mesmo crítico de R1/R2, nenhum descendente, **12 checks substantivos**. Escrita restrita a este review. A skill engineering-framework continua aplicada à suficiência de contrato/evidência; não introduz execução ou aprovação adicional.

## Identidade e método

**S** = [SPEC0239 atual](../../../../../../02_spec/0239_codex_native_journey.md); **D** = [native-data](../../full-native-spec/contracts/native-data.md); **Q** = [qualification-rules](../../full-native-spec/contracts/qualification-rules.md); **N** = full-native-spec; **R** = native-journey-recovery-plan. Referências de linha são inclusivas nos bytes julgados, com paths estruturados em [review.json](review.json).

- Freeze R3: `9da2002f561d3a2fa2816de6b316b94f9be797384b75e99de0816183503c1868`; 423/423 arquivos exatos na entrada e saída.
- Primeiro SHA da SPEC: `ccdf3a754c460e138307148f9eec79e0dce4a9b7ac5c9d10334716e5b5c0dd87`.
- Último SHA da SPEC: `ccdf3a754c460e138307148f9eec79e0dce4a9b7ac5c9d10334716e5b5c0dd87`.
- targeted-recovery-task SHA: `a0b54bd5d4579daf5b90ed94deb14f4db76a7f4dd152e9014f58abe666b5fe97`.
- R2/134 reconstruída com seu mapa: seis pré-imagens +128 paths originais. Os184 inputs do checkpoint antigo N também conferem por essa projeção. O manifesto N/184 permanece histórico byteexato, não selo dos arquivos atuais.
- R1/105 reconstruída pelo próprio mapa R1: quatro pré-imagens +101 paths. Os manifestos e outputs originalmente hashados de review-r1/review-r2 continuam exatos.
- Os38 inputs do diagnóstico são autenticados na versão pré-patch correta usando o mapa R2 quando necessário. Seus paths alterados hoje não foram indevidamente exigidos com o hash antigo. Os271 arquivos offline e oito bindings de anexos atuais conferem. S02 permanece snapshot arquivado; nenhuma imutabilidade do path vivo concorrente foi afirmada.

Procedimentos realizados: inspeção de texto/JSON, hashes, diff dos seis paths, comparação de campos e leitura de fontes arquivadas e relatórios offline existentes. **Nenhuma das seis avaliações foi repetida.** Nenhum módulo da aplicação, runtime/helper, qualificador ou referência foi importado/executado; zero PG/Docker/rede/install/migration/gates. As conclusões do Lead não substituíram a leitura dos contratos e do core. O REPORT de replanejamento fora do freeze não foi usado como aprovação.

[Inventário inicial](first-hash-inventory.json), [inventário final](last-hash-inventory.json), [integridade/reconstrução](static-integrity.json) e [manifesto](manifest.json) preservam a trilha deste parecer.

## Disposição dos dois achados

### R2-01 — resolvido no desenho atual

**Evidência:** S:55; D:102–209; N/test-plan:294–322. D:3–100 e211–246 conservam as representações ampliadas da R2.

S remete a D§3.1 e D passa a definir localmente os oito campos obrigatórios: version, eventId, executionId, sessionId, ordinal, type, observedAt e payload. A união mapeada vincula dez discriminantes aos payloads corretos; NativeItemPayload conserva refs/proveniência ampliados. O anexo fecha presença, propriedades extras, nullabilidade, domínio dos IDs, frame e NativeErrorDataCVG. A referência de NativeFrame ao cursor da SPEC7.2 é dependência específica legítima, sem devolver à SPEC a definição dos campos comuns.

D:201 fixa ID/ordinal por execução e publicação somente após commit conhecido. D:203 fixa timestamp UTC com milissegundos e origem no banco, persistido uma vez; created_at e relógio do reader não o substituem. D:205 fixa mirrors SQL e SHA256 do NativeEventV1 inteiro, excluindo frame/digest/cursor externos. D:207 diferencia erro governado de erro literal Codex e conserva nulls antes de execução/settlement. Nenhuma nova autoridade nasce desses campos.

**Contraexemplos agora rejeitáveis pelo contrato:** producer omite observedAt; reader recria horário; SQL mirror diverge do record; ordinal usa sequence global; type escolhe payload de outro discriminante; mapper fabrica execução/settlement antes de claim. D:209 e NJ23/24 exigem esses negativos e cold replay dos mesmos bytes/digest/timestamp/cursor. É um plano de prova falsificável, ainda NOT_RUN; não é alegação de que um codec já implementado passou.

**Disposição:** RESOLVED_TECHNICAL_DESIGN. Nenhum mínimo obrigatório remanescente deste achado no recorte revisado.

### R2-02 — resolvido no desenho atual

**Evidência:** Q:19–26,66–75,98–102; N/rules-matrix:126–157; N/test-plan:309–322; fontes arquivadas R39:190–218,291–324 e R40:244–257,447–458.

QR05 exige roles únicos RAW_INPUT/RAW_STDOUT/RAW_STATE. RAW_STDOUT conserva o stream original completo; RAW_STATE contém somente o frame-alvo opaco completo com LF. EXACT_BYTES escolhe RAW_STATE nos dois lados, normalizationPolicy=[] e EQUAL_COMPLETE. R39 permite esses roles e exige unicidade; R40 obtém o artefato escolhido e compara seus bytes integrais. O parse JSON do conteúdo projetado é específico do ramo EXACT_JSON. Assim o i64 opaco não precisa passar por Number nem exige alteração do core.

O positivo futuro exige setup metadata verdadeira diferente e frame-alvo real igual. Os bytes de setup deixam de participar da comparação de frame, mas continuam autenticados no stdout original. A escolha do frame não é concedida por um hash: Q:100 exige recomputação independente desde stdout/request/conexão/bounds, ID lossless esperado, exatamente um erro correspondente, offsets e LF. Q:102 impede registrar RAW_STATE elegível se qualquer lado falhar.

**Schedule ruim O06:** dois lados escolhem o mesmo frame anterior; o core pode retornar MATCH_REQUIRES_REVIEW. Os reports existentes e R/offline-cases/O06/test-only-lineage:3–25 registram justamente bytes selecionados iguais e selectedIsFixtureTarget=false nos dois lados. O contrato atual exige INELIGIBLE pelo gate, antes da qualificação funcional; não compara dois diagnósticos nem aceita o MATCH isolado. O gate ainda precisa ser implementado e qualificado: isso é obrigação concreta de BUILD/prova, não uma condição central de desenho deixada indefinida.

**Disposição:** RESOLVED_TECHNICAL_DESIGN. Nenhum mínimo obrigatório remanescente deste achado no recorte revisado. As observações offline são TEST_ONLY e não constituem positivo funcional autêntico ou qualificação do gate.

## Doze checks substantivos

`ADEQUADO_DESENHO` significa suficiência documental do recorte, sem PASS runtime.

| Check | Critérios | Evidência e julgamento |
| --- | --- | --- |
| C01 | FN08 | ADEQUADO_DESENHO · Freeze423, mapas históricos separados e static-integrity: versões atuais, R2/134, antigo N/184, R1/105, inputs38 e arquivos offline271 autenticados sem confundir identidade histórica com path atual. Reviews anteriores preservados. |
| C02 | FN01/FN02/FN04/FN07 | ADEQUADO_DESENHO · S:55; D:102–172: owner único, oito campos obrigatórios e dez discriminantes com união tipo-payload. Não basta contar nomes: omissão/extra/null indevido são recusados e os payloads ampliados continuam presentes. |
| C03 | FN02/FN03/FN04 | ADEQUADO_DESENHO · D:107–112,201: IDs/domínios, ordinal contíguo na transação de append e ausência de publicação de ordinal/ACK abortado. Sequence SQL não é ordinal público. |
| C04 | FN02/FN03/FN04 | ADEQUADO_DESENHO · D:203–205; S:145–157: origem DB/UTC-ms, persistência e cold replay, mirrors e domínio do digest/overhead coerentes. Novo timestamp do reader ou record/mirror divergente é erro verificável. |
| C05 | FN02/FN04 | ADEQUADO_DESENHO · D:173–198,207: NativeFrame tem evento/digest/cursor explícitos; error.data.cvg fecha code/execução/settlement e sua ausência real. Erros literais não são remapeados por conveniência; não há grants ou approval no erro. |
| C06 | FN01/FN03/FN04/FN06 | ADEQUADO_DESENHO · D:209–213; N/test-plan:294–322: positivo persistir/kill/reler e negativos de horário/ordinal/payload/mirror/digest; itemrefs/proveniência, limites e reservas de fechamento não foram reduzidos para obter verde. Todos futuros. |
| C07 | FN02/FN06/FN07 | ADEQUADO_DESENHO · Q:19–26,75; rules-matrix:126–157; R39:190–218,291–324; R40:244–257,447–458: RAW_STATE opaco separado de stdout integral, roles únicos e comparador atual consumível sem parse Number ou mudança do core. |
| C08 | FN01/FN02/FN06 | ADEQUADO_DESENHO · Q:98–102; NJ24:322: gate identifica request/erro/ID/conexão/bounds e refaz offsets/span/LF desde brutos protegidos. Hash de recorte sozinho e seleção por texto arbitrário do alvo não servem. |
| C09 | FN01/FN06/FN08 | ADEQUADO_DESENHO · Q:102; O06/report.json e test-only-lineage:3–25: duas seleções anteriores iguais continuam inelegíveis apesar do MATCH no core. Reports offline lidos, nunca reexecutados ou promovidos a resultado funcional. |
| C10 | FN01/FN02/FN06 | ADEQUADO_DESENHO · Q:66,75,100–102; rules-matrix:155–157; NJ24:315–322: positivo autêntico futuro com metadata diferente, mais negativos de role duplicado, frame anterior/ambos errados, i64 adjacente, offsets/LF/hash. Referência real permanece obrigatória e NOT_RUN. |
| C11 | FN01/FN03/FN04/FN05/FN06/FN07 | ADEQUADO_DESENHO no delta · Diff dos seis paths e128 paths R2 iguais: os30NJ preservam todos os campos anteriores; somente NJ23/24 ganham obrigações. Model-bridge, concurrency-schedules/19EA, CQ-coverage, gates e limites permanecem byteiguais à R2. READ, ambos response branches, WRITE/body0, stream, restart/fence, cancel/UNKNOWN/accounting e cursor separado não foram dispensados. |
| C12 | FN05/FN07/FN08 | ADEQUADO_DESENHO · S:7–15,227–250; targeted-recovery-task e attempt-disposition: bindings atuais, aprovação apenas técnica do contrato e gates de owner/fonte/T3 separados. Extensão explícita3reviews/2repairs preserva R2FAILED e encerra-se nesta R3; nenhuma aprovação funcional ou tentativa extra automática. |

## Critérios e alcance da decisão

| Critério | Veredito dirigido | Fundamento |
| --- | --- | --- |
| FN01 | ADEQUADO_DESENHO | Caminho14CQ e negativos mantidos; evento público e prova opaca agora têm contratos completos no delta. |
| FN02 | ADEQUADO_DESENHO | Envelope/payload/frame/erro e roles opacos fechados, com campos e bindings explícitos. |
| FN03 | ADEQUADO_DESENHO | Timestamp, digest, overhead e replay definidos; stream/caps/quota anteriores preservados. |
| FN04 | ADEQUADO_DESENHO | Campos persistidos e autoridade de append mantidos; terminal nullable/accounting ampliados da R2 não foram removidos. |
| FN05 | ADEQUADO_DESENHO_CONDICIONAL | DDL/grants/migração/qualificação dos owners continuam requisitos de entrada, sem novos atalhos. |
| FN06 | ADEQUADO_DESENHO | Cold replay e negativos de envelope, procedência opaca/both-wrong e core compatibility especificados;19EA/Q01–05 preservados, sem teste executado inferido. |
| FN07 | ADEQUADO_DESENHO | Owner canônico e consumidor do qualificador reconciliados; módulos/exports/ponte anteriores intactos. |
| FN08 | ADEQUADO_DESENHO | Revisão independente dirigida, histórico reconstruível, fontes/evidências diferenciadas e limites de autoridade declarados. |

**Design readiness: APPROVE_TECHNICAL_SPEC_DESIGN**, mandatory_count0, para a SPEC e seus anexos no SHA atual, com o alcance dirigido acima e continuidade dos fechamentos documentais anteriores inalterados. **Implementation readiness: BLOCKED_ENTRY_GATES**, separadamente: fonte/exports/manifest/qualificação dos owners e ponte; novo gate humano T3 ligado ao contrato atual; task/claim/candidata/recursos e execução das provas futuras. Nenhum gate antigo0221/0225/0231 foi reaberto ou transferido.

Persistem487 obrigações funcionais,22 controles,22 famílias/49 cartões/10 fases; a revisão não concede paridade ou fecha variantes ausentes. Todos30NJ/19EA e fragmentos do catálogo permanecem NOT_RUN, sem recibo funcional. Não houve alteração de SPEC, anexos, fontes, owners, reviews antigos, coordenação ou masters pelo crítico.

Sem achados obrigatórios adicionais neste recorte. R2FAILED permanece uma avaliação correta daqueles bytes históricos; a decisão positiva refere-se somente à versão atual corrigida. A próxima transição de governança pertence ao Lead e ao usuário, não a este parecer. O orçamento explícito desta recuperação está consumido; não há quarta revisão/rework automático.
