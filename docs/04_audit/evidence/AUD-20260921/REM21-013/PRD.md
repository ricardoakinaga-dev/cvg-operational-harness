# REM21-013 — PRD

## Problema

O gate de mutação cobria somente a matemática de coverage. Regressões
semânticas em identidade confiável, replay, política, egress SSRF, aprovação,
rate limiting e binding de persistência poderiam sobreviver sem bloquear a
barra, apesar de serem controles críticos do harness.

## Resultado desejado

Um guard de mutação incremental, explícito e auditável deve selecionar
mutantes por domínio de risco, executar os testes focados correspondentes e
falhar fechadamente quando o contrato ou a prova não for íntegra.

## Requisitos funcionais

1. O manifest deve enumerar mutantes com `id`, `domain`, `source`, selector
   `from`, replacement `to`, `sourceSha256`, `testFiles` ou driver e
   `budgetMs`.
2. Os domínios `identity`, `policy`, `ssrf`, `replay`, `approval`,
   `rate-limiter` e `persistence` devem estar presentes; coverage continua
   incluído como regressão histórica.
3. Cada selector deve existir exatamente uma vez e o hash declarado da fonte
   deve coincidir com a fonte local antes da execução.
4. Cada mutante deve resultar em `KILLED`, `SURVIVED`, `TIMEOUT` ou `ERROR`;
   qualquer `SURVIVED`, `TIMEOUT` ou `ERROR` torna o gate `FAIL`.
5. O relatório deve registrar manifest hash, source hash, domínio, budget,
   status, exit code, duração, saída limitada e `runId`/`candidateId`.
6. A execução deve ser isolada em cópia temporária, sem alterar o worktree e
   sem propagar conexão PostgreSQL para os testes focados.
7. A alteração do manifest deve ser detectável por digest e por teste negativo;
   manifest inválido não pode executar mutantes.

## Requisitos não funcionais

- determinismo: uma mutação por vez, testes focados sem paralelismo de arquivos;
- segurança: somente fixtures sintéticas, sem produção ou serviços externos;
- operabilidade: budget explícito por mutante e artefato JSON consumível pelo
  certifier existente;
- compatibilidade: `npm run mutation:guard` permanece o entrypoint da barra.

## Critérios de aceitação

- RED reproduzível antes do BUILD para o contrato do manifest;
- `tests/mutation-guard.test.js` passa com validação positiva e negativos de
  selector, source drift, budget, domínio obrigatório e digest alterado;
- os sete domínios e os três mutantes de coverage são executados;
- todos os mutantes do conjunto selecionado são `KILLED`, sem timeout/erro;
- um report com manifest/source/run/candidate bindings é gerado;
- typecheck, lint, formato, testes focados e `ci:bar:contract` passam;
- nenhuma conclusão de produção, I1, freeze ou GO é inferida.
