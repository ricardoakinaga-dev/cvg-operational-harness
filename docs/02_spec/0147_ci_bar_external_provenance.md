# SPEC-PR009-PROV-001 — âncora externa para a prova do ci-bar

- Trilha: **T3**, pois altera o contrato de evidência e o workflow de
  segurança. Estado: `APPROVED_FOR_BUILD` pelo usuário em 27/09/2026.
  A aprovação autoriza BUILD e testes locais, sem autorizar push, deploy,
  certificação de candidato integrado ou promoção.
- Task: [PR-009-PROV](../03_build/0356_production_backlog_2026-09-26.md).
  Origem: crítica I5 da
  [SPEC-PR009-003](0145_e2e_junit_json_run_binding.md) e
  [prova local r3](../04_audit/evidence/PR009-20260927-r3/proof.json).

## Fronteira observada

O `verify.yml` executa os gates em um job, guarda estado, logs e snapshots
em `RUNNER_TEMP/cvg-ci/...` e só envia o diretório ao GitHub após a
finalização. O `CI_RUN_ID` deriva de `github.run_id` e `github.run_attempt`.
O finalizador local já recusa hashes E2E ausentes, divergência entre
JSON/JUnit/log e mistura de campos `runId` entre gates. Entretanto, todos os
hashes esperados ficam no mesmo diretório mutável dos arquivos medidos.
Quem puder trocar **juntos** estado, log e relatórios depois do gate pode
recalcular esses hashes sem que a finalização local prove o conteúdo
original. Isso não significa que houve adulteração no run r3; é um limite
do mecanismo de evidência. O objetivo desta task é detectar troca após o
gate por alguém que escreve nesse diretório, sem supor comprometimento do
runner, do serviço GitHub Actions ou do próprio código do gate.

## Desenho aprovado para BUILD

1. Ao terminar cada gate sensível, emitir um selo canônico com `gateId`,
   `github.run_id`, tentativa, `GITHUB_SHA`, `candidateId`, status, hash do
   log e hashes dos snapshots. Para E2E, incluir `executionId`, inventário
   e totais. O selo deve sair do diretório mutável como output do passo
   correspondente (`GITHUB_OUTPUT`) e ser referenciado pelo contexto
   `steps.<id>.outputs` na finalização. O passo falha se não conseguir
   emitir o selo ou se o gate falhar. Distinguir em formato e veredito uma
   prova local sem selo de uma prova remota selada.
2. Na finalização remota, conferir o `CI_RUN_ID` fornecido pelo runner,
   `GITHUB_SHA`, cada selo exigido, os bytes atuais de log/snapshots e o
   estado. O manifesto também inventaria caminho, tamanho e SHA-256 de cada
   arquivo bruto enviado; o job independente rehasha o download e recusa
   arquivo faltante, extra ou alterado. Selo ausente, de outra tentativa, outro commit, outro candidato,
   UUID trocado ou hash divergente implica FAIL. Não aceitar selo lido de
   arquivo do próprio diretório de artefatos. A lista de gates e campos
   cobertos deve ser fixa e versionada, sem depender do estado recebido.
3. Após finalização PASS e com permissões mínimas, criar uma atestação de
   proveniência para o manifesto final e, quando houver imagem publicável,
   para o digest OCI. Um verificador **fora do job produtor** compara
   sujeito/digest, repositório, workflow, SHA, tentativa e resultado remoto
   ao candidato que se pretende promover. A atestação complementa os selos
   dos gates; não prova sozinha que os testes foram executados corretamente.
4. Preservar os artefatos brutos e o vínculo com o check run remoto.
   A política anterior de 7 dias do upload não basta como única
   evidência de uma decisão de release posterior: definir retenção,
   exportação e revogação na revisão de segurança. Não embutir segredo de
   assinatura em código, artefato ou imagem.
5. PR de fork sem permissão de atestação falha explicitamente no workflow;
   não produz veredito de proveniência PASS. Uma futura trilha confiável
   de reexecução pode substituir essa restrição após revisão própria.

O BUILD local mantém um job final `Provenance policy` que exige `verify`,
`attest` e `provenance-verify` em `success`; esse check precisa integrar a
proteção de `main` para bloquear merge. A inspeção read-only do GitHub em
27/09/2026 retornou branch protection 404 e rulesets vazios. O runtime
image foi construído localmente, sem digest de registro publicável; a
atestação de OCI depende da futura publicação e de verificação fora do
job produtor. Nem o check remoto nem essa publicação foram executados
por este BUILD local.

O repositório GitHub consultado em 27/09/2026 está público, condição
compatível com o serviço de atestação descrito pela
[documentação oficial](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
O GitHub documenta outputs de passos em
[workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
e atestação verificável por `gh attestation verify` na mesma fonte. O
[upload-artifact](https://github.com/actions/upload-artifact/blob/main/README.md)
documenta o digest do arquivo enviado e a imutabilidade dos artefatos v4;
esse digest é do **arquivo de upload**, e não substitui hashes de cada
relatório ou a identidade da execução.

## Critérios de aceite e negativos

- Teste do verificador do selo com uma prova íntegra; depois de selar,
  trocar JSON+JUnit+log+estado de forma coerente e exigir FAIL. Cobrir
  troca isolada de um arquivo, mapas vazios/parciais, replay de outro run,
  outra tentativa, outro SHA, outro candidato e selo ausente.
- Workflow de PR e de `main` com Node 22 e PostgreSQL executa todos os
  gates aplicáveis, gera selo fora do diretório mutável, finaliza PASS,
  publica manifesto e atestação; Verify e Security verdes no **mesmo SHA**.
  O teste negativo de CI deve adulterar uma cópia controlada após o gate,
  sem escrever em produção nem em evidências históricas.
- Verificação independente da atestação e do digest da imagem candidata
  antes da decisão de release; registrar URL/ID do run, bundle, SHA e
  configuração. Falhar se a atestação não corresponder ao artefato ou ao
  repositório/workflow esperado.
- Revisão explícita desta SPEC pelo usuário registrada em 27/09/2026.
  O workflow proposto retém artefato sintético e bundle por 90 dias; DPO e
  segurança ainda devem validar retenção/exportação antes de uma decisão
  de release. A decisão humana T4 de release
  e as 13 condições de GO do [plano 0354](../03_build/0354_production_executive_plan_2026-09-26.md)
  permanecem separadas.

## Limites declarados

Um selo do runner protege contra mutação **posterior** do diretório de
artefatos. Ele não atesta a honestidade de código executado no gate nem
resiste ao comprometimento do runner ou do serviço GitHub. Essa ameaça
exige controles adicionais de isolamento, revisão de workflow e confiança
na plataforma de CI. Nenhuma prova local r3 é promovida retroativamente a
prova selada.
