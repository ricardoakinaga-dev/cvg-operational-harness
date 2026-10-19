# Decisão T3 — primeira unidade da frente HISO-005/B6

Estado: **revisão técnica ACCEPT_SPEC; decisão humana pendente; BUILD não autorizado**. A frente inteira permanece aberta.

## Contrato submetido

[SPEC0234](../../../02_spec/0234_b6_installed_content_identity.md), SHA-256 **`b33aff4d1d1e36d64dd97298bc73d1c058220776c349e6704478303ef8a9c76d`**. [Plano integral0389](../../../03_build/0389_hiso005_positive_proof_execution.md), SHA-256 `560d63c93d1b4702a63f9fa0b1a05d9966facd763ba2dec9049c836e9c759e3b`. [Revisão independente](review-r1/REPORT.md), [decisão estruturada](decision.json). Os dois documentos congelados foram julgados sem achados obrigatórios.

## O que a aprovação autoriza

Construir referência offline em recursos próprios, com Node22.23.2/npm10.9.8 fixados e scripts desativados, a partir do lock congelado/cache validado. Comparar inventários físicos completos; relatar MATCH/MISMATCH/UNAVAILABLE/UNSUPPORTED, preservando `verified:false`, todos os diagnósticos, expansão e FAIL de produto. Implementação,14aceites, gates T2/T3/certificação/consumidor e crítica de código devem ocorrer em candidata própria. Checkpoints locais seletivos apenas para esses gates; nenhuma integração automática ao principal.

Decisão explícita de confiança: usar o npm local pinado como ferramenta do recipe e o responsável confiável pela sua revisão. [Pins observados](toolchain-pin.json): Node SHA-2563517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327; árvore npm SHA-256a931e1d739da4bc407ffd23e6b242f20c3f7475378a0718bac03c83e7ca801ae. Esses pins fixam ferramentas locais; não atestam autenticidade do fornecedor ou semântica segura de qualquer pacote. O componente não protege contra um responsável malicioso que fabrique a proveniência, conforme a SPEC.

## Evidência e limitações atuais

Os303payloads da closure existem e correspondem ao SHA-512 do lock,60.775.410bytes examinados readonly. No lock inteiro há354entradas de registro:304payloads disponíveis e50ausentes, todos opcionais e sem seleção aparente para este os/cpu. [Recon da closure](recon.json), [recon do recipe](recipe-cache-feasibility.json). Nenhum npmci, extração ou comparador foi executado; configuração, libc, seleção optional, limites e validade temporal ainda precisam das provas de BUILD. Disponibilidade de cache não promete303MATCH.

A baseline segue com471diagnósticos/303instalados não verificados. Mesmo igualdade de bytes **não** concede PASS/B6: semântica, loaders, receptores/espelhos e novaB6 continuam marcos P2/P3 da mesma frente. Sem outro programa iniciado, provider/canal/dado real, mudança de lock/workflow/runtime, push/deploy ou produção.

## Ação humana requerida

Aprovar o BUILD local sintético **desta SPEC0234 neste hash**, pedir ajustes ou rejeitar o contrato. A autorização da0228 não se aplica ao mecanismo futuro. A exigência vem de [AGENTS/D-12](../../../07_agents/AGENTS.md): T3 exige “revisão explícita da SPEC pelo usuário antes do BUILD”. Nenhuma resposta foi presumida.
