# Resultado AUD33 — M07-S1-R1-C1F

**Veredito: `FAIL / OPEN`.** A correção e os checks locais passaram no candidato congelado; a barra não fecha porque a proveniência de alguns comandos de setup está incompleta (`C1F-05 PARTIAL`) e a revisão independente I1 ficou indisponível (`C1F-08 BLOCKED`). M07-S1 continua `FAIL / OPEN`; produção `NO_GO`.

## Autoridade e escopo executado

- O usuário aprovou o gate corretivo C1F respondendo “aprovo este gate”. O registro vincula a resposta ao escopo apresentado e identifica os bytes persistidos: gate SHA-256 `fe12424140bf93785ff520bc804dd0954a82ce976dd26311365a5a5bc57f8535`, preview SHA-256 `244143d81efd8559401dc40c9a11f4d510464e40b54c830700a85bfbab3ba191`; ver [decision-record.md](decision-record.md).
- `A24-03-C1F` foi registrada em 0344 antes das edições. Snapshots dos quatro paths foram verificados em [rollback-baseline](rollback-baseline/) e [rollback-baseline.sha256](rollback-baseline.sha256).
- O diff C1F contra os snapshots contém somente policy, scanner, teste do scanner e o teste sintético conversacional: [candidate-diff.patch](candidate-diff.patch). A expectativa negativa agora exige `STATE_CONFLICT`; o resume autenticado correspondente continua coberto e retorna `EXECUTE`. Código de produção não foi alterado.
- O worktree já continha alterações preexistentes extensas; não foi limpo nem resetado. O candidato limitado de M07 tem exatamente os quatro additions autorizados e 977 inputs.

## Candidato e inventário

- Toolchain: Node `v22.23.2`, TypeScript `6.0.3`, npm `10.9.8`; preflights exit 0 e logs em [command-records.json](command-records.json).
- Freeze e verificação inicial: exit 0. Candidate fingerprint `89e4d30ce8b2fd1d102a200bc729249a99ebc47499e4d04a79cd7f6633890f1a`, com 977 inputs e quatro approved additions. O manifesto é [execution-candidate-manifest.json](execution-candidate-manifest.json).
- Inventory: exit 1 de domínio, classificado `PASS_WITH_FINDINGS`; relatório completo com 11 findings (9 `DEPENDENCY_CATEGORY_MISMATCH`, 2 `MISSING_DIRECT_DEPENDENCY`), `coverage.complete=true`, `gaps=[]`, `unresolved=0`. O fingerprint no report coincide com o manifesto. Ver [workspace-dependency-report.json](workspace-dependency-report.json).

## Matriz de verificação

| Check | Resultado observado |
| --- | --- |
| Testes focados — scanner, direção e conversa | Exit 0; 3 arquivos e 25 testes passaram, nenhum falhou ou foi pulado. |
| `npm test` | Exit 0; 303 arquivos passaram, 20 foram pulados; 2.137 testes passaram, 146 foram pulados, nenhum falhou; Vitest 287,54 s. |
| Typecheck | Exit 0. |
| Lint | Exit 0. |
| Coverage | Exit 0; statements 90,86% (14.191/15.617), branches 85,88% (11.145/12.977), functions 92,91% (2.690/2.895), lines 91,81% (13.473/14.674). Todos os thresholds 90/85/90/90 passaram. |
| Pós-check do candidato | Exit 0; fingerprint continuou `89e4d30ce8b2fd1d102a200bc729249a99ebc47499e4d04a79cd7f6633890f1a`. |
| Integridade dos logs | 19 comandos capturados; todos os stdout/stderr existem e seus hashes conferem em [command-log-integrity.json](command-log-integrity.json). Um comando auxiliar de inspeção falhou antes de ler os arquivos por quoting do shell; a falha foi preservada, e inspeções Node capturadas depois validaram os dados. |
| Sanitização | O scan final cobriu 38 logs e não encontrou padrões de credencial; resultado preservado em [sanitization-final.stdout.log](sanitization-final.stdout.log). |

Os comandos de teste removeram todas as variáveis PostgreSQL enumeradas no gate. Nenhum banco, serviço externo, rede externa, dado real, ação sensível ou produção foi usado.

## I1 e critérios

A solicitação fresh-context I1 foi recusada pelo serviço com `agent thread limit reached`; nenhum reviewer foi criado e nenhum relatório foi produzido. O fingerprint completo do worktree antes e depois da recusa ficou idêntico (`e9c5dd68b17004b31dd609274dfb709f62673119a0a569f77f761b825eee410b`); isso demonstra ausência de mutação, não substitui review. Ver [i1-attempt-01.md](i1-attempt-01.md). Nenhum auto-review foi contado como I1. Um Final Critic independente separado também não foi obtido.

| Critério | Estado | Evidência/limite |
| --- | --- | --- |
| C1F-01 | PASS | Diff e candidate manifest contêm os quatro paths aprovados. |
| C1F-02 | PASS | Testes de path C1F positivo, nome não aprovado, C1E/históricos, traversal e symlink passaram; mismatch resulta em `STATE_CONFLICT`. |
| C1F-03 | PASS | 977 inputs, quatro additions e toolchain ligada ao candidato. |
| C1F-04 | PASS_WITH_FINDINGS | Inventário completo; 11 findings; zero gaps/unresolved; fingerprint igual. |
| C1F-05 | PARTIAL | Os 19 comandos capturados têm logs, hashes, exits e durações; os comandos de cópia/checksum dos snapshots só têm exit registrado, sem logs/duração/timestamp individual. |
| C1F-06 | PASS | Testes, typecheck, lint e todos os thresholds de coverage passaram. |
| C1F-07 | PASS | Pós-check sem drift; snapshots disponíveis. |
| C1F-08 | BLOCKED | I1 indisponível; nenhum parecer independente aceitou o candidato. |
| C1F-09 | PASS | Execução local/sintética, variáveis PostgreSQL removidas, G21-5/G21-6 fechados, produção `NO_GO`. |

O resultado estruturado está em [quality-bar-results.json](quality-bar-results.json); a barra congelada permanece em [quality-bar.json](quality-bar.json). C1F reprova como gate apesar dos checks locais verdes, pois C1F-05 e C1F-08 são critérios obrigatórios. O state manager Gauntlet de C1F foi inicializado depois da implementação porque o run C1E ainda ocupava `.gauntlet`; a barra e os snapshots C1F foram congelados antes do código. A limitação de lifecycle está em [gauntlet-lifecycle-note.md](gauntlet-lifecycle-note.md).

O run Gauntlet `m07-s1-c1f-20260924-1` foi finalizado `FAIL`; o run C1E anterior também foi finalizado `FAIL` e preservado em `.gauntlet-archive/m07-s1-c1e-20260924-finished-fail/`. Nenhum dos runs apresenta I1 ou Final Critic aceito.

## Próximo passo

Preparar um gate separado de revalidação que recapture com logs, timestamps e durações a proveniência dos snapshots/cópias/checksums ausentes em C1F-05; nenhuma repetição de checks fica autorizada por este resultado. Após eventual aprovação e revalidação sem drift, obter I1 fresh-context do mesmo candidato quando o serviço aceitar o reviewer, para tratar C1F-08. A I1 isolada não corrige C1F-05. Até ambos os critérios obrigatórios serem satisfeitos, M07-S1 permanece `FAIL / OPEN`; M07-S2/S3/S4 e M05 não avançam; G21-5/G21-6 seguem fechados e produção `NO_GO`.
