# Resultado da tentativa C1 — interrompida no freeze do candidato

Data: 2026-09-24. Task: `A24-03-C1`. Resultado: `BLOCKED / CANDIDATE_NOT_FROZEN`.

## Decisão e pré-condições

- Decisão recebida: o usuário respondeu “aprovo este gate”; vinculada ao gate corrente M07-S1-R1-C1. SHA-256 do pedido: `9d865f7db78b479dacaf69ca2de7dffcc03892eff061dd49ca90ec2035eb83f1`; SHA-256 do preview: `9d7fc894b728967aaa4f0949bc5dc8ae466d31ecc616fe9a902a58859ebb0c17`.
- `node --version`: `v22.23.2`, exit 0. `node -p "require('typescript').version"`: `6.0.3`, exit 0.
- A verificação do candidato R1 passou antes da edição, fingerprint `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`, exit 0. A pasta C1 estava ausente antes de ser criada.
- `npm --version`: `10.9.8`. Snapshot do único fixture autorizado: SHA-256 `264651255ebc7169dc03935a0981aff0b8ae229b9e3e26013b89ddfd0e8cef66`.

## Mudança e falha observada

A correção do fixture foi aplicada somente em `packages/conversation/src/__tests__/postgres-store.unit.test.ts`, conforme o preview aprovado: sessão sintética agora contém `pendingProposal` e `pendingApproval` ligados ao mesmo ID, hash, chave operacional e execution ID; o caso negativo de aprovação divergente foi preservado.

O comando autorizado de freeze do candidato C1 terminou com exit `64`. O stderr preservado informa: `workspace-dependency-audit: output must be a JSON or Markdown file in a repository M07 evidence directory`. A inspeção estática de `scripts/workspace-dependency-audit.mjs:1835-1838` mostra a causa observada: o validador permite somente os diretórios `M07-BUILD-S1` e `M07-S1-R1`, enquanto o gate exige escrever em `M07-S1-R1-C1`. A condição do gate e o allowlist implementado são incompatíveis.

Uma inspeção estática adicional mostra outra incompatibilidade, ainda não executada: `validateExecutionCandidate` em `scripts/workspace-dependency-audit.mjs:1421-1423` exige que o argumento e a policy usem `M07-S1-R1/npm-version.txt`; o gate C1 exige `M07-S1-R1-C1/npm-version.txt`. Depois de corrigir a primeira validação, o candidate C1 também seria rejeitado pela amarração do arquivo npm. Isso é uma previsão direta do código atual, não um resultado de execução.

## Estado dos checks

- O candidato C1 não foi congelado; nenhum manifesto/report C1 foi produzido por este comando.
- Inventário, comparação de fingerprints, teste focal, suíte, typecheck, lint, coverage, pós-check e I1 não foram executados, pois dependem de um candidato C1 válido.
- M07-S1 permanece `FAIL / OPEN`; I1 permanece `UNAVAILABLE`; produção permanece `NO_GO`. Nenhum serviço, banco, rede externa, dado real ou ação sensível foi usado.
- Não houve mudança no adapter de produção, em manifests, CI, thresholds ou outros arquivos de código. A correção do fixture e a saída parcial desta tentativa foram preservadas.

## Próxima ação

Próxima decisão: aprovar ou corrigir o [gate C1E](output-path-correction-gate.md), SHA-256 `75b6307384074660bde873ca4aa95bfedfb52c1f58d2448ad227e96e87ad34cc`, e seu [preview](output-path-correction-preview.md), SHA-256 `3c4b80ad07a1bf59cce8279b40e916140c908b5d7f7a518caf1d0362e57100ec`. O novo gate alinha os allowlists de diretório de saída e arquivo npm candidate-bound à pasta de uso único exigida, com regressões no scanner. A tentativa C1 atual permanece imutável. Nenhum check posterior C1 ou mudança no scanner será executado sem o novo gate; após ele, será necessário um diretório de evidência de uso único e um novo candidato.

## Proveniência

Ver `command-records.json`, `candidate-freeze.stderr.log`, `npm-version.txt`, `rollback-baseline.sha256` e o snapshot em `rollback-baseline/`. Os comandos de preflight executados antes de criar a pasta foram preservados em `command-records.json`; o executor não forneceu timestamps de início para esses quatro comandos, portanto os campos correspondentes permanecem `null` em vez de reconstruídos.
