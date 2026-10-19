# Reparo agrupado da qualificação da consolidação

Task T2, autorizada pelo pedido de integrar somente melhorias e pelos critérios MC02/03. A barra hospedada 39177487433 da candidata a46687c3 terminou FAIL: 5 arquivos/44 testes e uma suíte de setup, 5608PASS/15não executados por beforeAll falho. Nenhum merge concedido. Fonte/gates congelados até reparo.

HOW: (A) corrigir portabilidade dos perfis sintéticos de referência/compilação em host instalado, mantendo pins/checagens físicas e falha fechada; (B) integrar enforcement de cobertura já especificado e exigido pelo teste ci-coverage-defaults, sem alterar identidade/escopo da barra/pisos; (C) aceitar na verificação de configuração somente fingerprints exatos válidos dos dois tipos de detecção histórica já triada. Nenhuma regex ampla de segredo ou relaxamento de scanner. Não excluir/skip testes.

Ownership: somente stable-candidate, Lead mantém scripts/ci-bar.mjs, tests/security-scan-config.test.js e própria evidência; lane A somente tests/b6-0234-reference-recipe.test.js, tests/b6-0236-compiled-provenance.test.js, tests/b6-0236-semantic-engine.test.js. Dependência adicional de fixture deve ser reclamada antes de editar. Sem fontes de pares/root; sem branch nova/PG/Docker/provider/dado real. Backup/bundles já verificados. Local certify a466 interrompido como superseded após CI completo FAIL, sem certificado transferido.

Aceite: causas comprovadas em log; todos arquivos anteriormente falhos passam com configuração original em host/ambiente privado; revisão fresca do delta sem obrigatórios; gates globais e CI na nova árvore antes de merge. Preservar 100% por arquivo e pisos agregados; nenhuma herança de certificado.
