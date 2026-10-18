# SPEC 0209 — Catálogo de contratos da referência PARE100

- Task: P100-003, tooling T1/T2, autorizada pela execução atual do plano. BUILD_LOCAL_AUTHORIZED_T2; não altera API, event store ou controles do motor.
- Referência somente leitura: /home/ricardo/deepseek-harness-session-fixes, commit768fb1f3d3dcf9a16659ee354e927d05475f22dd, CLI0.2.0-rc.1. Não ler ~/.dsh, sessões reais, .env, credenciais ou node_modules da referência.

## Contrato

Criar scripts/reference-contract-catalog.mjs com CLI e funções importáveis para coletar manifests, exports, métodos/interfaces/configs/eventos declarados via AST TypeScript, dados dos catálogos gerados de tools/sessão/config/perfis e apps/Python/native. Excluir código de teste, builds/lib/dist/vendor binário; rastrear utility/test-support como closure de infraestrutura, sem apagá-los do escopo.

Cada entrada tem ID estável, kind, package, source path relativo, SHA-256, declaração/forma de contrato sem corpo de implementação e owner task obtido do capability-family-map inicial. Extrair somente dados de contrato; não importar/vendorizar/copiar implementação DeepSeek. A coleta nunca executa plugin, comando de modelo ou script de instalação da referência.

Dados que dependam de execução ou não possam ser extraídos estaticamente ficam UNKNOWN com reason e fonte, nunca vazios considerados PASS. Nenhum requisito de paridade é PASS porque foi catalogado. A verificação do root/commit/version e dos paths/symlinks deve impedir coleta fora da referência declarada e drift silencioso.

Exportar comparador de freeze que rejeite referência alterada, IDs duplicados, fonte ausente e remoção de requisito. IDs não podem depender da ordem de diretórios nem de linhas; ordenar tudo para output reproduzível. Hashes de fonte mantêm sensibilidade a mudança relevante.

## Validação e ownership

Builder C: scripts/reference-contract-catalog.mjs, tests/reference-contract-catalog.test.js e evidence/reference própria no worktree. Tests com árvore fixture sintética exercitam AST/signatures, JSON schema, corpo não copiado, determinismo, source missing/drift, symlink/fora da raiz, duplicate IDs e caso conhecido-bom. Depois executar coleta no repo pinado e devolver JSON com hashes e limitações.

Lead congela matriz/barra e revê cobertura semântica/jornadas; o catálogo não autoriza diminuir denominador. Pronto: output reprodutível, owners em todos os 318 manifests/55 famílias e surfaces adicionais, guard conhecido-ruim rejeitado, nenhuma leitura sensível ou alteração da referência, crítica I1. A revisão semântica integral P100-003 continua exigida além do índice automático.
