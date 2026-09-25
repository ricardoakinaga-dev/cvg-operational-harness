# REM21-002 — SPEC

## Contrato computado

Adicionar `scripts/lib/finding-governance.mjs` com funções puras e uma função
de filesystem explícita para:

- localizar a fonte A21 relativa à raiz do repositório;
- calcular SHA-256 e localizadores de linha;
- parsear apenas a lista enumerada e exigir os 26 IDs sem duplicata;
- normalizar prioridade/seção/título e produzir um finding canônico;
- carregar uma closure registry opcional somente se ela estiver ligada ao mesmo
  `candidateId`, `runId`, `sourceSha256` e a uma evidência local cujo hash bata;
- calcular scores a partir de totais/fechamentos;
- produzir `source`, `findings`, `scores`, `candidateId`, `runId`, `observedAt`
  e `freshness`.

O parser deve aceitar títulos cujo texto continue em linhas seguintes e deve
falhar se a linha inicial da entrada não tiver ID, prioridade/seção e título.

## Integração do certifier

`scripts/phase10-certify.mjs` deve, depois de criar o candidato e conhecer o
`runId`, chamar a governança computada, escrever `certification/findings.json`
como saída derivada e passar seus findings/scores a `computeDecision`. O arquivo
não é input de autoridade; é um artefato materializado para inspeção e hash.

## Integração do verifier

`scripts/phase10-verify.mjs` deve validar que:

1. `certification/findings.json` existe e possui o candidato/run da execução;
2. seu hash de fonte e metadados correspondem à fonte viva;
3. sua projeção canônica é igual à rederivação local;
4. `phase10-result.json` contém a mesma projeção e os mesmos scores;
5. a decisão é recalculada sobre a projeção computada.

Falhas recebem códigos estáveis com prefixo `findings_`, para facilitar
diagnóstico e testes negativos.

## Testes

Criar `tests/rem21-findings.test.ts` cobrindo fonte real, fonte ausente,
duplicata/falta, source hash, candidate/run, closure inválida, score adulterado,
finding manual omitindo P0/P1 e stale/freshness. O teste deve usar fixtures
temporárias e não escrever nos artefatos de certificação existentes.

## Compatibilidade e segurança

- Manter `P0`, `P1` e `P2` no `Phase10ResultSchema`; P3 é preservado no bloco
  computado e não pode reduzir o blocker calculus.
- Não aceitar `riskAccepted` manual para remover um P0/P1.
- Toda saída é sintética e local; não há rede, segredo ou dado de paciente.
- Os arquivos de certificação gerados continuam fora do candidate scope, então a
  prova de frescor deve usar a fonte incluída no candidato, não o próprio output.

## Gate SPEC

Este SPEC fica limitado ao REM21-002 e será implementado somente dentro do
`G21-1` já registrado. A aprovação de código real, fechamento de findings e
qualquer promoção continuam dependentes dos gates posteriores e de revisão
humana quando aplicável.
