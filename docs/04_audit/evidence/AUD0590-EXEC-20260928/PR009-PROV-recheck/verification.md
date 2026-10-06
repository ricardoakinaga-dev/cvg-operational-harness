# PR-009-PROV — validação local focal

Data: 29/09/2026, America/Sao_Paulo. Claim: PR-009-PROV-REVALIDATE-001.

## Fonte e execução

- HEAD observado: 4ae40d69b77c5b422a6302efac5cfcee005d6f1b. O checkout compartilhado tinha outras alterações fora desta fatia; os seis arquivos de fonte deste claim estavam limpos antes da execução.
- Node 22.23.2; npm 10.9.8.
- Comando: npm test -- --run tests/ci-bar-provenance.test.js tests/ci-workflow-contract.test.js, invocado com Node 22.
- Resultado: 2 arquivos e 16 testes aprovados; saída integral em test.log.
- Nenhum arquivo de produto, workflow, configuração ou lockfile foi alterado.

## Resultado da leitura estática

O contrato inspecionado emite selos por saída de passo, vincula gates ao run/tentativa/SHA/candidato e hashes de log/snapshots, e finaliza um inventário de artefatos. A verificação de proveniência baixa o manifesto em job separado, compara o digest enviado pelo job produtor, confere identidade do runner, inventário fechado de gates/arquivos, hashes e a atestação; a política final falha se verify, attest ou provenance-verify falhar e recusa PRs de fork.

Os 16 testes cobrem selos válidos e mutações coerentes/isoladas, replay de outra execução, mapas de passos incompletos, gates ausentes/duplicados, identidade e mutação de inventário. Isso é evidência local do contrato; não prova que GitHub Actions executou esses caminhos numa run real.

## Limites

Não houve workflow remoto, atestação emitida/verificada, proteção de branch, publicação de imagem ou digest OCI nesta execução. A implementação não foi certificada contra comprometimento do runner nem contra mudanças maliciosas no próprio código de CI. A evidência anterior de PR-009 continua local. Produção permanece NO_GO.
