# SPEC 0228 — Recusa de confiança não comprovada no gate de isolamento

Data: 17/10/2026. Task de especificação: `B6-REMEDIATION-SPEC-20261017`. Task futura de implementação: `B6-REMEDIATION-BUILD-0228`, subordinada a **HISO-005/B1** da [carteira 0370](../03_build/0370_harness_product_isolation_backlog.md). Fontes: [B6/0619](../04_audit/0619_b6_stable_isolation_reaudit_2026-10-17.md), [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md), [SPEC0178](0178_harness_consumer_extraction.md) e [plano 0374](../03_build/0374_plano_producao_harness.md).

**Estado inicial: PROPOSTA PARA REVISÃO. BUILD NÃO AUTORIZADO.** Esta SPEC apresenta a primeira fatia conservadora de remediação dos achados B6-P1-01/02. Não afirma revisão técnica independente antes de recebê-la nem aprovação humana. O hash do pacote de decisão identifica a versão efetivamente submetida.

## 1. Decisão apresentada ao usuário

Retirar imediatamente do checker as duas formas de PASS que a auditoria demonstrou não serem justificadas:

1. Uma dependência instalada reconhecida no lockfile, mas sem prova do conteúdo e da fronteira de implementação, passa a ser **não verificada**. Metadados e um campo `integrity` de formato válido não dão `verified: true`.
2. A tabela atual de exceções deixa de suprimir diagnósticos. Não basta conservar linha/digest ou adicionar hashes aos mesmos dados sem revisar a identidade do receptor.

**Consequência aceita somente se esta SPEC for aprovada:** no snapshot `5a199668`, o gate normal deixará de produzir PASS e deverá produzir **INCOMPLETE**, com as incertezas explícitas. O runtime do harness continua com o mesmo código. Esta fatia elimina os falsos PASS reproduzidos; não entrega um novo gate geral verde nem encerra a B6. Não pode ser promovida a produção ou herdar a certificação da candidata estável.

Para voltar a conceder PASS sobre conteúdo instalado ou suprimir um escape, será necessário outro contrato de prova, com revisão e evidência próprias. Esta SPEC não aprova implicitamente esse mecanismo futuro.

## 2. Gate e autorização

Autoria/revisão documental: T1. BUILD proposto: **T3**, porque muda o contrato de confiança e o significado do resultado do gate de segurança. Pela [constituição operacional, D-12](../07_agents/AGENTS.md), T3 exige **“revisão explícita da SPEC pelo usuário antes do BUILD”**.

A SPEC0178 autorizou extração e correções específicas da resolução de loaders; não apresentou esta decisão de retirar a confiança terminal de instalações e a tabela de exceções. O atual pedido de avançar autoriza preparar esta unidade, sem registrar aprovação de uma SPEC que ainda não foi apresentada. O usuário pode aprovar, pedir ajustes ou rejeitar esta fatia concreta. Uma aprovação é restrita ao texto/hash submetido e não libera publicação, produção, dados reais ou integração externa.

## 3. Reconstrução do estado atual

Baseline de código: candidata estável `5a199668eef5db4ca7aa2adc3853169ca0953cbf`; checkout compartilhado `7ecc5b53` não é o alvo automático da implementação. A execução deve partir de candidata isolada derivada da baseline, preservando as linhas PARE100/Claude100 e os arquivos alheios.

Observações executadas na B6:

- Gate normal: PASS, 686 fontes, 303 pacotes instalados, zero diagnósticos/drift na instalação examinada. Com `--strict`: INCOMPLETE, 165 diagnósticos.
- Sondas físicas: caminho de produto concatenado dentro de pacote instalado recebe PASS, inclusive com versão divergente. O caminho literal completo é recusado.
- Sondas físicas: receptores locais substituídos de `shutdown.install(process)` e `vi.spyOn(globalThis, 'fetch')` recebem PASS mediante exceções; sem exceções, INCOMPLETE.
- Controle neutro sem instalado/escape: PASS; dependência direta do core para produto: FAIL.
- Prova independente da tabela por extração AST literal nesta rodada: **16 grupos, 15 IDs, 142 chaves, capacidade 192, 48 caminhos**. Dez grupos não possuem pin de cada arquivo chamador. O inventário de 10 grupos/169 ocorrências da auditoria de 07/10 pertence a outra revisão e não é reutilizado como denominador atual.

Evidências: [inventário corrente](../04_audit/evidence/B6-REMEDIATION-SPEC-20261017/exception-inventory.json), [sondas B6](../04_audit/evidence/B6-STABLE-20261017/probes.json), [pacotes instalados](../04_audit/evidence/B6-STABLE-20261017/vendor-probes-r2.json) e [baseline da SPEC](../04_audit/evidence/B6-REMEDIATION-SPEC-20261017/baseline.json). Não foi executado código de aplicação nesta etapa de especificação.

## 4. Limites da primeira fatia

Arquivos previstos, somente na candidata própria após aprovação:

| Caminho                                      | Mudança pretendida                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/boundary-manifests.mjs`             | Separar reconhecimento de metadados de verificação de conteúdo; nenhum instalado vira terminal verificado nesta fatia.                                                    |
| `scripts/check-product-boundary.mjs`         | Preservar a expansão de dependências e os controles conhecidos; remover a aplicação da tabela atual e manter as incertezas no resultado normal.                           |
| `tests/product-boundary.test.js`             | Regressões do contrato novo e incorporação dos controles B6; atualizar explicitamente expectativas antigas de confiança nominal/exceção, sem remover testes ou negativos. |
| Teste focal novo sob `tests/`, se necessário | Agrupar os negativos de confiança terminal e identidade de receptor, sem criar um checker paralelo.                                                                       |
| Runbook 0803, bloco do gate de fronteira     | Explicar o resultado normal INCOMPLETE e a ausência de aceite; não reformular os outros gates/B4 nesta unidade.                                                           |

Sem alteração de kernel, API/SDK, identidade, policy/approval, schema/migration, produto, lockfile compartilhado, Docker, dependência npm ou workflow de CI. Não implementar parser de tarball, consumo de cache npm, fetch de registro, manifesto de hashes gerado automaticamente, scanner JavaScript novo ou exceções novas nesta fatia.

B6-P2-01/03/04 continuam com seus owners; a prova local B6-P2-02 permanece válida para a baseline examinada e deve ser revalidada no candidato final pertinente. Esta unidade não os declara resolvidos.

## 5. Contrato proposto para dependências instaladas

### 5.1 Resultado do componente

`createInstalledPackageVerifier(...).verify(context, key)` continua retornando um objeto com `verified`, `reason`, `dependencies` e, quando houver, `drift`. Nesta fatia, **`verified` é sempre false para pacotes de terceiros instalados**. Workspaces e arquivos de primeira parte conservam sua classificação própria; não são convertidos em terceiros opacos.

| Condição observada                                                                     | Resultado proposto                                                                                                                              |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifesto/lock ausente, inválido ou identidade nominal incompatível                    | Conservar os motivos específicos já existentes; não verificado.                                                                                 |
| Metadados correspondem e versões coincidem                                             | `verified: false`, `reason: UNVERIFIED_INSTALLED_CONTENT`.                                                                                      |
| Identidade nominal corresponde, mas versão instalada difere da versão exata registrada | `verified: false`, `reason: INSTALLED_VERSION_MISMATCH`, com `drift` contendo pacote e versões. Não usar semver range para dispensar igualdade. |
| Conteúdo instalado contém referência conhecida a produto                               | Preservar a evidência do scan e o FAIL correspondente, independentemente do estado de metadados.                                                |
| Conteúdo opaco com caminho construído dinamicamente                                    | INCOMPLETE nesta fatia. Não afirmar aresta comprovada nem PASS.                                                                                 |

O texto de `source: package-lock.json` não pode sugerir conteúdo verificado quando apenas os metadados foram reconhecidos. Não é criado um estado intermediário que o chamador trate como `verified: true`.

### 5.2 Expansão e precedência

Um pacote não verificado **continua tendo suas dependências declaradas e links físicos visitados**. `settleInstalled` não pode interromper o percurso somente porque o verificador recusou confiança. `drift` deve ser registrado mesmo quando `verified` é false; remover o atual vínculo que o torna visível apenas no ramo de pacote verificado.

Preservar as classificações de link pendente, caminho fora do repositório, workspace, produto, referência literal e instalação aninhada. O alcance de uma violação conhecida não pode desaparecer atrás de um diagnóstico de conteúdo desconhecido.

Precedência de resultado permanece: **FAIL se há violação conhecida; INCOMPLETE se há incerteza e não há violação conhecida; PASS apenas sem ambas**. Erro de leitura, JSON ou estrutura inválida conserva o comportamento de erro próprio, sem virar coleção vazia ou sucesso.

## 6. Contrato proposto para exceções

Nenhum dos 16 grupos atuais pode remover diagnósticos no caminho normal desta primeira fatia. A alternativa de revisar somente os dois exemplos e manter as demais famílias por inferência foi rejeitada: a B6 demonstrou o defeito no critério de vinculação, e não apenas em duas linhas.

O resultado deve registrar `exceptionsApplied: false`, `exceptions: []` e conservar todos os diagnósticos de escape que o modo estrito produz para as mesmas fontes e ambiente, além dos diagnósticos adicionais de conteúdo instalado. Não é permitido modificar os motivos, apagar ocorrências ou elevar contagens máximas para obter um verde.

Contrato de invocação:

- CLI normal e `--strict` não aplicam as exceções atuais. `--strict` continua aceito por compatibilidade, sem caminho privilegiado inverso.
- A opção programática omitida ou `exceptions: false` usa o contrato conservador.
- Uma solicitação legada explícita `exceptions: true` não reativa a tabela: acrescenta o diagnóstico `UNAPPROVED_EXCEPTION_REQUEST` e permanece não aprovada, preservando eventual FAIL de violação conhecida.
- Não adicionar flag/env/configuração `allow-unverified`, autorização por caminho genérico ou repin automático. Dados históricos da tabela podem ser preservados como inventário inativo, sem autoridade de supressão.

Uma futura exceção válida precisará provar, separadamente, arquivo chamador integral, origem/binding do receptor e implementação efetivamente resolvida, configurações/manifests que alterem essa resolução, dependências materiais da justificativa e correspondência do espelho compilado quando existente. Igualdade de bytes prova identidade, mas **não demonstra sozinha que a justificativa é segura ou que a closure não importa o produto**. Nenhum desses critérios futuros concede exceção nesta fatia.

## 7. Prova exigida antes de confiança futura

O WHAT de qualquer fatia futura já fica delimitado; o HOW e sua implementação não são aprovados aqui:

1. **Identidade de artefato:** bytes instalados vinculados a referência independente e aprovada; pacote, versão, caminho, entradas físicas, links e entradas extras precisam ser tratados. Apenas copiar hashes da instalação sob avaliação não é uma prova independente.
2. **Fronteira semântica:** tratar a implementação/exports efetivamente alcançados e seus loaders, inclusive concatenação e runtime diferente dos tipos. Um tarball que corresponde ao SRI ainda pode conter um caminho dinâmico proibido.
3. **Exceção revisada:** binding e implementação que sustentam a justificativa, com negativos de troca de receptor/import/alias/corpo e de resolução física.
4. **Estado desconhecido:** falta de arquivo, parser/gramática não suportada, conteúdo opaco ou mutação não coberta produz INCOMPLETE, jamais confiança nominal.

Não se escolheu agora uma raiz de confiança nova, dependência criptográfica, formato de tar, repositório de proofs ou serviço externo. Isso evita registrar uma solução de supply chain ainda não implementável como se estivesse aprovada.

## 8. Aceites de implementação congelados

| ID     | Controle e resultado obrigatório                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B6R-01 | Fixture neutra sem instalado/escape: PASS. Import direto/transitivo de produto pelo core: FAIL, com caminho de evidência.                                                                                                                                           |
| B6R-02 | Pacote nominal presente no lock e mesma versão, mas somente metadados: `verified: false`; gate INCOMPLETE e motivo de conteúdo não verificado.                                                                                                                      |
| B6R-03 | Mesma fixture com versão divergente: não verificado, mismatch e drift visíveis; nunca PASS.                                                                                                                                                                         |
| B6R-04 | Fixture realista B6 com caminho concatenado e versões igual/divergente: não pode receber PASS; INCOMPLETE esperado sem alegar execução do corpo.                                                                                                                    |
| B6R-05 | Referência literal a produto e dependência declarada/link que realmente chega ao produto continuam FAIL, mesmo sob conteúdo não verificado.                                                                                                                         |
| B6R-06 | Pacote ausente, inválido, instalação aninhada, link pendente e alvo externo conservam recusa e evidência. Não transformar ausência de prova em zero dependências.                                                                                                   |
| B6R-07 | Dois controles B6 de troca de receptor recebem INCOMPLETE tanto no caminho normal quanto em `--strict`; não consomem exceção.                                                                                                                                       |
| B6R-08 | Nenhum grupo legado suprime diagnóstico. Comparação por ocorrência/motivo/arquivo demonstra preservação dos diagnósticos estritos, sem depender de um número estático para esconder novos casos.                                                                    |
| B6R-09 | Solicitar programaticamente `exceptions: true` acrescenta diagnóstico e não produz PASS nem enfraquece FAIL existente.                                                                                                                                              |
| B6R-10 | Baseline física `5a199668`: gate normal INCOMPLETE com installed/drift listados, zero supressões; todos os 303 instalados anteriormente alcançados continuam no inventário, ressalvada alteração física explicitamente explicada.                                   |
| B6R-11 | Os 145 testes de fronteira/consumidor são mantidos no inventário; expectativas antigas incompatíveis são alteradas como migração explícita do contrato, sem remover controles negativos ou usar skip/todo/it.fails.                                                 |
| B6R-12 | Typecheck, lint, suíte completa, PostgreSQL e E2E em Node22 passam na candidata isolada conforme T2/T3; recursos próprios, falhas e skips registrados. INCOMPLETE do gate de fronteira não equivale a falha desconhecida desses testes nem pode ser declarado PASS. |
| B6R-13 | Consumidor compilado por exports públicos sem produto/aliases continua passando no candidato final; API/worker/kernel/produto não sofrem mudança funcional por esta unidade.                                                                                        |
| B6R-14 | Saída completa e grafo são produzidos sem truncamento ou limite que omita fronteiras. Meta local de execução: até60s para a baseline B6; falha de desempenho exige diagnóstico, não corte do inventário.                                                            |

Os casos B6R-02/03 substituem a antiga expectativa de aceitação nominal; isso é a mudança de contrato sujeita a aprovação T3. Seus controles adversariais não são modificados para coincidir artificialmente com o código reparado. As sondas de B6 são preservadas, incluindo as medições iniciais corrigidas documentalmente.

## 9. Plano de construção após aprovação

| Unidade     | Entrega e dependência                                                                                                                    | Estado atual                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| B6R-SPEC    | Esta SPEC, inventário corrente, matriz de aceites, revisão técnica e pacote de decisão                                                   | Em preparação/revisão; sem BUILD.                             |
| B6R-BUILD-A | Candidata própria derivada de5a199668; baseline/hash antes de editar; novos negativos devem demonstrar os falsos PASS na versão original | NOT_RUN; depende de aprovação desta SPEC e claim de recursos. |
| B6R-BUILD-B | Recusa dos terminais de metadados e desativação da supressão; preservar expansão/drift/FAIL                                              | NOT_RUN; depende de BUILD-A.                                  |
| B6R-VERIFY  | Regressões, gates T2/T3, jornada compilada e revisão independente do diff; registrar todos os resultados                                 | NOT_RUN; depende de BUILD-B.                                  |
| B6R-HANDOFF | Novo SHA/hash de fontes, limitações e pedido de nova B6; sem modificar o selo da candidata anterior                                      | NOT_RUN; sem commit/push implícitos.                          |

O Build deve ler os documentos0300/0301/0302 e revalidar a SPEC aprovada, claims e origem do candidato. PG/E2E/certificação só em recursos próprios reservados. Certificação completa é exigida ao fim de rodada com código, mas não pode produzir liberação de isolamento com esta fronteira INCOMPLETE; registrar a limitação sem forçar verde. A integração ao checkout compartilhado não é automática.

## 10. Compatibilidade, falha e recuperação

Não há migração de dados. Mudam o resultado normal do checker e o significado de verificação instalada; consumidores de JSON/API interna precisam das regressões B6R. `passed` continua false para FAIL/INCOMPLETE; CLI continua exit0 apenas para PASS e exit1 para recusa normal, com exit2 para erros estruturais existentes. Nenhuma chamada a provider ou serviço é introduzida.

Não gerar artefato parcialmente validado como se fosse completo. Falha de leitura/corrida de arquivos invalida o resultado; a prova deve usar snapshot congelado e conferir drift antes/depois. A candidata certificada5a199668 e seus artefatos ficam preservados.

Recuperação de um BUILD falho ocorre somente na candidata própria: preservar o primeiro erro, parar processos próprios e entregar o estado da unidade. Não fazer restore/reset/stash/clean de arquivos de outro agente, não reativar automaticamente as exceções e não reinstalar uma regra permissiva sob o rótulo de rollback seguro. A versão anterior continua identificada como histórica, com os achados abertos.

## 11. Revisão e estado de decisão

O parecer técnico independente e os ajustes de autoria serão registrados em [evidência própria](../04_audit/evidence/B6-REMEDIATION-SPEC-20261017/). Uma crítica de implementação/segurança não é aprovação de produção. A assinatura técnica não substitui a revisão humana T3; nenhuma das duas será inferida de silêncio.

Próxima ação desta etapa: obter a revisão do contrato, fechar os apontamentos aplicáveis e apresentar ao usuário **este escopo conservador e sua consequência INCOMPLETE**, com SHA-256. Os critérios de implementação continuam NOT_RUN. B6/HISO-014 e produção continuam sem aceite.
