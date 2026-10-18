# Revisão independente R1 — SPEC 0228

Task: `B6-REMEDIATION-SPEC-20261017`. Data: 17/10/2026. Revisor: Codex, contexto independente do autor, sem descendentes. Método: revisão documental e estática; nenhum módulo da candidata, fixture ou payload foi executado.

**Veredito: ACCEPT_SPEC**, exclusivamente para a suficiência técnica da primeira fatia conservadora descrita na [SPEC 0228](../../../../02_spec/0228_b6_boundary_fail_closed_remediation.md). Não há correção obrigatória identificada nesta revisão. Implementação permanece NOT_RUN e BUILD NÃO AUTORIZADO; revisão humana T3 continua necessária. B6/HISO-014 permanecem sem aceite e produção sem GO.

## Identidade e escopo

- SPEC revisada: SHA-256 `dba80373bf40f38befa5bdbf34a82889e954fc4440f11b57b54c74be85e49a73`.
- Referência: [reauditoria 0619](../../../0619_b6_stable_isolation_reaudit_2026-10-17.md), SHA-256 `8956e5c79f5f0df1d7fd18cf1883f9ab8436ff29c83e2a5b863c0aebd7a0cf27`.
- Código congelado: candidata `5a199668eef5db4ca7aa2adc3853169ca0953cbf`, em `/tmp/cvg-b6-stable-20261017/candidate`.
- `scripts/check-product-boundary.mjs`: SHA-256 `06148837868dfec6d291a7dad744689bf93983a307f853ad878c8a76ba8e7215`.
- `scripts/boundary-manifests.mjs`: SHA-256 `1c9b9a668617750b5aa58de7980fcf662a70f4c0c4a4d3f7d05f4c5150a54b00`.
- Leitura das instruções raiz, constituição operacional, regras/claim de coordenação e estado corrente relevante dos ledgers 99/20/30. A restrição explícita da delegação prevalece: estes dois artefatos são a única escrita do revisor; integração e ledgers ficam com o Lead.

Hashes dos demais inputs, critérios e procedimentos estão em [review.json](review.json). O parecer vale para os bytes identificados, sem aprovar alterações posteriores por antecipação.

## Fundamentação por critério

As referências ao código abaixo usam caminhos relativos à candidata congelada, não o código mutável do checkout compartilhado. SUFICIENTE significa contrato documental adequado; não significa implementação verificada.

| ID | Critério e avaliação | Referências e evidência |
| --- | --- | --- |
| R1-C01 | WHAT/HOW da primeira fatia: SUFICIENTE. Retirar confiança terminal e desativar a tabela são mudanças concretas e delimitadas; não dependem da criação de uma prova positiva. Arquivos, sequência, dependências e resultado estão definidos. | SPEC:9–16, 40–50, 58–76, 125–135. `boundary-manifests.mjs`:454–475 contém o terminal atual; `check-product-boundary.mjs`:1755–1765 contém a supressão atual. |
| R1-C02 | Honestidade e limite da promessa: SUFICIENTE. Eliminar os falsos PASS reproduzidos significa recusar os controles como INCOMPLETE, não provar ausência de dependência proibida. A SPEC não promete encerrar os P1/B6 ou fornecer um gate geral verde nesta unidade. | SPEC:14–16, 52, 91–102, 147–149; 0619:44–62, 109–119. O HOW da prova positiva é explicitamente futuro e exige outro contrato/revisão. |
| R1-C03 | Instalados e versões: SUFICIENTE. Todo terceiro instalado fica `verified: false`; igualdade de nome/versão/URL/SRI não comprova bytes. Mismatch exato tem motivo e drift próprios; workspaces conservam classificação distinta. | SPEC:58–68, 109–113. `boundary-manifests.mjs`:444–475 aceita metadados e apenas informa divergência hoje. `vendor-probes-r2.json`, casos `split-same-version` e `split-version-drift`, arquivam os PASS indevidos. |
| R1-C04 | Expansão, FAIL e drift: SUFICIENTE. Recusar confiança não interrompe dependências/links/scan, não esconde violação conhecida e não apaga drift. Precedência FAIL > INCOMPLETE > PASS e erros próprios são preservados. | SPEC:65–76, B6R-01/03/05/06/10/14. `check-product-boundary.mjs`:316–358 expande mesmo não verificado, mas hoje só guarda drift em `else if`; 1691–1713 constrói testemunhos/proveniência; 1790–1823 decide status e publica drift. |
| R1-C05 | Todas as exceções: SUFICIENTE. Nenhuma família permanece ativa por inferência, incluindo espelhos compilados e os dois grupos com ID compartilhado. A revisão semântica individual é requisito para reativação futura, não pré-condição para desativar tudo. | SPEC:80–91, B6R-07/08; `check-product-boundary.mjs`:1873–2534 e 2556–2579; `exception-inventory.json`. Conferidos 16 grupos/15 IDs/142 chaves/capacidade 192/48 caminhos; dez grupos sem pin integral de cada chamador. |
| R1-C06 | Invocação normal, strict e legada: SUFICIENTE. CLI normal/strict e opção omitida/false recusam supressão; true explícito produz `UNAPPROVED_EXCEPTION_REQUEST`, sem enfraquecer FAIL. Saída e códigos de saída estão definidos. | SPEC:82–89, B6R-07/09, 139. `check-product-boundary.mjs`:84–86 e 2602–2604 mostram default e chamada explícita atuais; 2606–2614 contém saída/exit. A CLI deverá ser adaptada, junto com o default, para não tratar sua invocação normal como pedido legado. |
| R1-C07 | Riscos e compatibilidade: SUFICIENTE. A quebra de PASS normal é deliberada e apresentada ao usuário; `passed: false`, exit1 e compatibilidade de `--strict` permanecem claros. Não há rollback permissivo ou integração automática. | SPEC:14, 26, 50–52, 135–143. Os P2 de CI/inventário, barras por artefato e runbook geral continuam fora desta unidade; 0619:64–94. |
| R1-C08 | Testes e integração: SUFICIENTE. A matriz exige negativos originais, inventário sem remoções/skips artificiais, preservação por ocorrência, percurso real de 303 instalados, suites T2/T3 e consumo compilado revalidado. | SPEC:B6R-01–14 e 123–135; matriz com 14 aceites idênticos à SPEC, todos NOT_RUN. Evidência histórica: `regressions.json` contém 145 PASS/zero pendentes/todo; não foi reexecutada. `tests/product-boundary.test.js`:1126–1145 e 1198–1211 demonstram expectativas antigas cuja migração é necessária. |
| R1-C09 | Autoridade humana: SUFICIENTE. T1 de documentação não vira autorização de BUILD T3, implementação, publicação ou produção. O usuário deve revisar a versão/hash efetivamente submetida. | SPEC:5, 18–22, 129–149; constituição `docs/07_agents/AGENTS.md`: regras de transição e D-12. Nenhuma decisão humana foi inferida ou criada pelo revisor. |

## Achados e correções exigidas

**Nenhum finding de defeito de SPEC foi identificado; `findings: []`. Nenhuma correção obrigatória.** As severidades aplicáveis seriam P1 para confiança/autoridade indevida, P2 para lacuna material de contrato/aceite e P3 para defeito menor. Não se atribui severidade fictícia a uma ausência de achados.

Os seguintes pontos são observações estáveis de implementação, não pedidos de ampliação desta SPEC:

- **R1-N01 — INFO, invocação:** `check-product-boundary.mjs`:2602–2604 passa hoje `exceptions: !strict`. O BUILD deve cumprir SPEC:86–88 nas duas camadas, evitando que a CLI normal ganhe indevidamente o diagnóstico reservado ao pedido programático legado. Correção adicional de SPEC: nenhuma; comprovação futura por B6R-07/09 e controle neutro B6R-01.
- **R1-N02 — INFO, drift:** `check-product-boundary.mjs`:318–324 perderia drift se somente `verified` fosse trocado para false. SPEC:72 exige expressamente desfazer esse vínculo. Correção adicional de SPEC: nenhuma; comprovação futura por B6R-03/10 e FAIL coexistindo com incerteza por B6R-05.
- **R1-N03 — INFO, integração:** a consequência operacional desta fatia é manter a fronteira recusada. SPEC:135/139 não autoriza omitir esse resultado da certificação nem substituir INCOMPLETE por PASS. Correção adicional de SPEC: nenhuma; registrar o resultado real do pipeline, inclusive eventual bloqueio, sem declarar fechamento de B6.

## Procedimentos e limitações

Foram feitas leituras de texto com linhas, inspeção dos dois módulos congelados e das expectativas pertinentes do teste existente, hashes SHA-256 e análise inerte de JSON/texto com Python padrão. Não houve import de código da candidata. Os totais do inventário foram recalculados a partir de `sites`/`pins`, comparados aos campos derivados e aos 16 IDs ordenados da tabela textual. A matriz foi comparada aos 14 aceites e ao hash da SPEC.

Os resultados arquivados da B6 distinguem o normal histórico PASS (303 instalados/165 exceções) do strict histórico INCOMPLETE (165 diagnósticos/zero exceções). As duas trocas de receptor são PASS com exceção e INCOMPLETE sem ela. Para instalado concatenado, os quatro controles corrigidos de `vendor-probes-r2.json` são a evidência pertinente; os resultados iniciais com nome nu `shift` continuam preservados e não foram confundidos com a reprodução corrigida.

Não foram executados checker, testes, scripts arquivados ou corpos de fixtures; nem rede, instalações, serviços, PG/Docker, builds, certify/E2E ou descendentes. Os 145 PASS e a jornada compilada são evidências históricas lidas, não resultados produzidos por este revisor. Não foi feita atestação dos bytes de todas as dependências, revisão semântica de segurança de cada antiga justificativa, reauditoria completa dos P2, CI remoto ou validação de produção. Nada disso é concedido por ACCEPT_SPEC.

O risco residual deliberado é não haver prova positiva de isolamento; ele permanece exposto como INCOMPLETE e não como risco aceito de produção. A confiança é alta na suficiência documental desta primeira fatia; o comportamento da implementação futura continua não verificado. Próximo passo: o Lead integrar este parecer no pacote da mesma versão, preservar os limites e submeter a SPEC/hash à revisão humana T3 antes de BUILD.
