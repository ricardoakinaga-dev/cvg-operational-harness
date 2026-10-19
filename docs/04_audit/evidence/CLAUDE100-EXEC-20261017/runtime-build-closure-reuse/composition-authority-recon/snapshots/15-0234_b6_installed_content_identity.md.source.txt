# SPEC0234 — Identidade instalada sem confiança semântica implícita

Data17/10/2026. Preparação `HISO005-PROOF-PLAN-20261017`; implementação proposta `HISO005-CONTENT-ID-BUILD-0234`, filha de HISO-005/B1. [Plano integral0389](../03_build/0389_hiso005_positive_proof_execution.md), [contrato conservador0228](0228_b6_boundary_fail_closed_remediation.md), [B6/0619](../04_audit/0619_b6_stable_isolation_reaudit_2026-10-17.md).

**PROPOSTA T3. BUILD NÃO AUTORIZADO.** Esta unidade fornece uma parte necessária da prova positiva futura. Não restaura PASS, não suprime exceções e não encerra HISO-005/B6. A aprovação será vinculada ao hash submetido, com decisões e evidências fora do corpo congelado.

## 1. Problema e decisão proposta

Os303instalados da candidataf11 são reconhecidos nominalmente pelo lock, mas seus arquivos não foram comparados a uma referência independente. Todos têm SHA-512 e artefatos correspondentes disponíveis no cache local, segundo [recon readonly](../04_audit/evidence/HISO005-PROOF-PLAN-20261017/recon.json). Cache íntegro não significa instalação íntegra, e instalação idêntica não significa ausência de import dinâmico proibido.

Proposta: construir uma árvore de referência em diretório próprio, sem copiar conteúdo de `node_modules` avaliado; usar Node22.23.2/npm10.9.8 fixados e `npm ci --offline --ignore-scripts --audit=false --fund=false` com cache físico próprio derivado dos payloads já disponíveis. Comparar inventários físicos completos de cada pacote, reportando separadamente MATCH, MISMATCH, UNAVAILABLE ou UNSUPPORTED. O gate mantém `verified:false` para todo instalado, inclusive MATCH.

O usuário decide aceitar **esse npm local fixado como parte da base de ferramentas da observação de identidade**, seu recipe offline e as limitações abaixo. Não decide confiar semanticamente em pacotes, aceitar cache como aprovação institucional ou tratar o resultado como release. Não será escrito um parser de tarball próprio nesta unidade.

## 2. Origem, escopo e autoridade

Base de implementação proposta: worktree própria derivada de `f11f762f6a176417a40d2d53bdb67c633d7e1cef`; fontes e156regressões focais da0228 preservadas. Não incorporar fontes PARE100/Claude100/Codex100 ou código do principal por conveniência. O principal e as candidatas anteriores continuam intactos.

Autoria/revisão T1; BUILD T3 por envolver identidade e evidência de segurança. [AGENTS, D-12](../07_agents/AGENTS.md) exige “revisão explícita da SPEC pelo usuário antes do BUILD”. O pedido de seguir uma frente não aprova uma nova SPEC ainda não apresentada. A0228 excluiu esse HOW; seu recibo não autoriza0234 por associação.

Paths propostos: novo componente interno `scripts/boundary-installed-identity.mjs`, runner offline em `scripts/` se a separação for necessária, wiring em `scripts/boundary-manifests.mjs`/`scripts/check-product-boundary.mjs`, testes focais e bloco correspondente do runbook0803. Sem nova dependência/workspace, lock, API pública do runtime, produto, schema, workflow, Docker ou transporte/provider. Checkpoints locais seletivos da candidata são permitidos somente para congelar os inputs dos gates; sem integração automática, push ou deploy.

## 3. Referência independente da instalação avaliada

### 3.1 Recipe controlado

1. Congelar commit, lock, manifestos/workspaces e configuração de resolução da candidata. Criar snapshot físico próprio das fontes versionadas, sem `.env`, credenciais, dist ou `node_modules` prévios. Esse snapshot é suporte do npm, não runtime nem prova de exclusão física do produto.
2. Fixar Node/npm por versão e hashes de executáveis/arquivos materiais do CLI; registrar plataforma, arquitetura, seleção dev/optional e configuração efetiva. Node/npm são ferramentas de confiança explícita desta proposta, não prova de autenticidade emitida pelo próprio candidato.
3. Copiar somente payloads de cache para cache próprio; verificar cada SHA-512 contra o lock congelado antes do uso. O cache original fica readonly. Não importar índices como raiz de confiança, não copiar hashes da instalação avaliada para torná-la referência.
4. Rodar npm somente em snapshot/cache próprios, com `--offline --ignore-scripts --audit=false --fund=false --include=dev --include=optional` e `--cache` explícito. Eliminar configurações npm/provider herdadas; apontar userconfig/globalconfig para arquivos próprios vazios, sem reatribuir HOME. Toda configuração material do projeto entra no manifesto e é revisada; não executar scripts de workspace ou lifecycle. Proibir fallback online, `--force`, audit/fund e comandos adicionais não registrados.
5. Verificar fontes/lock antes/depois, capturar argv/ambiente não secreto, exitcode/logs e inventário físico da referência. Falha npm, artefato ausente ou configuração desconhecida invalida a referência; não cair na instalação avaliada como fallback.

A verificação efetiva de rede zero e de scripts não executados é aceitação de BUILD, com sentinelas e observação de processos/conexões em fixture própria. Flags sozinhas não provam esses resultados. O wrapper deve limitar o processo e seus descendentes próprios, sem parar serviços de outros agentes. Erros, timeout e saída parcial produzem UNAVAILABLE, sem manifestos de sucesso parciais.

### 3.2 Recibo e validade

O recibo JSON tem `schemaVersion:1`, `kind:cvg-installed-content-reference`, commit, SHA-256 de lock/toolchain/config, recipe, seleção de plataforma/optional/dev, inventário, raiz física e hashes. Campos obrigatórios ausentes, duplicados ou tipos incorretos são recusados. Cada entrada declara caminho relativo POSIX, tipo, tamanho, SHA-256 de arquivo regular e bits executáveis; link declara alvo textual e resolução. O leitor valida formato, versão, escopo e digest esperado fornecido pelo chamador, separado do próprio recibo. Um campo `approved:true` ou hash autodeclarado não lhe dá autoridade. O digest fixa a referência usada; não constitui aprovação semântica.

Serialização de recibo canônica: UTF-8, chaves de objetos ordenadas lexicalmente, arrays em ordem declarada, representação JSON sem espaços e um LF terminal. Recodificar o valor parseado e comparar os bytes completos antes de aceitar; isso também recusa chaves duplicadas e representações ambíguas sem confiar somente no resultado de JSON.parse. O digest esperado é SHA-256 desses bytes canônicos.

O responsável confiável pela execução fornece o digest após confrontar recipe/logs/manifesto e revisão. A implementação recusa raiz coincidente, aliases canônicos e hardlinks que revelem autorreferência à instalação avaliada. Não se promete descobrir por análise de bytes que um operador malicioso copiou arquivos para outro diretório e forjou o histórico; a origem independente depende do recipe controlado e da revisão do responsável. Os dois argumentos não são uma assinatura ou proteção contra esse responsável malicioso. Nenhum recibo dá `verified:true`, inclusive nesse cenário.

Recibo só é consumido após referência terminar com sucesso, verificações e revisão dos artefatos. Mutação de lock/config/ferramenta/arquivos da referência invalida seu uso; mutation da árvore avaliada invalida o resultado da comparação. Revalidar antes/depois, recusar corrida ou leitura parcial e não manter cache de veredito após mudança de bytes. Não promover automaticamente um manifesto de hashes recolhido da árvore avaliada.

## 4. Comparação física por pacote

Comparar o pacote canônico na referência e na árvore avaliada, considerando caminho exato no lock e identidade nome/versão. Percorrer todos os arquivos regulares, inclusive extensões desconhecidas e ocultos; comparar caminhos relativos, tipos, bytes/digest e bits executáveis relevantes. `node_modules` aninhado é fronteira de pacote sucessor e tem comparação própria, não descarte silencioso. Entradas extras, faltantes ou tipo divergente são MISMATCH. Não limitar a package.json, extensões JS ou arquivos alcançados pelo TypeScript.

Links não viram arquivos regulares: registrar alvo textual e resolução canônica; ciclo, link pendente/externo ou tipo não suportado retorna UNSUPPORTED, mantendo as recusas e os FAIL de produto já conhecidos. Nenhuma exclusão genérica de arquivos gerados ou pós-install. Saída legítima de lifecycle não reproduzida pelo recipe é MISMATCH/UNSUPPORTED até contrato específico, não exceção automática.

Pacote avaliado ausente na referência por plataforma/optional/peer/cache é UNAVAILABLE, com motivo explícito. Não excluir esse pacote do inventário303 para fazer o relatório parecer completo. Inventory novo também exige reconciliação; não fixar303 como teto. Erro de permissão, arquivo especial, corrida ou limite excedido impede MATCH e mantém evidência da causa.

Limites de produção deste componente, registrados no recibo:2GiB de payloads comprimidos,4GiB de arquivos regulares no total e512MiB por pacote,200.000entradas, profundidade64, até8processos próprios simultâneos e180s para a construção npm; comparação em streaming com teto120s. São tetos de recusa, não metas de uso nem garantia de isolamento de um npm hostil. Ao alcançar o teto, interromper com status explícito e inventário parcial marcado; nunca produzir MATCH por truncamento. A execução deve medir e reportar uso real. Fixtures podem reduzir limites em contexto explícito de teste; configuração de produção não pode elevá-los por CLI/env. Mudança dos valores exige nova revisão, não ajuste silencioso durante um teste.

## 5. Resultado e integração conservadora

Saída por pacote: `contentIdentity.status`, `referenceDigest`, inventários, diferenças e motivos; a versão do relatório deve tornar explícito que se trata de identidade apenas. MATCH requer comparação completa sem exceção ou erro. MISMATCH prova diferença, não necessariamente import de produto. UNAVAILABLE/UNSUPPORTED são ausência de prova.

Opt-in na API interna: `installedReference:{manifestPath,expectedSha256}`. CLI: `--installed-reference=<manifesto>` e `--installed-reference-sha256=<64hex minúsculos>`, sempre juntos; caminhos/arquivo não regular ou hash inválido são recusados. O default sem referência conserva o resultado da0228. Opções incompletas/inválidas falham estruturalmente; não ativam modo tolerante. Logs e JSON não expõem credenciais ou conteúdo de arquivos sensíveis.

**Todos os quatro estados mantêm `verified:false`.** Não remover `UNVERIFIED_INSTALLED_CONTENT`/drift ou diagnósticos existentes por causa de MATCH. Diferenças recebem detalhe adicional, preservando o motivo semântico original; não transformar bytes distintos em FAIL de produto sem evidência de produto. Produto literal/transitivo/link mantém FAIL e precedência sobre desconhecidos. Expansão de dependências e tripwires existentes permanecem ativas. `exceptionsApplied:false`, tabela inativa, normal=strict.

A fronteira da baseline continua INCOMPLETE. Nenhum novo resumo “identity passed” pode ser usado como aceite B6, como `passed:true` do gate ou como verificação semântica. O artefato final deve separar identidade de bytes, fechamento do grafo, receptores e runtime/consumidor.

## 6. Aceites congelados para BUILD

| ID    | Controle obrigatório                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID-01 | Referência correta de pacote sintético, conteúdo completo e igual: MATCH com todos os arquivos comparados, `verified:false` e gate INCOMPLETE.                                                                                                                   |
| ID-02 | Mesma versão/manifesto, corpo de implementação alterado: MISMATCH; instalado nunca recebe confiança nominal.                                                                                                                                                     |
| ID-03 | Arquivo extra, faltante, oculto, extensão desconhecida, tipo ou bit executável divergente: diferença visível, sem lista de exclusão permissiva.                                                                                                                  |
| ID-04 | Cache adulterado, SRI inválido/ausente, raiz/alias/inode da instalação avaliada como referência: recusar referência; não gerar MATCH. Proveniência do recipe é revisada pelo responsável, com limite contra operador malicioso explícito.                        |
| ID-05 | Lock/config/toolchain/recibo/digest esperado alterado ou referência parcial/timeout: invalidação explícita, sem fallback ou reutilização de veredito.                                                                                                            |
| ID-06 | Links internos/pendentes/ciclos/externos e pacote aninhado são registrados e tratados; link ou dependência que alcança produto conserva FAIL.                                                                                                                    |
| ID-07 | Concatenação dinâmica proibida em pacote byteidêntico ao artefato de referência continua INCOMPLETE; igualdade de bytes não aprova semântica.                                                                                                                    |
| ID-08 | Pedido de exceções, receptor trocado, produto literal e drift preservam todos os negativos0228 e a precedência FAIL/INCOMPLETE.                                                                                                                                  |
| ID-09 | Fixture de lifecycle tenta escrever sentinela e fixture de rede tenta contato; recipe não executa script nem abre conexão; offline ausente falha fechado.                                                                                                        |
| ID-10 | Optional/peer/plataforma ausente na referência permanece UNAVAILABLE com inventário intacto; limites não podem ocultar pacotes/arquivos.                                                                                                                         |
| ID-11 | Corrida de bytes/tipo/link durante coleta e depois da coleta invalida resultado; testes demonstram a recusa, não apenas timestamp nominal.                                                                                                                       |
| ID-12 | 156regressões originais, comparação de diagnósticos por ocorrência/objeto, normal/strict e grafo completo preservados; sem skips/todo/it.fails ou alteração de negativos para acomodar código.                                                                   |
| ID-13 | Inventário real cobre todos os303instalados anteriores e qualquer entrada nova, categorizando cada diferença/ausência; sem alegar MATCH geral quando houver indisponibilidade ou discrepância. Referência real tem recipe/bytes/proveniência e revisão próprios. |
| ID-14 | Typecheck/lint/npm test/PG/E2E/certify em Node22 e recursos próprios passam; consumidor público fresco sem produto/aliases, fontes/integridade finais, evidência, revisão independente e cleanup comprovados.                                                    |

First red deve demonstrar a falta/defeito da nova capacidade antes da implementação, sem alegar que a0228 já concedia PASS. Os negativos e fixtures anteriores são preservados. Os controles novos incluem positivos e erros reais de comparação/recipe, não mocks que apenas reproduzem strings do resultado.

## 7. Continuação e recuperação

Após aprovação deste hash: registrar claim de candidata/arquivos/gates e recursos próprios, ler0300/0301/0302, construir referência primeiro, executar controles e integrar a observação conservadora. Nenhuma certificação é iniciada em checkout compartilhado com alterações alheias. Conservar logs de primeira falha e snapshots; limpar somente processos/cache/snapshot/PG próprios, com identidade conferida.

P2 da frente continua exigindo prova da implementação/exports/loaders, identidade de receptores e espelhos compilados. A0234 não escolhe nem autoriza um mecanismo de supressão ou novo critério de PASS. HISO-005 só poderá fechar com a prova completa e nova B6, conforme0389. Integração ao principal e produção têm seus gates separados.
