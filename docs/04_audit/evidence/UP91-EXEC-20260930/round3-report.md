# UP91 — relatório da rodada 3

O programa permanece **em implementação e sem autorização para produção**. Esta rodada acrescentou oito regressões públicas de recuperação, executou os gates completos no candidato sintético e concluiu uma correção documental de evidências. A certificação global falhou. Não há resultado AAA, certificado novo ou encerramento do programa.

O escopo continua sendo os **52 cartões UP91, 83 tarefas de origem, 13 gates de produção e a regressão CVG T2: 149 critérios**. [A comparação dos campos canônicos](round3-program-scope-current.json) preserva aceites, prioridades, dependências e estados dos cartões; as notas de execução mudam conforme a evidência.

## Implementação e revisão dos testes

A subtask UP91-004-R3, registrada sob [SPEC0172](../../../02_spec/0172_runtime_recovery_boundary_regressions.md) antes do BUILD, acrescentou oito testes em `runtime-recovery-boundary.test.ts`. A implementação do produto, contratos públicos, policy, approval, SQL e limites permaneceram intactos.

Os testes chamam as entradas públicas `runTurn` e `sweepExpiredApprovals`, com policy, gateway, approval store e journal reais em memória. Ferramenta, provider e outbox são fixtures sintéticas contadas. Os casos cobrem:

- Reserva legada sem chave e lease EXECUTING expirado sem prova de ausência do efeito.
- Proposta divergente ou estado UNCERTAIN surgidos entre duas leituras.
- Falha da segunda leitura e disputa real pela reserva de um registro ABANDONED.
- Sweep que libera RESERVED sem efeito, mas conserva EXECUTING como UNCERTAIN.

Os oráculos verificam a ausência de novo efeito, a preservação da identidade e tentativa, a integridade da auditoria e o fechamento de todos os spans. Os controles positivos existentes foram executados junto dos negativos, para detectar uma implementação que simplesmente negasse todas as operações.

A fonte congelada é `71ac93f0025f2e11bf297cfabf5a86a40f763cc5c8cfd8530cb685aecf5d51f8`, idêntica no root e no snapshot. [A crítica independente](recovery-boundary-review.json) retornou **APPROVE_TEST_ONLY** para esse hash. As primeiras execuções passaram: foco **8/8**, corpus **278 testes em 14 arquivos**, zero skips, typecheck do escopo, lint e formato. [Os logs originais e seus hashes](test-builder-r3/proof.json) foram preservados; nenhuma expectativa foi alterada depois das execuções.

Os diagnósticos parciais anteriores tiveram testes aprovados, mas comandos de cobertura com exit 1 porque não atingiam os pisos globais. Foram mantidos como diagnóstico, sem reduzir threshold nem tratá-los como gates aprovados. A subtask R3 segue **VERIFY**; seu aceite local não encerra os cartões 004 ou 021.

## Resultado da certificação completa

Candidato: `867485b8b2f08eef940d2dadcff8d9d3b3a3e01b87db23bb8f9e39859bec9fa0`. Run: `run-867485b8b2f0-munwg9ku`; 1.533 inputs, snapshot dirty. Ambiente próprio: Node 22.23.2, PostgreSQL 16 sintético em loopback 55592 e browsers nas portas 3252/4252, sem retries.

`npm run certify` começou às 09:25:08 UTC e terminou às 09:41:09 UTC: **961,354 segundos, exit 1**. [O registro do comando](checks/round3-native-certify.json) e [o manifesto dos 34 artefatos originais](round3-native-certification/manifest.json) vinculam os bytes executados. Esses resultados descrevem esse candidato, não todo o checkout concorrente posterior.

| Item observado          | Resultado atual                                                     |
| ----------------------- | ------------------------------------------------------------------- |
| Unit                    | 2.494 testes / 330 arquivos aprovados; zero failed, pending ou todo |
| PostgreSQL              | 288 testes / 35 arquivos aprovados; zero failed ou pending          |
| E2E sintético           | 12 esperados; zero skipped, unexpected ou flaky                     |
| Typecheck, lint e build | PASS                                                                |
| Cobertura V8 global     | Statements 92,68%; branches 87,84%; functions 95,11%; lines 93,73%  |
| Kernel crítico          | 511/526 branches, 97,15%; piso de 95% atendido                      |
| Mutação                 | 10/10 KILLED; zero sobreviventes, timeouts ou erros                 |
| Comandos do certifier   | 14 de 16 retornaram exit 0                                          |
| Governança de skips     | FAIL: três source_drift; o gate unit é adjudicado FAIL              |
| Emissão do certificado  | Não ocorreu; Zod rejeitou metrics.unit:null                         |

**14/16 comandos com exit 0 não significa certificação aprovada.** Formato e security falharam. O inventário de skips rejeitou três hashes de fontes, mesmo sem testes pulados. Depois, o parser não reconheceu o resumo Vitest com ANSI e abortou a emissão do resultado. [A reprodução somente leitura](round3-certifier-parser-reproduction.json) retorna null no raw e reconhece 330 arquivos/2.494 testes após remover ANSI para diagnóstico, em acordo com o JSON original. Nenhum certificado FAIL válido novo foi emitido.

A cobertura global de branches passou no piso de 85%, mas a PR-007 exige margem de três pontos, ou **88%**. Faltam **0,16 ponto percentual**. O kernel melhorou de 505 para 511 branches cobertos, mantendo o denominador 526. Seus 97,15% são agregados; o módulo request continua com 6/8 branches, 75%. [A observação dos produtores](round3-coverage-observation.json) mantém esses limites explícitos.

O formato falhou em três documentos preexistentes sob coordenação de outro holder. A [proposta documental de formatação](format-handoff/manifest-current.json) não foi aplicada; a cópia de coordenação está STALE após novos claims. Security manteve três advisories HIGH. SBOM, licenças, worker startup, chaos, load, restore e evals tiveram comandos aprovados nesse ambiente sintético.

[A classificação dos artefatos](round3-artifact-classification.json) identifica REM21-010/011/014 como **STALE**, ligados a outro candidato e run. Não comprovam PITR, telemetria ou browser trusted do candidato atual. Os 15 testes trusted aprovados na rodada 1 são históricos e não foram repetidos nesta rodada.

## Correções documentais concluídas

UP91-002-HYG concluiu somente sua fatia T1. Cinco logs realmente vazios foram catalogados com metadados conhecidos ou `null` quando indisponíveis; os 231 registros centrais anteriores permaneceram intactos. O catálogo passou com **236/236 vazios documentados**.

Sete cópias históricas de documentos foram identificadas como fontes raw `.md.txt`. Seus bytes, hashes e contexto original de links foram preservados no [mapa de localização](round3-raw-document-layout-proof.json). Os documentos vigentes e o checker não mudaram. [A verificação atual](round3-hygiene-final-proof.json) aprovou links globais, higiene e formato dos caminhos próprios. As primeiras falhas auxiliares foram arquivadas antes das correções. O cartão principal 002 continua aberto pelos handoffs e ledgers compartilhados.

A capa nova de revisão humana também revelou uma suposição literal no validador documental. A correção T1 passou a conferir o estado pendente contra o request, o SHA do pacote e os sete módulos normativos. [O primeiro failure](round3-packet-validation-first.json) e [a verificação corrigida](round3-packet-validation-current.json) permanecem registrados. Nenhum byte congelado da revisão mudou; drift de código continua sendo fatal.

## Catálogo e revisão humana pendentes

[O pacote de reconciliação do catálogo](catalog-reconciliation/README.md), com [aceite documental independente](catalog-reconciliation-review.json), confirmou: entrada 004 de 8 para 34 skips condicionais; 008 de 1 para 2; 014 mantém 3. O patch propõe apenas cinco campos, preservando owner, required, gate, expiry e jornadas PR-L04.

O patch **não foi aplicado nem adjudicado**. São necessários coordenação do caminho PR-L04, adjudicação dos owners e SPEC/claim T2 correntes. Seu diagnóstico sem PostgreSQL — 55 aprovados e 39 skipped — não é gate qualificante.

O [lote de sete módulos](spec-packets/human-review-batch-v1.md) foi enviado para revisão humana no JSON SHA `312d5e5d8a73a77f1dff385bbe988db551d4bfc93e93dce6abd9e75a66c58d85`. As revisões originais do módulo 012 e da SPEC0170 permanecem congeladas e pendentes. O ledger de autoridade está vazio; aceite técnico, preseleção, silêncio ou instrução automática de continuar não registram aprovação.

D-12, em [AGENTS](../../../07_agents/AGENTS.md), exige **“T2 + revisão explícita da SPEC pelo usuário antes do BUILD”** para mudanças T3. As correções de contrato, segurança e política aguardam essa decisão concreta. F05 já possui autorização sintética da SPEC0164 no hash atual, condicionada à liberação e claim do lockfile PR-L04; não se pede novamente a autorização existente nem se presume liberação.

G03/0354 literal permanece vigente, inclusive os P1 da janela operacional após GA. Fixtures locais não dispensam gates operacionais, decisão do consumidor ou autoridade T4 para capacidade real/release.

## Crítica integrada e continuidade

A [crítica independente integrada](integrated-round3-critic.json), fresh context I1, retornou **REJECT global / FAIL**, mantendo **ACCEPT_TEST_ONLY** para os oito novos casos. Seu maior impedimento é o desvio dos pisos obrigatórios de risco por policy `ALLOW` e a admissão sensível ainda opcional nas composições públicas. O código atual de policy e do dispatch conserva essas lacunas; a SPEC pendente não as corrige por declaração.

[Os fingerprints antes e depois da crítica](round3-critic-mutation-proof.json) foram iguais: `86da033177b8f20eb668184896a20b7cf84240fd3c533c1513dedf41d7d87df1`. O sentinel cobre o snapshot próprio inteiro, conforme o contrato do helper; não afirma imutabilidade do checkout concorrente. [A rodada 3 foi registrada nativamente](gauntlet-round3-record.json) como FAIL/REJECT e a estrutura do loop foi validada. As rodadas 1/2 históricas permanecem intactas. Estado nativo: **3 rodadas, ACTIVE/FIX_RETEST**; não houve finish nem conclusão do objetivo.

Este turno fez progresso concreto: oito testes conectados, gates reais, revisão independente local, proposta de catálogo revisada, correções de evidência concluídas e sete candidatas enviadas para revisão humana. O objetivo integral permanece ativo. Não houve três goalturns consecutivos sem progresso sob o mesmo impedimento; não há fundamento para marcar o goal como blocked nesta rodada.

[O handoff](../../../08_runtime/handoffs/up91_execution_20260930.md) permite ao holder integrar continuidade nos ledgers compartilhados sem sobrescrever o trabalho concorrente. Recursos próprios continuam disponíveis. Nenhum commit, push, deploy, dado real, provider ou efeito externo real foi executado.

Checkpoint final: evento0029, [verificações de continuidade](round3-final-continuity-checks.json) com oito checks aprovados; [estado terminal](round3-terminal-checkpoint.json) preserva candidato, fontes, gates, reviews pendentes e recursos. Todos os subagentes encerrados. O programa continua ativo e sem qualificação global.
