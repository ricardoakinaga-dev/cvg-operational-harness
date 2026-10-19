# SPEC 0215 — Qualificação exata da fronteira SDK stdio

Task `PARE100-EXEC:PREPARE-SPEC0215`, P100-001/002/025. Preparação documental T1; futuro BUILD de segurança T3. Estado: `PROPOSED`, revisão independente R2 pediu pin da composição; R4 em rechecagem, `BUILD_NOT_APPROVED`. As aprovações0211/0212 permanecem válidas para seus reparos; não aprovam esta mudança no detector. Esta SPEC não concede release, produção ou paridade integral.

## Problema observado e resultado pretendido

O gate `npm run boundary:products` retorna `INCOMPLETE`, sem violações de dependência de produto e sem drift de lock instalado, por46 diagnósticos que a análise estática não consegue qualificar sozinha. Não se considera esse resultado PASS. A proposta é qualificar somente os usos concretos de processos/streams do exemplo sintético aprovado e dois mirrors compilados, mantendo o detector e suas recusas gerais.

O [recon R4](../04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/recon.json), os [46 sites AST](../04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/sites.json), os [pins integrais](../04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/source-hashes.json) e a [configuração proposta inativa](../04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/proposed-exceptions.json) são inputs desta SPEC. O arquivo de configuração é dado de revisão; não está carregado pelo checker. A [comparação estática dos mirrors](../04_audit/evidence/PARE100-EXEC-20261014/spec0215/compiled-comparison.json) não substitui teste runtime.

| Grupo              | Caminho                                     | Quantidade máxima | Qualificação proposta                                                  |
| ------------------ | ------------------------------------------- | ----------------: | ---------------------------------------------------------------------- |
| SDK test child     | `packages/sdk/src/__tests__/stdio.test.ts`  |                19 | Filho sintético fixo e seus handles locais                             |
| SDK example child  | `examples/consumers/sdk-stdio/index.mts`    |                14 | Filho conhecido, pipes, listeners e encerramento                       |
| Canonical compiled | `packages/contracts/dist/canonical-json.js` |                 3 | Atualizar pins do grupo existente, sem ampliar contagem                |
| Session compiled   | `packages/harness/dist/session/events.js`   |                10 | Mirror dos checks JSON de descriptors/prototypes já presentes na fonte |

A contagem anterior36 foi superada por reparos de lifecycle da SPEC0211: novos listeners de readiness/cleanup também são sinalizados. R1 permanece histórico, sem pin reutilizado silenciosamente.

## Contrato do BUILD proposto

1. Alterar apenas `scripts/check-product-boundary.mjs` e testes pertinentes do detector. Não alterar policy do kernel, contratos públicos, produto, lockfile ou SDK para fazer o gate passar.
2. Para cada site, exigir simultaneamente reason, arquivo exato, linha normalizada, SHA-256 do **texto completo da expressão** (digest16 conforme algoritmo existente), ocorrência máxima e todos os pins integrais de seu grupo. O JSON R4 fornece os valores exatos; não há wildcard de linha, expressão ou contagem. Pin divergente mantém diagnóstico bloqueante.
3. Preservar a gramática `packages|apps|legacy` existente. Adicionar somente o caminho literal `examples/consumers/sdk-stdio/index.mts` como site possível; pins adicionais somente esse arquivo e `examples/consumers/sdk-stdio/child.mts`. Não admitir um diretório `examples/*`, outro exemplo, traversal, symlink, `node_modules`, produto ou script como site.
4. Três sites compiled canonical conservam grupo/reason/contagens existentes; substituir somente os pins pelos bytes produzidos pelo build público atual. O grupo session compiled fixa source+compiled de session e canonical conjuntamente. Não usar AST equivalente para aceitar byte pin diferente.
5. Os grupos SDK fixam integralmente o teste, o exemplo, o child e os sete arquivos SDK mais store, validadores e seus exports de harness listados no JSON. Uma mudança em qualquer dependência fixada invalida o grupo inteiro, mesmo que o texto da expressão seja igual. A revisão valida também as funções auxiliares locais e a composição por exports públicos.
6. Exceções continuam restritas a análises de capacidade por arquivo. Arestas para produto, leitura SHIFT\_\*, resolução de módulos desconhecida e findings de pacotes instalados nunca são dispensados. `--strict` ignora toda a tabela, incluindo estes grupos, e deve continuar mostrando os diagnósticos brutos.
7. O relatório deve listar cada exceção efetivamente aplicada e as não usadas; nenhum `INCOMPLETE` é renomeado como sucesso. Novos sites, pins ou contagens exigem revisão própria e evidência, não atualização automática do checker para refletir qualquer código.

## Fronteira de confiança e justificativa dos sites

O exemplo lança `process.execPath`, sem shell, com um sibling literal escolhido por `import.meta.url`: fonte `.mts` usa o loader local `tsx`; artefato `.mjs` usa sibling compilado. O input RPC não escolhe binário, argumento, arquivo, ambiente ou sinal. O child chama a implementação direta createSdk em composition.ts: ela preserva os callbacks fornecidos, compõe createSdkServer e escolhe sessions ?? new InMemorySessionEventStore. O child não fornece sessions; o store local está em session/memory.ts e usa Map privado, enquanto session/events.ts fornece validação. A cadeia index.ts → session/index.ts → memory.ts estabelece o export público. Composição, store, validadores e exports ficam fixados nos grupos SDK. A atribuição anterior do store a events.ts era incorreta e foi corrigida, sem mudar sites. O compositor usa somente modelo determinístico, memória e dados sintéticos. A análise de dependências dos pacotes continua ativa.

Node22, loader e dependências locais são ferramentas confiáveis desta execução. Esta SPEC não promete contenção de programa arbitrário, proteção contra host/loader comprometido nem transforma o helper exportado em validador de propriedade de qualquer processo recebido. As únicas chamadas qualificadas são as dos filhos criados nesses arquivos fixados. A prova compilada em diretório próprio valida exports reais e tem hashes próprios; não é um site novo ou uma autorização genérica de executar `.mjs` fornecido pelo chamador. Qualquer futura cópia compilada incluída na closure deve ser analisada e qualificada por seus bytes, sem herdar uma exceção da fonte.

Reparos no escopo0211 já executados antes desta proposta: ambiente mínimo sem NODE_OPTIONS herdado, HOME/XDG/TMP privados, cwd explícito, setup protegido por try/finally, tentativa de shutdown mesmo se transport.close falhar, retorno após capturar o diagnóstico de fechamento. O teste de child que ignora TERM tem ambiente/cwd próprios e readiness limitado a2000ms, com listeners removidos em data/error/close/timeout. O shutdown faz drain1000ms, TERM500ms e KILL250ms; confirma saída/stdio. Falha de encerramento não autoriza outro processo/retry. Diretório privado do exemplo só é removido se saída foi confirmada. Há pressuposto de métodos nativos do processo confiável; não há prova contra monkeypatch arbitrário do host.

Os sites de reflexão compilada verificam dados JSON, descriptors e protótipos; nenhum descriptor é usado como código ou como loader. A comparação AST completa entre transpile e artefato observado confirma a origem sintática proposta; pins vinculam os bytes reais. Isso não certifica objetos Proxy hostis ou uma implementação futura diferente.

## Verificação obrigatória e critério de pronto

Antes de ativar: crítica I1 fresh-context do documento, dados propostos e fontes fixadas; revisão explícita do usuário desta SPEC e dos hashes. A revisão técnica julga a qualificação concreta e os limites de confiança, não aceita o detector futuro.

Após aprovação, executar BUILD e testes discriminantes em cópias sintéticas próprias:

- Known-good: somente os46 sites/pins exatos recebem as exceções propostas; contagens e IDs são observáveis. Os demais grupos existentes preservam seu comportamento.
- Mudar um byte de cada pin, mantendo a expressão sinalizada: o grupo correspondente deixa de dispensar os sites. Rebuild reproduzível e igualdade AST não dispensam drift dos bytes.
- Alterar uma expressão após a primeira linha, duplicar uma ocorrência, mudar arquivo ou reason: a variante não fica coberta. Cada limite independente deve ter um negativo exercitado.
- Inserir a mesma expressão em outro exemplo, produto, script ou caminho com traversal/symlink: não é admitida. Regras de path existentes continuam verdes.
- Inserir import/require/dynamic loader para produto, leitura SHIFT\_\* ou módulo não resolvido nos arquivos qualificados: continua falha, mesmo com grupo presente. Não atualizar pins da fixture para mascarar a natureza do finding.
- `--strict`: nenhuma exceção aplicada; diagnósticos correspondentes continuam visíveis. O gate default só pode PASS se não houver qualquer violação/diagnóstico residual.
- SDK sintético, build público, exemplo compilado por exports reais, typecheck, lint, unit, PG e E2E em Node22; cobertura e certificação da candidata conforme constituição. Resultados anteriores com hash divergente ficam históricos. Crítica independente do BUILD integrado e evidência de não mutação também são obrigatórias.

Rollback: retirar apenas os grupos/paths adicionados por esta task e restaurar o pin anterior registrado no diff próprio; o gate volta a `INCOMPLETE`. Não remover fonte SDK, reduzir detector, apagar evidência ou alterar arquivos de outro agente para produzir verde.

## Autoridade e limites de conclusão

A [constituição CVG](../07_agents/AGENTS.md), tabela de governança proporcional, exige em T3: “T2 + revisão explícita da SPEC pelo usuário antes do BUILD”. Esse é o motivo concreto do próximo gate humano. A aprovação solicitada limita-se às exceções específicas e testes descritos, com ferramentas/dados sintéticos. Sem aprovação: nenhuma alteração de checker ou tabela ativa.

P100-025 ainda exige outros transportes/SDKs; P100-003 ainda exige freeze semântico; P100-010/011 ainda exigem migração do caminho legado. Nenhum desses cartões, os36 cartões/oito fases, a paridade100% ou release é encerrado por esta qualificação.
