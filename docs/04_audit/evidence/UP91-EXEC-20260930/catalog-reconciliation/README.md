# UP91-004-CATALOG-DOC — proposta de adjudicação

Entrega documental `IMPLEMENTED / REVIEW_PENDING`; os três `source_drift` continuam **não adjudicados**. O [patch proposto](proposed-catalog.patch) não foi aplicado nem aprovado. Parent UP91-004 permanece aberto e produção `NO_GO`.

| Entrada     | Owner       | Skips catalogados | Skips atuais sem PG | Origem do delta                                                      |
| ----------- | ----------- | ----------------: | ------------------: | -------------------------------------------------------------------- |
| SKIP-PG-004 | api-data    |                 8 |                  34 | afd30967: 8 casos existentes + 24 expansões de each + 2 testes novos |
| SKIP-PG-008 | api-data    |                 1 |                   2 | 3859032a: novo caso PG de replay futuro; três novos casos sem PG     |
| SKIP-PG-014 | worker-data |                 3 |                   3 | a67726b7: esperar health observado antes de SIGTERM                  |

A contagem AST da fonte atual e a coleta Vitest concordam em todos os casos. O diagnóstico exclusivo dos três arquivos executou Node 22.23.2/Vitest 4.1.11 no snapshot do Lead: **94 coletados, 55 passaram, 39 skipped, zero failed/todo, exit 0**. Esse resultado é apenas diagnóstico sem PostgreSQL, não é gate PASS nem prova de zero skips. Primeira saída preservada em [JSON bruto](diagnostic-first.json), [log bruto](diagnostic-first.log) e [comando/ambiente](diagnostic-command-first.json). Não houve segunda execução.

## Vínculo de bytes e proveniência

- Root HEAD observado: `f8ccc845e6f177959bc5d40e0cec59c71e595b5b`. O worktree concorrente não foi tratado como candidato congelado.
- Catálogo original SHA-256: `3aee15d5e2018554f147099a83fea0afad7d7ecb9c9bba18bf1ee281500acd9e`.
- Catálogo calculado pelo patch, somente em memória: `8a23170136b5f08f6f733833cce52bd6a3ad5e3b4d79cf752be3968313b8c831`.
- A [baseline](baseline.json) vincula os bytes de root e snapshot, iguais para as três fontes, catálogo, biblioteca de governança, config Vitest e manifests. O [sentinel](mutation-sentinel.json) confirmou esses inputs intactos, mais 1.054 inputs do snapshot; não afirma imutabilidade de todo o root concorrente.
- A [proveniência](provenance.json) e os [logs delimitados](history/catalog.git-log.txt) incluem até 30 commits por caminho, inspecionando bytes do commit e primeiro pai. Não foi feita busca global, em todas as branches ou reflogs.

| Entrada     | Preimage com hash catalogado                         | Commit que introduziu o drift observado  |
| ----------- | ---------------------------------------------------- | ---------------------------------------- |
| SKIP-PG-004 | d7c79c644143580603d10da9de631654dfb98cbd = afd30967^ | afd30967e3a6f5ff1c6bac556117f3c55c2911f3 |
| SKIP-PG-008 | 3aa5330b7e195524ea51da90f56ffe23bf1004a4 = 3859032a^ | 3859032a5b4ca45e5e45689bffda290997ba6176 |
| SKIP-PG-014 | 948a5af19f936f872f8adf0e62879f8a443436ec = a67726b7^ | a67726b702d6e5222d3a61de252fdd2b4ea211ca |

As três fontes também têm preimages correspondentes em `c791ee478885410f3fce9910c96df638a3607e81`. Os três valores já constavam do primeiro catálogo observado em `91023336`; `7ee85f84` preservou esses valores e `2e977f8a` produziu os bytes atuais do catálogo ao mover caminhos de jornada para `legacy/`. Esse histórico identifica origem, não aprovação. [Lineage do catálogo](history/catalog-lineage.json), [fontes e guards](source-counts.json) e [observações de código](code-source-observations.md) sustentam a proposta.

## Escopo exato do patch

[proposed-delta.json](proposed-delta.json) contém os SHAs completos e as únicas cinco mudanças propostas: SHA + contagem de 004, SHA + contagem de 008, SHA de 014. `id`, `file`, `owner`, `required=false`, `dedicatedGate=postgres`, `reason` e `expiresAt=2027-12-31T23:59:59.000Z` ficam idênticos. As demais entradas, incluindo jornadas PR-L04, ficam byte a byte idênticas. Não se altera biblioteca, guarda, piso, teste ou snapshot de produto.

A biblioteca atual rejeita corretamente as três fontes, mesmo com zero skips em relatórios com banco: a validação de SHA é incondicional. A checagem de contagem só roda se houver skips observados. Por isso a execução com banco sozinha não detectaria 8→34 nem 1→2. O [diagnóstico da biblioteca](governance-diagnostic-first.json) usando o catálogo original e apenas o relatório sem banco retornou **FAIL / 11 falhas**: três source drifts, dois count mismatches, três gates dedicados não executados e três relatórios ausentes. Nenhum relatório de gate foi fabricado. Prefixos dos caminhos do snapshot foram normalizados em memória para a biblioteca ler o root; o relatório bruto foi preservado.

## Condições para owners e integrador

1. Coordenar com Claude Code/PR-L04 a liberação de `scripts/skip-catalog.json` e registrar claim exclusivo/task T2. Não presumir liberação por ausência de atividade ou por esta entrega T1.
2. Revalidar hashes do catálogo, três fontes e contagens no candidato de integração. Havendo qualquer delta, marcar o patch STALE e refazer a proposta sobre o catálogo corrente preservando jornadas.
3. `api-data` deve adjudicar os diffs 004/008 e as contagens novas. 004 substituiu um positivo com catálogo simulado por um negativo de catálogo incompleto e adicionou 26 testes reais de serving; não é rebind sem mudança de testes. 008 adicionou cobertura temporal de segurança. Os diffs não autorizam mudança de política/segurança.
4. `worker-data` deve confirmar a troca da espera fixa por health observado e preservação dos três casos/guard obrigatório. SPEC 0143 é antecedente aplicável, ainda dependente de claim/revalidação. SPEC 0155 é antecedente **isolado 004/006**, não cobre a contagem root 34 nem o delta 008. Registrar SPEC curta corrente para o patch integrado, usando esses antecedentes sem ampliar sua autoridade.
5. Após adjudicação e claim, o integrador aplica exclusivamente as cinco alterações aprovadas, obtém crítica independente e executa gates T2 em Node 22/PG descartável, incluindo unit/PG/E2E, typecheck/lint/skip governance e demais verificações da rodada. Os relatórios devem pertencer ao candidato integrado. Certificação nova só pelo holder autorizado. Esta lane não executou esses gates.
6. Lead/holder integra continuidade em runtime/log/backlog e claim a partir de [adjudication.json](adjudication.json), sem registrar UP91-004 como concluída por este diagnóstico.

## Reprodução e integridade

- Verificar inventário: `sha256sum -c manifest.sha256` dentro deste diretório; `manifest.json` espelha tamanhos/digests e `manifest.json.sha256` vincula o próprio manifesto, sem recursão.
- [source-counting-procedure.txt](source-counting-procedure.txt) preserva o procedimento AST ad-hoc; ele usa TypeScript já instalado e as fontes brutas anexas. [analysis-environment.json](analysis-environment.json) registra comando, versões e hashes do analisador. Não exige instalação.
- Comparar as linhas `skipped/pending/todo` em `diagnostic-first.json` aos registros expandidos de `source-counts.json`; cada nome de caso pulado está em `proposed-delta.json`.
- Reproduzir diagnóstico somente sob nova coordenação de recursos do Lead, usando o argv/ambiente exatos em `diagnostic-command-first.json`, **com novos caminhos absolutos de saída** em `catalog-recon/`; nunca sobrescrever a primeira saída nem ligar PG_REQUIRED. A coleta sem PG continua não qualificante.
- [verification.json](verification.json) registra preservação, contagens, preimages, aplicabilidade do patch em leitura e checks de documentação. A barra documental está em [quality-bar.json](quality-bar.json). Independência **I0**, sem descendants; aceitação do Lead/crítico independente pendente. Não há veredito Gauntlet PASS desta lane.
