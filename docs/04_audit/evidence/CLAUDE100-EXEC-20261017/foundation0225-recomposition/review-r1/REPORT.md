# Crítica documental independente R1 — SPEC0225

**REVISE — 1 obrigatório agrupado (P2/T1), sem novo gate humano.**

Unidade `C100-FND-JOURNAL-0225-RECOMPOSE-001`. Crítico fresco; sem participação na autoria, sem descendentes. Julgamento limitado à fidelidade documental dos cinco ajustes já aprovados. A aprovação original permanece resolvida; esta revisão não concede BUILD, qualificação, paridade funcional ou release.

Proposta examinada: SHA-256 `59ce762f92fc168259872b72e55407dbe5cbfd918cd47a645640f56bab0765f5`. Original: `04b92ba4d13b1ed58157a24258cade87d8d6d31df833ef6c1969059772cc6da5`. A [bindingRule e os cinco ajustes](01-spec-gates.json.source.txt) autorizam a recomposição limitada com revisão técnica independente, sem repetir decisão humana. Ampliação continua fora dessa autoridade.

## Obrigatório R1-01 — separar as fronteiras journal/capture

Na [proposta congelada](adjusted-spec-proposal.md.source.txt), §5, linhas163–165, permaneceu a conclusão de que o capture de **8MiB** faz o máximo público ficar abaixo do máximo isolado do journal. Essa relação deixou de decorrer dos limites: o journal agora tem **1MiB**. J12, linha379, também substituiu indiscriminadamente `capture/encode acima8MiB` por `capture/encode acima1MiB`, embora o capture continue em8MiB.

O [capture primário](11-complete-tool-results.ts.source.txt), linhas20–31, limita o ToolResult inteiro por `COMPLETE_CHECKPOINT_MAX_BYTES`; a [constante primária](09-complete-tool-context.ts.source.txt), linha17, continua8388608. Como contraprova exclusivamente aritmética, uma string com1048575 caracteres ASCII tem1048577bytes JSON; seu ToolResult mínimo tem1048609bytes. Cabe no orçamento de capture, mas ultrapassa o novo journal. Nenhuma execução foi feita para essa análise.

**Correção documental única:** atualizar §5 para explicar a ordem dos limites após a redução, sem afirmar que o capture8MiB determina um máximo inferior ao journal1MiB. Em J12, discriminar overflow do encode/journal em1048576/+1 e falha de capture pelo ToolResult inteiro em8388608/+1, preservando o caso original de capture acima8MiB, erros/estado/UNCERTAIN e proibição de retry seguro. Não reduzir capture/checkpoint nem remover sua cobertura. Reconciliar o transform e emitir freeze/hash novos da cópia após a correção. Não editar a SPEC original nem executar essas provas nesta unidade.

Critério de fechamento: os dois trechos devem concordar com a tabela de limites e os snapshots, e manter explícitas as duas fronteiras e seus casos futuros. Trata-se da consequência documental do ajuste aprovado de teto; não exige nova escolha humana, schema, grant ou código.

## Constatações preservadas

| Aspecto | Juízo documental |
| --- | --- |
| Cinco ajustes | Corte exclusivo/parada, redução do teto, fatiamento, ordem0029→0030→0031 e exclusão de NUL alheio/rota0226 estão expressos. R1-01 impede o aceite integral da propagação do teto. |
| Limites |1048576bytes; base641398104; envelope1398616; folga512. Contexto32768 e checkpoint8388608 preservados. Sem alegação de medição de capacidade. |
| Nós, §11.1 | N≤524288 decorre de2N−1≤1048576;1000000/+1 excedem bytes. Guard1M/profundidade64 mantidos. Prova de componente é exigida separadamente da porta pública e permanece NOT_RUN. |
| Aceites |16IDs preservados. J14 disputa e drill completo J15 adiados; J05–J07 discriminam negativos mínimos. J13/J16 e restarts/crashpoints J01/J08–J10 mantidos. A fronteira capture de J12 precisa da explicitação acima. |
| Contrato/schema/grants/plano |§4, invariantes de schema e §6 conferem com o original; sem ampliação de API lógica, grants, coexistência ou guard0029. Alterações do plano correspondem ao fatiamento e dependências aprovados. |
| Fontes atuais | Journal correto em `operational-execution-postgres.ts`: opção atual somente fence, sem v1;256KiB e result_present conferidos. O outro journal não foi usado como autoridade. |
| Entrada técnica |0029 ausente no root continua pré-requisito de0030. TH06/recovery continuam FAILED/RB-01;75focais históricos não qualificam suporte. Todos J01–J16 NOT_RUN. |

## Integridade e alcance

Os [15 pares e20 entradas do freeze](integrity-before.json) conferem por SHA-256. A [conferência posterior](integrity-after.json) preserva101arquivos protegidos e ambos os inventários de migrations. Original, fontes root e worktree W permanecem individualmente idênticos às pré-imagens; root e W já eram diferentes entre si. O [diff integral](original-to-proposal.diff.source.txt) e os [checks documentais](documentary-checks.json) registram o recorte. Os20transforms explicam §§1–10, descontados espaços e separadores de tabela; §11/11.1 foi revisto diretamente.

Somente leitura, diff, JSON, aritmética e hashes, com novas evidências em review-r1. Sem imports de aplicação, compile, testes, PG, Docker, Claude, targets, rede, modelo, conta ou instalação. Nenhum arquivo fonte/SPEC/ledger/backlog/pin/checker foi alterado; continuidade fica entregue ao Lead por estes artefatos, conforme o limite de escrita desta delegação.

Próxima ação: Lead aplicar uma correção documental agrupada R1-01, atualizar os hashes da cópia e reconciliar a revisão conforme o orçamento. Nenhum aceite automático após correção; os gates técnicos de entrada seguem abertos. A [decisão estruturada](result.json) é vinculada pelo [manifesto](manifest.json); o manifesto exclui seu próprio hash, informado na entrega.
