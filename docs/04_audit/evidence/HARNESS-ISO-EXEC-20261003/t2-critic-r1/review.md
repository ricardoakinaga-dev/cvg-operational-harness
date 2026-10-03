Parecer T2 — crítico I1 fresh-context, sealed, readonly, sem descendentes. **FAIL restrito à implementação da SPEC0178**, confiança alta. Critérios: AGENTS, constituição docs/07, coordenação, SPEC0178, ADR010 e aceites originais0369/0370 preservados no quality-bar de24 cartões. Não avaliei aprovação de0179/0180, implementação T3, conclusão integral0369/0370, piloto ou autorização clínica. P01 e demais comportamentos futuros não foram usados para reprovar o move.

Os arquivos do checkout não foram alterados. Escrita somente nesta pasta temporária; sem rede, serviços, providers, banco, duplicação da suíte, descendentes, commit ou push. Os únicos executáveis adicionais foram fixtures sintéticas de módulos, checker readonly e formato limitado aos inputs selados.

- **P1 T2-I1-F1 — Closure transitiva deixa intermediários resolvidos sem inspeção.** Critérios: HISO-005, SPEC0178 item5, ADR010 item2.

  Âncoras: `scripts/check-product-boundary.mjs:52`, `scripts/check-product-boundary.mjs:178`, `scripts/check-product-boundary.mjs:187`.

  Prova: boundary-probes.json: transitive-scripts returns passed=true, diagnostics=[], violations=[]; real Node22 import prints PRODUCT_LOADED. Core -> scripts/bridge.mjs -> products/shift/src/index.mjs. A type-declaration bridge also returns true.

  Correção verificável: Visitar recursivamente cada alvo local resolvido, inclusive intermediários fora das quatro raízes e declarações relevantes; se a closure não puder ser verificada, reprovar explicitamente.

- **P1 T2-I1-F2 — createRequire e referências desconhecidas por loader recebem PASS.** Critérios: HISO-005, SPEC0178 failclosed unknown.

  Âncoras: `scripts/check-product-boundary.mjs:218`.

  Prova: boundary-probes.json: createRequire-literal and createRequire-unknown both passed=true with empty diagnostics, and both real Node22 executions print PRODUCT_LOADED. Visitor recognizes only a call identifier literally named require or ImportKeyword.

  Correção verificável: Reconhecer loaders de createRequire e aliases/imports correspondentes; referência não literal nesses loaders deve produzir diagnóstico bloqueante ou inventário estrito aprovado.

- **P2 T2-I1-F3 — Manifesto after dos dois deploys não identifica o candidato atual.** Critérios: HISO-004 evidence, HISO-007 evidence.

  Âncoras: `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/source-moves.json:115`, `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/source-moves.json:121`, `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/source-moves.json:124`.

  Prova: independent-moves.json: Dockerfile now f3f8c5c7becf8ed6a729cf946a517566295ab73f101ac22286de851e11206fbb, compose now d2f08099a0f9df8fbdb6388e7d2b27356094c58e6dd4444fd078e4b0143980db; source-moves after hashes are initial old bytes and allBytesPreserved is true. The 17 TS and .env are preserved; deploy path adjustments are authorized, not behavior regressions.

  Correção verificável: Preservar manifesto histórico e anexar delta/fingerprint final de deploy, explicitando que sha256After inicial precede os ajustes autorizados.

- **P2 T2-I1-F4 — Descoberta canônica de links omite a documentação transferida.** Critérios: HISO-008 docs checks, SPEC0178 item7.

  Âncoras: `package.json:58`.

  Prova: docs-discovery-probes.json: exact root script roots README.md/docs gives exit0 while products/shift-assistant/docs/broken.md references missing-real.md; adding product root gives exit1. Current actual product docs pass when explicitly scanned.

  Correção verificável: Incluir docs do produto no comando canônico de descoberta de links, ou fornecer comando próprio ligado ao gate de documentação. Não exige implementar os jobs T3 de HISO-010.

Verificações e limites de aceite:

- **PASS:** 17TS idênticos aos antigos do HEAD; .env preservado; nenhum wrapper deixado no worker. Os dois deploys têm apenas ajustes de build/paths/contexto. Workspace privado, lock e builds públicos estão coerentes; paths={} e exports construídos foram inspecionados. Consumer continua provider.execute; nenhuma migração de gateway, deadline, persistência, identidade ou approval foi implementada nesta fatia.
- **PASS observado nos artefatos:** full-tests-r2,335arquivos/2614testes/0SKIP, exit0, sentinel antes/depois igual; a falha inicial de7testes permanece preservada. Correção do oracle de shutdown limita a janela a shutdown_started, conserva exit0 e proibição de ready posterior; diffs não alteram worker/readiness de produção. Focais corrigidos estão preservados. PG288 e E2E12 têm logs reais; build/bundle/demo/imagem/smoke reais são positivos no escopo sintético registrado, sem inferir hardening/piloto.
- **PASS observado na variante neutra:** npmci finalr2 offline, typecheck, closure contracts/orchestrator/harness por exports,27arquivos/369testes e smoke real de composição/saída, todos exit0 e sentinels MATCH. Recomparei lock: somente node_modules/@cvg/shift-assistant e products/shift-assistant removidos; zero outras entradas alteradas. Sources e link do produto ausentes. Smoke testa bloqueio pelo flag requiresApproval; não prova classificação clínica, matriz completa de risco, servidores/processos dos hosts ou produção.
- **PASS de descoberta estática:**333suites anteriores viraram335; zero ausentes, somente2testes novos. Inputs executáveis de coverage normalizados pelo move:257antes/257depois, zero ausentes/novos;188packages,46apps,9legacy,14produto; pisos90/85/90/90 inalterados. Inventários em suite-inventory.json e coverage-denominator-inventory.json; declarações sem código executável separadas.
- **NOT_RUN:** coverage medido por dono no candidato atual, typecheck/lint finais posteriores à integração de checker/oracle, formatação global e CI remoto. Typecheck/lint iniciais registrados tiveram exit0, mas não os apresento como selo de inputs finais. A documentação-checks.json registra links/higiene, não um resultado final de formato. Os jobs por artefato e contrato CI T3 são escopo excluído; não os exigi para implementar a relocação T2.
- **FAIL de formato focal atual:**48paths selados com parser suportado, prettier--check exit1 em tests/product-boundary.test.js e products/shift-assistant/docs/backlog.md. Os cartões do backlog foram transferidos byte-preservados; qualquer tratamento de formato deve respeitar esse requisito ou documentar exceção, não reescrever os aceites históricos. A primeira invocação sobre50paths recebeu dois erros de parser em .env/Dockerfile; foi classificada como procedimento inválido e repetida apenas nos48suportados, sem writes.
- **PASS de docs atuais com descoberta explícita:** checker readonly sobre README/docs/products retornou exit0,20links históricos resolvidos,zero broken/stale/missing. Positivos/negativos já registrados do checker foram inspecionados: mapa exato20origens/destinos, sem exceção de prefixo; origem deve faltar, destino deve ser arquivo, escapes/symlinks/duplicatas/chains são rejeitados. Dez cartões PISO mantêm targets/evidências do quality-bar e hashes de seções originais; root tem ponteiros, produto tem o status canônico. Docs distinguem comportamento atual, mudança T3 futura e uso real.

Selo independente:50/50inputs MATCH antes/depois; agregado `65e651d763ee1d3be18bae0b3e71e6824522c2dcac13867767acd6342e654b9e` coincide com o fornecido. Inventário ampliado1043/1043sem alteração. Snapshot difere byte a byte em tsconfig.typecheck.json e config/workspace-dependency-policy.json apenas por formatação: ambos JSONs semanticamente idênticos; essa diferença foi explicitada, não escondida. Arquivos sealed-hashes-before/after.json e hashes-after-comparison.json contêm a prova.

O maior bloqueio é HISO-005: controles conhecidos simples passam/reprovam corretamente, porém os dois escapes concretos recebem PASS enquanto carregam o produto. A suíte agregada verde e a variante neutra não corrigem a incompletude desse oracle. Recomendo corrigir os dois caminhos, manter os negativos reproduzidos e reavaliar a fatia com fingerprint final. Este parecer não muda status de qualquer cartão e não concede release.

Reprodução bounded: `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-harness-iso-exec-20261003/t2-critic-r1/boundary-probes.mjs`. Inputs das fixtures e resultados reais estão em fixtures/ e boundary-probes.json. Demais provas próprias: independent-moves.json, backlog-byte-boundaries.json, docs-discovery-probes.json, doc-links-current.json, format-current-supported.json/log e review.json.
