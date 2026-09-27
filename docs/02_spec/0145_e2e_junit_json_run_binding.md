# SPEC-PR009-003 — vínculo da execução E2E entre JSON e JUnit

- Estado: `E2E_VERIFIED_ISOLATED / CERTIFICATION_PENDING_INTEGRATED`. Task: PR-009, fatia 3, em
  [0356](../03_build/0356_production_backlog_2026-09-26.md). Sem mudança de API,
  schema, identidade ou efeito externo. Gate T2 em
  [AGENTS](../07_agents/AGENTS.md).
- Recon: o JSON `certification/e2e-test-report.json` e
  `playwright-results.xml` atuais registram horários diferentes; ambos têm
  12 testes, mas não guardam `runId` e `candidateId`. Quando o gate define
  `PLAYWRIGHT_JSON_OUTPUT_NAME`, a configuração omite JUnit. O ci-bar e o
  certificado atestam apenas o JSON e o verificador infere E2E do resumo
  textual. O fixture positivo atual aceita `{}` como JSON. A workflow executa
  E2E isolado e novamente dentro de `certify`; um `runId` comum entre essas
  invocações não identifica uma tentativa única.

## Contrato de BUILD

1. O gate E2E certificado gera JSON e JUnit no **mesmo processo Playwright**.
   Antes da invocação, remove os dois destinos. Um identificador único de
   tentativa (`executionId`) é criado por invocação; `runId` e `candidateId`
   vêm do ci-bar/certificação e são obrigatórios. Os três identificadores
   aparecem dentro de cada arquivo. A execução direta de desenvolvimento pode
   conservar a saída atual, sem se apresentar como evidência certificada.
2. O mesmo comando produz ambos os arquivos frescos, não vazios e íntegros.
   Falha se qualquer arquivo estiver ausente, malformado, antigo ou se os
   identificadores divergirem. Falha também para teste `failed`, `skipped`,
   `interrupted`, `timedOut`, `unexpected` ou retry que masque falha. Não
   codificar a contagem atual de 12.
3. Comparar o inventário de casos e os totais do JSON e do JUnit entre si e
   com o resumo do log. Conferir identificadores internos contra
   `phase10-result`, manifesto e estado do ci-bar. Cada artefato entra na
   matriz de evidências, nos snapshots do ci-bar e nos hashes do manifesto.
   O par válido da **invocação interna ao `certify`** é o que qualifica o
   certificado; o gate E2E anterior da workflow é apenas prova separada.
4. Manter fail closed: logs com exit 0 não compensam relatório inválido;
   metadados externos não substituem os identificadores internos. Os arquivos
   históricos versionados não são reescritos para simular nova execução.

## Gate e critério de pronto

- Casos focados: par válido; ID ausente/trocado em cada formato; JSON novo com
  XML antigo; artefato ausente, vazio ou malformado; totais/inventários
  divergentes; falha, skip e retry inesperado. Estender o self-test do
  verificador para rejeitar o fixture `{}` e os negativos.
- Em Node 22, `typecheck`, `lint`, `npm test`, `test:postgres` e E2E verdes.
  `ci-bar` e `certification:verify` devem rejeitar pares adulterados; a
  certificação final exige claim de artefatos, worktree limpo e integração da
  PR-L04. Registrar resultados nesta SPEC, no runtime, log e backlog.
- Este gate não autoriza produção: as 13 condições de GO de
  [0354](../03_build/0354_production_executive_plan_2026-09-26.md) e a decisão
  humana de release continuam necessárias.

## Execução de 27/09/2026

- Código: `run-e2e-evidence.mjs` remove os destinos, cria `executionId`,
  executa um Playwright com JSON e JUnit e valida o par. O ci-bar e o
  certificado incluem ambos os arquivos; o verificador lê os IDs internos,
  inventário e totais. A prova de browser sem `executionId` não regrava o
  JUnit vinculado.
- Node 22.23.2: testes focados 18/18 PASS; `typecheck`, `lint`,
  `format:check`, `docs:check-links` PASS; self-test do verificador PASS,
  inclusive JSON vazio e JUnit de outra tentativa. `npm test`: 299 arquivos,
  2.177 testes PASS, 20 arquivos/146 testes pulados sem PostgreSQL;
  `test:postgres` em banco descartável próprio: 35 arquivos/258 testes PASS.
  A primeira suíte geral teve uma falha de teste documental herdado da
  rotação PR-005; o teste foi reconciliado com o arquivo histórico, e a
  segunda suíte passou. O banco foi removido e o artefato de self-test foi
  restaurado aos bytes do HEAD.
- E2E real isolado no commit `6bc3bfc`: worktree detached, `npm ci`
  (`--ignore-scripts`) e `build:runtime`, portas próprias 3209/4183, Node
  22.23.2 e Playwright 1.59.1. Primeira tentativa falhou porque os pacotes
  locais ainda não tinham `dist/`; o erro Vite de `@cvg/shared` foi
  diagnosticado nos snapshots, os servidores próprios foram encerrados e o
  runtime compilado antes da repetição. Segunda tentativa: 12/12 PASS,
  zero skip/erro/flake, `runId=run-pr009-isolated-20260927`, candidato
  `2acfa4cb36fb76a04a13cc5bed7c955bade1cf0e1e75fde66dc858d1f977db24`,
  `executionId=f75f3b25-3545-413d-bb5a-6adb530dc095`. O wrapper validou
  os IDs internos e o inventário/totais do par. [Prova integral e hashes](../04_audit/evidence/PR009-20260927/proof.json),
  [JSON](../04_audit/evidence/PR009-20260927/e2e-test-report.json) e
  [JUnit](../04_audit/evidence/PR009-20260927/playwright-results.xml).
- Pendente: certificação no candidato integrado após a PR-L04 liberar o
  catálogo de skips e os artefatos compartilhados. O E2E isolado prova esta
  fatia, mas não substitui o certificado nem o CI remoto do SHA integrado.
