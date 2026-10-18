# Crítica documental independente R2 final — SPEC0225

**APPROVE_APPROVED_ADJUSTMENTS — R1-01 fechado; zero obrigatórios.**

Unidade `C100-FND-JOURNAL-0225-RECOMPOSE-001`. Mesmo crítico independente da R1; revisão final da única correção documental agrupada, orçamento1/1 consumido, código/runtime/gates/probes0. Aprovação limitada à recomposição documental dos cinco ajustes humanos, no hash desta cópia. `BUILD_ENTRY_READY=false`:0029 e suporteTH06 permanecem abertos.

Proposta R2: SHA-256 `f26ccead3ad43d55d480ba08533e55bc9792a299608667570850668b0d12b315`. Original aprovado, preservado: `04b92ba4d13b1ed58157a24258cade87d8d6d31df833ef6c1969059772cc6da5`. A [bindingRule](01-spec-gates.json.source.txt) dispensa novo gate humano para aplicar somente os ajustes listados com revisão técnica independente; não concede ampliação de escopo.

## Fechamento R1-01

Na [cópia R2](adjusted-spec-proposal.md.source.txt), §5, linhas163–168, separa output canônico do journal1048576bytes de todo ToolResult8388608bytes. J12, linha382, preserva1048576/+1 e8388608/+1, erro/estado/UNCERTAIN e proibição de retry seguro. §11.2, linhas453–467, exige identificar a etapa alcançada, diferencia prova de componente da porta pública e recusa inferir sucesso fim a fim a partir do capture isolado.

A ordem estática é apoiada pelos snapshots primários: [createOperationalHarness](15-createOperationalHarness.ts.source.txt), linhas249–254, compõe a preparação do registro antes do wrapper de journal; [complete-tool-results](11-complete-tool-results.ts.source.txt), linhas20–31 e preparação do registry, limita o ToolResult inteiro; [effect-journal](16-effect-journal.ts.source.txt), linhas372–395, aguarda a ferramenta preparada antes de confirmar somente `result.output`. A [constante](09-complete-tool-context.ts.source.txt), linha17, continua8MiB. Esta constatação demonstra apenas a ordem no texto da fonte; não demonstra comportamento executado nem que todas as exigências futuras de preservação de causa já estejam implementadas.

O [diff R1→R2](r1-to-r2.diff.source.txt) restringe-se ao parágrafo de§5, J12 e§11.2, descontados espaços/separadores de tabela. Os outros15aceites, plano de migração e§11.1 permanecem iguais à R1. R1-01 está fechado documentalmente; o [resultado anterior](r1-result.json.source.txt) e sua reprovação histórica permanecem intactos.

## Fidelidade aos cinco ajustes

| Ajuste aprovado | Resultado documental |
| --- | --- |
| Corte exclusivo/parada | Mantidos schema/principal exclusivos, drenagem e proibição de operação mista; sem novos grants ou autoridade. |
| Teto reduzido | Journal1MiB/base641398104/envelope1398616; contexto32KiB e checkpoint/capture8MiB preservados. J12 mantém ambas as fronteiras; sem medição alegada. |
| Fatiamento de provas | DisputaJ14 e drill completoJ15 adiados. MínimosJ05–J07 discriminados; J13/J16 e restartsJ01/J08–J10 mantidos. TodosJ01–J16 continuamNOT_RUN. |
| Migration/claim | Ordem0029 integrada primeiro→0030→0031 preservada;0029 ainda ausente no root. Task/recurso e entrada técnica continuam exigidos. |
| Limites de domínio | Outros camposJSONB/NUL e rota publicada0226 permanecem fora do fechamento. Sem crédito de qualificação, paridade ou release. |

A aritmética de§11.1 continua válida:2N−1≤1048576 implicaN≤524288; o guard1M permanece e sua prova de componente continua distinta da porta pública. Contrato§4, invariantes de schema e grants/legado§6 conferem com o original. O [diff original→R2](original-to-r2.diff.source.txt) e os [checks documentais](documentary-checks.json) sustentam esse recorte, sem ampliação observada.

## Integridade e alcance

[Antes](integrity-before.json) e [depois](integrity-after.json):22inputs do freeze exatos,17pares fonte/snapshot exatos,141arquivos protegidos sem mutação e inventários de migrations preservados. Os15inputs anteriores, SPEC original, arquivo da cópia/freezeR1 e todos os arquivos vinculados pelo manifestoR1 estão intactos.71fontes/migrations root/W também conferem com a baselineR1; root e W permanecem individualmente preservados, sem afirmar que sejam iguais entre si.

Somente leitura, diffs, JSON, aritmética e hashes; escrita exclusiva nesta review-r2. Nenhuma execução/import de aplicação, teste, gate, probe, compile, SQL/PG, Docker, Claude, target, rede, modelo, conta ou instalação. TH06 não foi revisto ou alterado; FAILED/RB-01 e ausência de suporte qualificado continuam dependências, e75focais históricos não contam como aceite.

A [decisão estruturada](result.json) é vinculada pelo [manifesto](manifest.json). O aceite encerra a crítica desta recomposição e não autoriza BUILD nem satisfaz seus pré-requisitos técnicos. Próxima ação do Lead: registrar o fechamento documental e tratar0029/suporteTH06 em unidades próprias antes de qualquer entrada em BUILD. Nenhuma nova pergunta humana pelos cinco ajustes resolvidos.
