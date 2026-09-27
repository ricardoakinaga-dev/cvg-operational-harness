# SPEC-PR009-003 — vínculo da execução E2E entre JSON e JUnit

- Estado: `BUILD_VERIFIED_LOCAL / EXTERNAL_PROVENANCE_PENDING / CERTIFICATION_PENDING`. Task: PR-009, fatia 3, em
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

## Crítica independente I2 e correção da fatia

- I2 retornou `REJECT` sobre `6bc3bfc`/`725a1b3`: o par estava coerente,
  mas a verificação não comparava `executionId` ao log, o certificado
  não revalidava os bytes que registrava, e o ci-bar verificava arquivos
  vivos após copiar snapshots. A troca conjunta dos IDs em JSON/JUnit
  foi reproduzida em memória pelo crítico. O veredito não foi promovido a
  aceite pela prova E2E anterior.
- Correção: o log do wrapper contém exatamente um comprovante de tentativa;
  resultado do gate e artefatos do manifesto carregam o mesmo
  `executionId`. O verificador compara os três vínculos. `certify` valida
  os buffers capturados antes de atribuir PASS e registra hashes desses
  mesmos buffers; uma checagem final rejeita troca posterior nos destinos.
  O ci-bar valida os **snapshots** copiados, guarda seus hashes/UUID no estado
  e exige os mesmos hashes na finalização.
- Regressões: C30–C32 do self-test PASS, incluindo substituição conjunta
  de JSON/JUnit com hashes atualizados e log original; testes focados
  12/12 PASS. Node 22.23.2: `typecheck`, `lint`, `format:check`,
  `npm test` 299 arquivos/2.178 PASS (20 arquivos/146 testes pulados sem
  banco) e `test:postgres` 35/258 PASS em banco próprio descartável.
  Nova prova E2E/ci-bar no código corrigido concluída abaixo; reavaliação I2
  e certificação integrada continuam pendentes após PR-L04.

## Prova I2 do ci-bar em worktree isolado

- Commit `1413809`, Node 22.23.2, `npm ci`, `build:runtime`, portas
  3209/4183, `CI_RUN_ID=run-pr009-i2-isolated-20260927`, candidato
  `16136c5552f02b072c7de56ff68faaac785cc4f014af7537950f6b8a5397d036`.
  `ci-bar init` e `ci-bar gate e2e` executados: 12/12 Chromium PASS, 0
  skipped/unexpected/flaky, `executionId=2309ccef-a58c-4dbd-b590-1ac47ea6c00d`,
  `outputFailures=[]`. O estado do gate guardou os dois hashes dos snapshots
  e o UUID. [Prova/hash](../04_audit/evidence/PR009-20260927-r2/proof.json),
  [registro do gate](../04_audit/evidence/PR009-20260927-r2/e2e-gate-entry.json),
  [log bruto comprimido](../04_audit/evidence/PR009-20260927-r2/e2e.log.gz),
  [JSON](../04_audit/evidence/PR009-20260927-r2/e2e-test-report.json) e
  [JUnit](../04_audit/evidence/PR009-20260927-r2/playwright-results.xml).
- Negativo da finalização: um newline foi acrescentado somente ao snapshot
  XML de uma cópia do diretório de artefatos; `ci-bar finalize` saiu com 1
  e registrou `e2e_snapshot_hash_mismatch:playwright-results.xml`. As outras
  falhas nessa execução são esperadas, porque os demais gates do ci-bar não
  foram executados no isolamento. O par arquivado foi revalidado após a
  cópia: hashes, log, gate e relatórios apontam o mesmo UUID/12 testes.
- Limite: esta prova cobre o gate E2E e o caso negativo da finalização,
  ainda não é o certificado completo nem a aprovação I2 da correção.

## Críticas I3–I5 e candidato final local

- I3 rejeitou a finalização porque um mapa de hashes E2E vazio escapava do
  loop. O finalizador agora exige exatamente os dois caminhos e hashes de
  64 caracteres. A regressão executa o subprocesso com mapas vazio, parcial
  e extra; todos falham.
- I4 confirmou essa correção, mas rejeitou a troca coerente de JSON/JUnit e
  do estado quando o log original não era relido. A finalização agora
  confere o hash do log, lê seu comprovante e compara o UUID ao par e ao
  estado. A regressão troca ambos os relatórios e seus hashes, conserva o
  log e verifica a rejeição. Também rejeita adulteração isolada do log.
- I5 encontrou mistura possível de gates de runs distintos. A finalização
  exige `runId`, `candidateId`, Node, exit 0 e `outputFailures=[]` em cada
  gate executado; há regressão com gate `typecheck` de outro run. I5
  **manteve REJECT para proveniência adversarial**: um agente com escrita
  sobre todo o diretório de artefatos pode trocar coerentemente estado, log
  e relatórios e recalcular os hashes locais. Uma âncora fora desse
  diretório, vinculada ao job de CI, requer desenho e revisão de segurança
  próprios. Nenhum certificado ou status TripleAAA é inferido desta fatia.
- Candidato isolado `2a11435`, Node 22.23.2, `runId=run-pr008-final-20260927`,
  `candidateId=0706ee5be9efbf6c30a59bad8f4ce6b3caf75f777df4949d3179cad8c46e1f64`:
  `ci-bar gate e2e` PASS, Chromium 12/12, 0 skip/unexpected/flaky,
  `executionId=eb8a8c2c-a9ec-441f-a485-3d43157096a7`. O JSON, JUnit,
  log e registro do gate estão em [prova r3](../04_audit/evidence/PR009-20260927-r3/proof.json)
  com hashes revalidados após a cópia. O `ci-bar finalize` parcial retornou
  FAIL pelos 80 itens de outros gates ausentes, sem falha E2E ou de imagem.
- No código final: testes focados 16/16, `typecheck`, lint, formato, links,
  build e auditoria npm PASS; `npm test` 300 arquivos/2.182 PASS e 146 skips
  sem banco; `test:postgres` em banco descartável 35 arquivos/258 PASS.
  Certificação completa e CI remoto no SHA integrado continuam pendentes,
  além da âncora independente e das condições de produção.
