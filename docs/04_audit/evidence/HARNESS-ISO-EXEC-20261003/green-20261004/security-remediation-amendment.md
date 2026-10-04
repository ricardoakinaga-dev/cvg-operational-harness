# Emenda T3 — scanners reais e fontes ativas no candidato GREEN

Task: HARNESS_ISO_GREEN_20261004 / SECURITY_LOCAL. Estado: READY_FOR_HUMAN_T3_REVIEW; BUILD desta emenda ainda não autorizado. Base técnica: [SPEC0159](../../../../02_spec/0159_codeql_active_source_remediation.md), SHA-256 `67202401ad0215ac3cd52041857bf266be581e6292920b53425317e780207951`. Esta emenda substitui apenas o escopo/integração antigos pelo candidato GREEN e barra própria do produto0368/harness separado; não reabre UP91/0354, não exige push e não inventa produção aprovada. SPECs0179/0180 previamente aprovadas e NO_MODEL permanecem.

## Problema observado e evidência

CodeQL2.27.0, escolhido pelo commit pinado de Security, executou89queries em cópia física da fonte; 21 alertas, dez em fontes ativas e11 em cópias históricas. Gitleaks8.28.0 executou configuração existente, sem alterar regras:100 achados generic-api-key. [Inventário por hash](security-source-scan-r1.json) mantém os resultados brutos. Não houve inferência nem chave no snapshot.

## BUILD autorizado se aprovada esta emenda

1. Executar A/B da SPEC0159 em cópia privada: validar paths TypeScript e cardinalidade≤1wildcard, targets não vazios e erros explícitos; expansão de exatamente um wildcard por slicing; trim de barras final em O(n), preservando bytes válidos/SSRF nas duas implementações modelo e dois adapterscanal. Preservar assinatura/publicexports e zero I/O na recusa.
2. Filtragem de instruções em conversation: algoritmo O(n), nove grupos e espaçamento Unicode/substrings preservados por corpus diferencial determinístico da SPEC0159; mais de16.384 unidadesUTF16 recusa antes de scan. Não reclassificar CLINICAL, não aprovar RAG, não mudar fontes institucionais.
3. C1 tem a mesma expansão de alias em `scripts/check-product-boundary.mjs`: validação explícita e slicing para zero/umwildcard; config malformada e resolução desconhecida continuam INCOMPLETE/FAIL. Preservar191negativos/positivos e aceites físicos; não transformar installed441diagnostics em PASS por exceção.
4. Sandbox `services.ts` tem substituição com regexpvazia quando não há nome: remover esse noop; prefixo só é removido se o nome literal e whitespace esperado existirem. Conservar fixtures/IDs/números/associações; não ampliar parser clínico ou liberar inferência.
5. Provar o rate limit vigente das duas rotas publish/rollback com identidade sintética válida e PostgreSQL compartilhado: orçamento antes de preflight/efeito, dois processos, falha do store e proxy não confiável. Nenhuma alteração de threshold/API/server.ts de terceiros é autorizada aqui; se o orçamento vigente não for justificado por custo/abuso, manter alertas abertos e preparar decisão separada. Resultado de scanner e disposição técnica permanecem distintos.
6. Gitleaks: identificar origem de cada achado. Apenas constantes sintéticas comprovadas, IDs internos de fixtures, prosa e atribuições vazias são candidatos a disposição. Criar inventário estrito por ruleId/path/posição/hash da fonte e span; um guard valida hashes antes de aplicar fingerprints individuais. Mudar fonte/span ou inserir novo segredo no mesmo local deve falhar. Não ampliar allowlists de diretório, não desligar regras específicas, não editar bytes históricos nem ignorar achados desconhecidos. `.env.example` fica sem valores secretos e tick1. Configuração `.env` privada permanece fora dos scanners de fonte versionada/imagem.
7. CodeQL: preservar os11 arquivos históricos e seus hashes; declarar disposição individual e demonstrar que não pertencem ao bundle/entrypoint/importclosure executável. Scan ativo adicional pode excluir somente `docs/04_audit/evidence/**` sob esse inventário aprovado, mantendo scan bruto original inteiro, scanners/querysuite ativos e relatórios distintos. Não suprimir regra ou alerta remoto. Qualquer novo achado ativo fica visível e bloqueia aceite até correção/triagem sustentada.

## Paths e isolamento

Escrita somente scratchGREEN novo security-candidate: scripts/workspace-dependency-audit.mjs, check-product-boundary.mjs, helpers/manifest/guardde triagem; providersOpenAI/Ollama; adaptersChatwoot/Evolution; conversation/state; sandbox/services; testes novos; `.gitleaksignore` e integração específica guard/queryscope em workflowSecurity da cópia. Código de API só leitura e fixtures próprias; RootPR-L04 e ledgers mistos preservados. Nenhuma regra firewall host, instalação global, dado real, efeito clínico, promoção automática ou commit alheio.

## Gates e aprovação

Task/claims registrados antes de BUILD. Negativos reais: alias inválido vs válido, regex antiga vs nova, tempo/crescimento relativo, identidade/PG antes de efeito, alteração de segredo na mesma linha/filehash e scanner específico positivo. Nenhuma asserção histórica enfraquecida. Tipos/lint/suíte completa/PostgreSQL/E2E, críticas novas de fonte congelada e scanners reais no candidato integrado. Findings ou falhas não se tornam PASS por anotação. Commits locais por paths próprios só após gates/condições de promoção anteriores; sempush/providerreal adicional/dadosreais/piloto/produção. Execução OpenAI sintética e infraestrutura continuam sujeitas aos packetsT4 próprios, separados desta aprovação de BUILD.

D-12 exige “T2 + revisão explícita da SPEC pelo usuário antes do BUILD” paraT3. Esta revisão abrange exatamente esta emenda e a base0159 por SHA acima, limitadas ao candidatoGREEN.
