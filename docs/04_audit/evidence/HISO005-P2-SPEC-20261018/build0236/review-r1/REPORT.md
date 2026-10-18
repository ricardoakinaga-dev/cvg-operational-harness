**R1 — REVISE.** Crítica independente fresca da composição HISO005 P1+SPEC0236, sem implementação ou promoção. Quatro achados obrigatórios reproduzidos pelo crítico; um red adicional observado pelo Lead e identificado separadamente. Nenhum aceite de B6, P2/P3 ou produção. Ownership da revisão readonly **liberado ao Lead** para um reparo agrupado e novo freeze/R2.

Fonte examinada: `/home/ricardo/cvg-candidates/hiso005-integrated-20261018`, HEAD `22ca4c52dbfd6f80c474def544d3eb4e14852e2f`, base `26d866c39060669680aca01b34a916d45e1ba362`. SPEC SHA256 `cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49`. Os 17 paths, hashes atuais e pré-imagens26d conferiram; candidata limpa antes/depois. O diff comprometido contra26d contém exatamente os17paths. Os55deltasClaude anteriores não foram editados, atribuídos ao crítico nem auditados integralmente. Constituição, coordenação e topos99/20/30 próprios foram lidos. Claim e handoff ficam nesta área, conforme limite explícito; ledgers/index/fonte não foram editados.

[review.json](review.json) contém critérios SP01–18, causa/impacto, hashes, achados e limitações; [preflight.json](preflight.json) e [independent-evidence.json](independent-evidence.json) registram a identidade conferida. Os inputs/outputs/fontes sintéticos foram preservados em [probes/](probes/), além dos temporários autorizados. Alvos foram apenas lidos; nenhuma aplicação avaliada foi importada ou executada.

**Achados obrigatórios próprios**

| ID | Prioridade | Mecanismo e evidência | Recusa conservadora recomendada |
| --- | --- | --- | --- |
| R1-01 | P0 | `bind`, engine966–973: chave computada de BindingElement não é avaliada; fallback usa nome local. p17 instalado MATCH com chamada real de import na chave, caminho finito composto para produto, obtém `PROVEN`, `verified:true`, `PASS/exit0`. | Recusar ComputedPropertyName em binding no v1 antes de qualquer fallback: UNKNOWN na closure, zero provas e verifiedfalse. Não criar resumo para a chamada omitida. |
| R1-02 | P0 | engine1124–1127: `export default function(specifier){ return import(specifier); }` sem nome nunca entra no mapa de exports. p15 instalado MATCH recebe `verified:true`, `PASS/exit0`; corpo e parâmetro externo não passam por K0. | Recusar a forma anônima sem representação segura de default. Qualquer reparo de representação continua sujeito ao corpo real e argumentos externos UNKNOWN, pelas regras existentes. |
| R1-03 | P1 | aquisição496–505/interpretação1078–1083: `import {type T}` é apagado por completo. p04 kernel PROVEN omite produto dos inputs; compiler6.0.3 pinado com verbatimModuleSyntax preserva `import {}` para o alvo. | Recusar perfil de apagamento não demonstrado ou conservar a aresta runtime apropriada; distinguir `import type` de specifiers inline type. |
| R1-04 | P1 | compiled707: regex `[a-z-]+` rejeita o argumento obrigatório `--installed-reference-sha256`. p20: CLI2/COMPILED_CLI_OPTIONS_INVALID. Red actual-tree do Lead concorda. | Aceitar dígitos no nome mantendo allowlist/duplicados/digests; controle CLI positivo físico e negativos. Reemitir receipt final via CLI no novo freeze. |

A recomputação retorna `validation.valid:true` para os falsos PROVEN semânticos: ela repete o mesmo intérprete e suas omissões. Integridade de IDs/DAG não demonstra completude das transferências. p19 mostra a propriedade útil separada: prova rehashada com dependência inexistente é recusada por RECOMPUTATION_MISMATCH.

O alcance dos achados foi discriminado: p12/p13 de primeira parte ainda conservam NON_LITERAL_MODULE_REFERENCE/INCOMPLETE; p14 mantém FAIL legado por produto direto. p16 instalado com texto literal de produto ainda mantém FAIL pelo scanner textual, embora o kernel esteja PROVEN. p17 usa caminho finito composto e vence essa barreira, demonstrando PASS indevido de fronteira real. Para R1-02, a falha demonstrada é da obrigação K0 de fechamento de todo export público; não se afirma que o corpo foi executado durante esta auditoria.

**Reproduções exatas e código**

Todos os caminhos abaixo são relativos a este relatório; o mesmo sufixo após `probes/` existe em `/tmp/cvg-hiso005-integration-20261018/review0236-r1/`.

- R1-01: [fonte instalada](probes/p17-host-installed-computed-finite/evaluated/node_modules/vendor/index.js), [request](probes/p17-host-installed-computed-finite/request.json), [output](probes/p17-host-installed-computed-finite/output.json), [CLI](probes/p17-host-installed-computed-finite/cli-output.json). SHA da fonte `629dd32dfbc91e397432e2c39eb4acbb3a7995c18d6f1f985baa8d7e64e571ea`.
- R1-02: [fonte instalada](probes/p15-host-installed-default/evaluated/node_modules/vendor/index.js), [request](probes/p15-host-installed-default/request.json), [output](probes/p15-host-installed-default/output.json), [CLI](probes/p15-host-installed-default/cli-output.json). SHA `8a54d6434b65388a2f9de03f349d6f9cac081c45933852a3ec20d494eea872ca`.
- R1-03: [fonte TS](probes/p04-types-runtime/entry.ts), [input](probes/p04-types-runtime/input.json), [output](probes/p04-types-runtime/output.json), [emit do compiler pinado](probes/p04-types-runtime/compiler-runtime-output.json). SHA `f471001be230b03b4c594cd223d5fb66cd6ef6144c0c6fc67dbbb7a41da006ba`.
- R1-04: [argv exato](probes/p20-compiled-cli/input.json), [stdout/stderr/exit](probes/p20-compiled-cli/output.json); correlato Lead `../compiled-reference-build-r1.json`.

Engine SHA `025ebf8fd2030c297f85c3ba4bfe40688d01c00d2e14ad8af22504868b97dd03`; checker `f62a8695b78c1507a9e0e2ae6b378c71d1b2fda4c237fe2ea1b7cfc063294902`; compiled helper `48179094c42d3b2aa7f7c4c7b34f22c13f90b4b1e709d4bcc702b9b55cd96726`. [probe-manifest.json](probe-manifest.json) fixa bytes/hashes dos artefatos sintéticos.

Repro individual, sem executar alvo, enquanto os hashes22ca forem os mesmos:

```sh
env -i PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin LANG=C LC_ALL=C TZ=UTC /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-hiso005-integration-20261018/review0236-r1/replay.mjs p17-host-installed-computed-finite
```

Substituir o ID por `p15-host-installed-default`, `p04-types-runtime` ou `p20-compiled-cli`. O replay recusa mudança dos hashes; não reutilizar o resultado22ca como resultado do reparo. As receitas completas usadas estão nos scripts próprios preservados em probes. Os receipts instalados das sondas são sintéticos privados, sem instalação/rede e sem pretensão de atestação SRI real.

**Observação adicional do Lead, fora das20sondas do crítico**

LEAD-R1-05, P1 obrigatório: parser aceita `export const value: number=1;` em `.js` e declaração const duplicada; engine PROVEN/validationtrue, mas Node22 `--check` exit1 em ambos. Origem explícita: duas sondas executadas pelo Lead. O crítico leu e preservou os resultados brutos em [js-type-first-red.json](lead-observed/js-type-first-red.json) e [js-duplicate-first-red.json](lead-observed/js-duplicate-first-red.json), sem reexecutá-las. A hipótese de PASS instalado ainda não foi demonstrada por essas duas saídas. O falso PROVEN do kernel já é concreto. Recomenda-se guard de gramática do runtime pinado antes de publicar PROVEN, somente parse, com deadline restante supervisionado e revalidação física após o guard; erro/timeout nunca permite prova parcial. Essa recomendação é controle conservador, sem nova regra K.

**O que se sustenta no escopo observado**

20 cenários próprios executados com Node22.23.2 absoluto, ambiente mínimo sem NODE_OPTIONS/hooks/flagsVitest e parser TypeScript6.0.3 pinado. Houve positivos JS/reflexão no engine e checker público; negativas próprias para this extraído, mutação de intrínseco, captura pública mutável, parâmetro sombreando Object, getter, ciclo, cap e prova adulterada. p18 preserva VIOLATION conhecida apesar do limite reduzido. Nenhuma sonda21 foi executada.

Os quatro relatórios/grafos default e identity foram descomprimidos e comparados byte a byte aos before/after reais de9b e22ca: igualdade exata;537diagnósticos preservados. Recomputação independente do multiset histórico:168ocorrências antigas presentes entre234atuais (+66),303nós instalados presentes entre303atuais, nenhum faltante. Isso é preservação de baseline; não é aceite da partição semântica real.

Foram inspecionados fonte, assertions e evidências89engine/15compiled/12CLI/93legacy e first reds. Os93fullNames legados têm multiset exatamente igual antes/depois; tabela histórica inteira permanece byteidêntica à26d:38.027bytes/SHA614d036a…; controles de drift, missing, symlink, razão/path/linha/expressão, multiplicidade e produto preservados sob0228, sem reativar exceções. Ver [legacy-name-check.json](legacy-name-check.json), [static-table-check.json](static-table-check.json) e deltas dos dois testes. O erro inicial de config/test setup e os72fails/21passes após preparo público permanecem nos inputs históricos;93PASS posterior não os apaga. Não houve rerun da fullsuite pelo crítico.

A receita compilada inspecionada usa variante nova, archive, ausência inicial de emits/incremental, compiler/config/source/dependencies pinados, force build e resolução pública; observer inclui getSourceFiles e recusa fonte/declaration externa. Receipt/digest, eventos, outputs e inputs são revalidados; sem transferência de prova TS para JS. Os15testes API e o actual-tree API exit0/33,63s do Lead apoiam esse caminho, não tornam a CLI vermelha aceitável nem provam ausência exaustiva de races. O TCB/caller e worker são pinados e a publicação revalida hashes; isso também não corrige transferências semanticamente incompletas.

Referência89fd40e9 do Lead é byte-only. Consumidor fresco22ca207imports/76exports/zero rede e seu build receipt foram lidos/hashados como evidência do Lead, sem executar seus alvos. Nenhum resultado do Dirac antigo foi usado para aprovar a semântica.

**Limitações e próximo passo**

R1 julga mecanismo/composição dos17paths; não é prova completa de soundness nem busca exaustiva de races. Caps/perfis/exports/resolução recusados e contabilidade foram examinados com profundidade focal; onde só há evidência de builder isso está separado nos critérios de review.json. SP14/partição semântica real, SP15/gates amplos e SP17/zero obrigatórios continuam pendentes. UNKNOWN correto não encerra B6. Nenhum PG/porta/install/certify/E2E/SBOM/licenças/rede/dado real/commit foi usado; nenhum descendente ou job próprio permanece ativo.

Lead pode aplicar uma correção agrupada dos quatro achados próprios e do red de gramática observado por ele, preservando aceites/first reds/default0228/0234 e sem ampliar K0–K7; depois fornecer novo freeze/hash/inputs à única R2 restante. Não promover nem fullcertificar22ca. Estado de continuidade e ownership liberado constam de claim.json/review.json; ledgers permanecem sob o Lead.
