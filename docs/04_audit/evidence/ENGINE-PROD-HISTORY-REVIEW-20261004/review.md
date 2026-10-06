# Revisões independentes de segurança — GREEN

Quatro revisões independentes pedidas pelo programa GREEN, todas com veredito
`ACCEPT`: histórico Git (este documento), código atual
([source-secrets-review-summary.json](source-secrets-review-summary.json)),
alertas CodeQL ativos e guard histórico
([codeql-rate-limit-review.md](codeql-rate-limit-review.md)).

## Segredos no histórico Git

Data: 04/10/2026. Revisor: Claude Code, independente do Builder/Lead GREEN do
Codex (nenhuma justificativa do Builder usada como entrada). Objeto:
`green-20261004/git-history-r2-*`, estado anterior
`I0_REVIEW_REQUIRED_NOT_PASS` (autoinspeção não vale como revisão
independente, SPEC 0180). Resumo estruturado em
[review-summary.json](review-summary.json). Nenhum valor bruto foi gravado.

### Método

1. Hashes dos cinco artefatos do objeto conferidos contra o manifesto: MATCH.
2. Novo scan próprio: clone bare do repositório no HEAD
   `e653cd37f19b8efd868b19fc0ac723edb11cbf49`, gitleaks 8.28.0 com regras
   padrão embutidas, sem arquivo de ignore nem comentários de allow. Relatório
   não mascarado mantido só em diretório privado 0700/0600 e apagado ao final.
3. Comparação por fingerprint (commit, arquivo, regra, linha) com o objeto.
4. Classificação própria de cada valor, imprimindo apenas formato mascarado,
   caminho e regra; provas diretas para cada classe.

### Resultado

- 6.693 achados, todos `generic-api-key`; fingerprints idênticos aos do
  objeto (0 só no novo scan, 0 só no objeto).
- 6.572 são SHA-256 de arquivos em manifestos de hash (`"<arquivo>":
  "<sha256>"`). Prova por amostra (300, seed 7): 284 recalculam exatamente o
  SHA-256 do arquivo nomeado no commit ou no pai; 16 são de arquivos não
  commitados/modificados no momento do snapshot, com a mesma estrutura.
- 75 são `token` de revisão do produto (8 valores distintos), gerados por
  `revisionToken()` = `id[0:12]-r<revisão>-sha256[0:12]`: identificador
  determinístico de confirmação, não credencial.
- 14 contêm marcadores sintéticos explícitos; 23 são chaves de idempotência ou
  de operação em testes; 3 são segredos de teste nomeados como sintéticos; 2 são
  prosa de documentação.
- 4 são `.env.example` com `SHIFT_WEBHOOK_SECRET`, `WAHA_API_KEY` e
  `EVOLUTION_API_KEY` vazios em todo commit; a regra capturou a linha seguinte.

### Veredito

`ACCEPT_NO_REAL_SECRETS`: nenhum segredo real no histórico até `e653cd3`.
Não exige reescrita de histórico nem rotação de credencial. Recomendação: o
scanner de CI deve tratar manifestos de hash e `.env.example` vazio por regra
de caminho/formato revisada, sem exceção ampla, para o sinal útil não ficar
afogado em 6.572 digests.
