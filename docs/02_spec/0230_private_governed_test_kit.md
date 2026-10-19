# SPEC0230 — Kit privado de testes governados

Task `PAR-Q03-KIT-001`,17/10/2026, suporte ao PAR-Q03 requerido pela execuçãoClaude100. Trilha **T2**, conforme D-12 e classificação do cartãoPAR-Q03. Não modifica contratos públicos, schemas persistidos, policy/approval, providers, exports/workspaces de aplicação ou execução produtiva. Autoriza somente o BUILD proporcional T2 desta extração privada sob o pedido de implementação integral; não é gate de Q01 ou de novos contratosT3.

## Recon e problema

No checkout7ecc5b53, testes de conformidade definem sinksAudit/Telemetry locais; o replay define uma cópiaJSON própria; consumidoresSDK criam entradas/fixtures determinísticas isoladamente. Existe comparação exata no replay e nenhuma biblioteca neutra compartilhada dessas primitivas. O PAR-Q03 pede normalizador explícito de log, manifesto de suíte e kit do runtime governado usados por três famílias sem copiar helpers.

Esta é uma nova unidade delimitada. Não corrige/reabre o test-resource-hardening224 rejeitado nem reutiliza seus50testes como aceite. Erros de pool/subprocesso daquela unidade permanecem abertos.

## O que e onde

Na candidata própria:

- `tests/support/governed-test-kit/`: pacote interno `private:true`, JS ESM com declarações TS quando necessárias, entrypoint/README; não é workspace npm nem dependência da aplicação.
- `tests/conformance/harness-runtimes.conformance.test.ts`: extrair/reusar sinks de gravação sem mudar sua semântica ou os oráculos da conformidade.
- `tests/replay/execute-fixture.ts`: reusar cópiaJSON/portas determinísticas preservando PolicyEngine/ApprovalEngine reais, IDs, clocks, fixtures, asserts egoldens originais.
- `tests/consumers-sdk-session.test.ts`: consumir o mesmo kit em cenário real pelo SDK público, além das verificações anteriores, sem alterar o exemplo do consumidor.

Não alterar expected/goldens, registries, contracts, runtime, applicationpackage.json/lock, tsconfig ou regras de skip. Se uma mudança além desses paths for necessária, apresentar recon e ajustar claim antes; se tocar contrato público/segurança, gateT3 obrigatório antes de código.

## Contrato interno e regras

1. Entrypoint privado com três capacidades: normalização declarada de logs, manifesto de suíte e primitivas/fixtures de gravação do runtime governado. Sem filesystem/rede/provider/contêiner no kit; processos e serviços não são abstraídos nesta unidade.
2. Normalizador aceita dadosJSON válidos e política fechada. Política padrão é identidade; só reescreve metadados explicitamente declarados, como `eventId`, `correlationId`, `traceId`, `occurredAt`, em posições enumeradas do envelope. Nenhum wildcard, regex ou busca recursiva por nome. Campo desconhecido, regra repetida/conflitante ou modo inválido falha explicitamente.
3. Preservar ordem/quantidade de eventos, tipo, tenant, resposta, input/output de ferramenta, erro, stopReason, operação/approval/efeito e contadores/custos. Não remover campos nem tornar eventos diferentes iguais por normalização não declarada. IDs declarados mantêm igualdade/distinção por namespace; a prova de efeito/autoridade usa o bruto, nunca o log normalizado como grant.
4. Log bruto e política permanecem acessíveis, com digest estável da política/projeção; mutação da entrada não altera a saída já materializada e o normalizador não modifica o input. JSON não serializável deve ser recusado no normalizador/manifesto, sem truncamento silencioso. A cópiaJSON extraída do replay mantém exatamente a semânticaJSON.stringify/parse anterior; não confundir cópia com validação ou normalização.
5. Manifesto de suíte valida identidade/versão/casos e recusa IDs duplicados, campos desconhecidos e declaração não sintética. Digests canônicos independem de ordem das chaves dos objetos; ordem de casos/eventos continua significativa. Sem autodeclaração de PASS/paridade no manifesto.
6. Portas/fixtures sintéticas são injetadas; gravaçãoAudit/Telemetry conserva a semântica anterior. Se existir builder do runtime, ele compõe a fábrica/SDK real e não reimplementa controle. Defaults nunca aprovam efeitos; casos com grant/approval são explícitos na fixture. Clock/IDs são locais; nenhum globaltimer/Date/fetch alterado pelo kit.
7. As três famílias precisam importar o mesmo entrypoint e executar boundaries reais: conformidade de runtimes, replay completo e SDK. Não vale criar três cópias do helper ou três testes que só inspecionem a implementação do kit.

## Critérios congelados antes do BUILD

| ID   | Aceite e caso conhecido incorreto                                                                                                                  | Método                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| TK01 | Três famílias reais usam o mesmo pacote privado. Cópia local de helper extraído ou teste que só importa sem executar não satisfaz.                 | Inspeção de imports/diff e execução dos três arquivos completos.                                            |
| TK02 | Política vazia mantém o log exatamente; regra declarada só muda o metadata autorizado. Regra em payload/tenant/erro/efeito ou wildcard é recusada. | Positivos e negativos independentes da forma interna.                                                       |
| TK03 | Regressões em ordem, efeito, erro, budget/contadores e tenant continuam distinguíveis. Um normalizador que mascara resposta/efeito precisa falhar. | Corpus bom e adulterações sem alterar o bruto original.                                                     |
| TK04 | InputJSON inválido e política inválida falham; cópia/saída não sofrem alias mutável e a entrada não é alterada.                                    | Limites e mutações posteriores observados.                                                                  |
| TK05 | Manifesto tem identidade/digest reproduzíveis; duplicata/versão inválida/campo desconhecido/não sintético falham.                                  | Permuta de chaves, ordem de casos e entradas inválidas.                                                     |
| TK06 | Factory/portas preservam recording, clocks/IDs e recusam approval implícita; SDK/runtime real respondem conforme fixture.                          | Caminhos públicos com modelo determinístico e ausência de chamada externa.                                  |
| TK07 | Oráculos anteriores, fixtures/goldens, Policy/Approval reais do replay e denominadores não são enfraquecidos.                                      | Diff e regressão integral das famílias; hashes pré/pós dos insumos congelados.                              |
| TK08 | GatesT2 e certificação da rodada de código cumprem constituição emNode22 na candidata própria. Sem converter falha alheia em PASS.                 | typecheck, lint, npmtest, PostgreSQL,E2E ecertify com logs/candidato; distinguirbaseline/regressão/NOT_RUN. |

## Execução, verificação e propriedade

DependênciasPAR-Q03:nenhuma. C100-Q01 e PAR-Q04 continuam dependentes do kit integrado/qualificado; este helper não fecha essas capacidades. Usar worktree/branch próprios com node_modules por cópia isolada de procedência registrada; sem instalar/alterar lock ou compartilhar caches graváveis. PG/API/web sintéticos exclusivos por claim quando os gates precisarem.

O Lead verifica baseline e critérios, um builder implementa paths próprios e um crítico independente julga o artefato real, com no máximo dois retrabalhos. Não baixar barra por falha conhecida de baseline. `IMPLEMENTED/VERIFY` não é `DONE`, nem crédito de paridade. Publicação externa/npm, push e deploy não estão no escopo.

## Recuperação

Preservar a candidata/evidências/erros se interromper; confirmar handles de processos e propriedade antes de retomar gates. Não parar banco ou serviço alheio. Alterações de aplicação permanecem zero; recuperação do patch privado consiste em nova correção no próprio branch, sem restore/reset de trabalho compartilhado. A unidade só termina quando TK01–TK08 têm evidência aplicável ou registra precisamente o que permanece incompleto.

## Resultado local de qualificação —17/10/2026

TK01–TK07 aprovados por crítico independente, sem achados bloqueantes, com três famílias reais preservadas e112probes próprios. TK08 concluído na candidatad80e9bb8:16/16gates locais PASS, unit4225PASS/0FAIL/1pending, PostgreSQL302PASS/zero skips eE2E12PASS/zero skips/flaky. Verificador oficial confirmou38hashes e candidata35deae23e3a13f83645a10fad10bfd9913540fa9fe2a539b3d25c9ec23f8d80d; resultado mecânico CONDITIONAL_GO/AAA_CONTROLLED, sem produção. [Evidência atual](../04_audit/evidence/CLAUDE100-EXEC-20261017/q03/cert-r2/manifest.json). A cópia desta SPEC usada na candidata permaneceu congelada durante os gates; este adendo externo registra o resultado sem alterar seu contrato.

Status da unidade: QUALIFIED_LOCAL_CANDIDATE. Nove inputs do kit têm os mesmos bytes na candidataQ01 derivada; uso local integrado foi liberado emregistro próprio. PAR-Q03 canônico continua IN_PROGRESS até integração coordenada, assim como Q01/M1 e paridade funcional. A regressão documental0233 foi unidadeT2 separada; seu P3 não bloqueante permanece registrado. PostgreSQL efêmeroQ03 próprio encerrado após os gates. Nenhum release, push ou integração automática na raiz.
