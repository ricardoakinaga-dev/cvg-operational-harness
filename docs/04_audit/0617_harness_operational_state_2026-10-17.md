# 0617 — Estado de funcionamento do Operational Harness

Data: 17/10/2026. Task: `ANALISE-HARNESS-20261017` (Codex). Trilha T1, atividade AUDIT; análise documental e verificação sintética, sem implementação ou decisão de release. Baseline do checkout: `7ecc5b53944dcbc50fc26a95cfaec05bb1c62eb5`, branch `archive/local-audit-records-20261011`.

## Parecer

**O núcleo está funcional em testes e possui uma candidata estável certificada localmente. Produção ainda não tem GO; a linha de paridade permanece em construção.** Não foi observada uma pilha do harness em execução nas portas locais examinadas. O servidor do hospital e o CI remoto não foram acessados nesta rodada.

Há três identidades distintas:

| Artefato                    | Identidade                                                            | Evidência e alcance                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidata estável           | `candidate/core-20261017`, `5a199668eef5db4ca7aa2adc3853169ca0953cbf` | Certificação local anterior `CONDITIONAL_GO / AAA_CONTROLLED`; não inclui o trabalho em andamento do PARE100.                                                             |
| Checkout examinado          | `7ecc5b53`, `archive/local-audit-records-20261011`                    | Tipagem e 126 testes focados aprovados nesta rodada; difere da candidata em 58 caminhos sob apps/packages/scripts e manifests. Não recebe a certificação da outra branch. |
| Desenvolvimento de paridade | `codex/pare100-exec-20261014-6az3hlay`, `a72422be`                    | Tem implementações e aceites locais restritos; última suíte global arquivada falhou. Não é candidata de produção aceita.                                                  |

O parecer é I0, do próprio analista. Não constitui reauditoria independente B6/C10 nem aceite de isolamento, paridade ou produção.

## Critérios e método

Critérios congelados no claim antes dos testes: execução governada; coerência das provas e identidades; consumo independente do produto; operação local observável; pendências para produção e paridade. Expectativas: [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md), [barra 0373](../03_build/0373_barra_producao_harness.md), [plano 0374](../03_build/0374_plano_producao_harness.md) e [roadmap 0379](../03_build/0379_roadmap_paridade_100_deepseek.md).

Foram lidos código de composição, testes, manifestos, auditoria 0606, ledgers e provas de 17/10. Os testes desta rodada usam portas em memória e dados sintéticos. Não foram executados certify, cobertura integral, PostgreSQL, E2E, build da imagem, provider/canal externo ou instalação. Não houve alteração de código, configuração de ambiente, recurso existente, commit, push ou deploy.

## Funcionamento demonstrado

| Área                                         | Avaliação                               | Evidência                                                                                                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kernel e execução governada                  | Funcional no escopo testado             | Conformidade dos runtimes, aprovação/retomada, fechamento bloqueado, seleção de perfil e integração dos hosts: 126 testes, nove arquivos, zero falhas/skips nesta rodada.                                                                           |
| Tipagem do checkout                          | Aprovada                                | TypeScript com `--noEmit --incremental false`, Node 22.23.2, exit 0.                                                                                                                                                                                |
| Consumidor neutro                            | Jornada sintética funcional             | Testes da recepção e superfície pública aprovados; resposta determinística, consulta de fonte sintética, escrita retida para aprovação e handoff. Os testes usam resolução de fontes do Vitest; não são prova nova de pacote compilado sem aliases. |
| Persistência e operação da candidata estável | Demonstradas em prova local anterior    | 302 testes PostgreSQL; smoke 22/22: migração separada, sessões, API/worker, webhook, efeito aprovado uma vez, reuso, replay após restart, pausa/retomada e alerta assinado.                                                                         |
| Recuperação da candidata estável             | Demonstrada em prova sintética anterior | Restore preserva contagens e cadeia de 16 eventos; dois controles de adulteração são detectados. A própria prova declara perfil de API de teste.                                                                                                    |
| Imagem da candidata estável                  | Build e smoke locais registrados        | Imagens runtime/web construídas; execução com disco somente leitura, sem privilégios adicionais e sem capabilities. Não há digest de registro publicado nessa evidência.                                                                            |
| Isolamento formal                            | Pendente                                | ADR-010 ainda não declara aceite. Auditoria 0606 mantém B6 rejeitada com contraexemplos do verificador. Esta rodada não repetiu esses contraexemplos.                                                                                               |
| Integrações reais e ambiente hospitalar      | Não validados                           | Provider, canal e identidade externa constam `NOT_VALIDATED`; assinatura humana `PENDING` na certificação. Sem observação do servidor nesta rodada.                                                                                                 |

As provas anteriores pertencem à task Claude Code `CERT-CORE-20261017-F5`, não foram reexecutadas aqui. Foram conferidos o SHA da branch candidata, os 16 nomes de gates no log, os 22 resultados do smoke, a correspondência da imagem com o resumo e os controles de restore. Isso confirma coerência dos registros examinados, sem transformar a leitura em nova certificação. [Pacote original](evidence/CERT-CORE-20261017/README.md); [inspeção desta rodada](evidence/ANALISE-HARNESS-20261017/inspection.json).

A certificação anterior registra **3.468 unitários, 302 PostgreSQL e 12 E2E aprovados, zero skips e 16/16 gates**. Registra também uma vulnerabilidade HIGH da imagem aceita pela política A4 naquela rodada; não foi feita consulta atual de vulnerabilidades e esse aceite não equivale à ausência de risco.

## Estado operacional local

Na captura desta rodada, `docker ps` mostrou apenas `cvg-pare100-217-pg`, banco de testes existente que foi preservado. A inspeção dos listeners não encontrou o harness em 3000, 3100, 3400, 3401, 3410 ou nas portas examinadas de certificação. A porta 4173 estava ocupada por um processo Python. Esta é uma observação pontual desta estação, não um diagnóstico de indisponibilidade do hospital nem uma varredura de todos os ambientes possíveis.

O shell usa **Node 24.20.0** por padrão. A execução real do preflight recusou essa versão (exit 1); com **Node 22.23.2** passou (exit 0). Tipagem e testes desta análise usaram explicitamente Node 22. O ambiente deve selecionar a versão de `.nvmrc` antes dos gates; não é necessário mudar o código para resolver essa diferença. [Recibo](evidence/ANALISE-HARNESS-20261017/node-preflight.json).

## Lacunas e prioridades

| ID      | Prioridade | Constatação                                                                                                                                                                                       | Encaminhamento e aceite                                                                                                                                   |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AH17-01 | P1         | A certificação pertence a `5a199668`; o checkout e a linha PARE100 têm diferenças materiais.                                                                                                      | Trilha 0374: usar a candidata congelada e provar CI no mesmo SHA e imagem antes do release. Não transferir o selo para outras linhas.                     |
| AH17-02 | P1         | Independência estrutural existe, mas o aceite formal do isolamento continua aberto. Há achados anteriores de soundness do gate; zero violações não substitui a resolução desses achados.          | HISO-005/009/010/014 e B6: reproduzir/encerrar os contraexemplos e revisar a evidência corrente antes de atualizar a ADR-010.                             |
| AH17-03 | P1         | Faltam provas no ambiente de destino e decisão final do núcleo. Os artefatos on-premises existem, mas arquivos de deploy não demonstram instalação ou operação.                                   | 0374 C1–C10: executar a preparação e o smoke no servidor, validar segredos, identidade, backup e alerta; C10 avalia as dez condições no mesmo SHA/digest. |
| AH17-04 | P2         | A versão Node padrão desta sessão é incompatível com os gates oficiais.                                                                                                                           | Selecionar Node 22.23.2 conforme `.nvmrc`; aceite é o preflight verde na sessão que executará os gates.                                                   |
| AH17-05 | P2         | Documentação de entrada está defasada: README apresenta estado de 03/10 e HARNESS_OVERVIEW descreve apenas execução de uma decisão, embora a fábrica atual selecione `single_pass` e `iterative`. | HISO-002/documentação: reconciliar os ponteiros com os estados atuais, mantendo datas e escopos das provas. Não reescrever documentos congelados.         |

AH17-02 e AH17-03 são pendências conhecidas reidentificadas, não novas reproduções de defeitos nesta rodada. Não foi demonstrado defeito funcional novo nos 126 casos executados.

## Paridade com DeepSeek

O [plano aprovado 0379](../03_build/0379_roadmap_paridade_100_deepseek.md) usa 266 capacidades: análise por leitura registrou nove presentes, 76 parciais, 175 ausentes e seis divergentes/N/A; cerca de 18% é uma estimativa indicativa, não uma medida executada de paridade. Não foi recalculada nesta análise.

A [última suíte global arquivada do PARE100](evidence/PARE100-EXEC-20261014/global-units-static-r1/README.md) registrou **4.406 PASS, 44 FAIL e 282 SKIP**, além de falha de carga da fixture PostgreSQL dedicada. Os 44 casos incluem 43 falhas de qualificação e um caso afetado pelo bloqueio de rede. Isso impede aceite global; não demonstra 44 defeitos de runtime nem invalida automaticamente a candidata estável separada.

A [unidade de infraestrutura de testes da SPEC0224](evidence/PARE100-EXEC-20261014/test-resource-hardening-r1/README.md) terminou `REVISE/TH06`: finalizadores ainda podem perder a causa primária na limpeza. A [rota RESPONSE](0616_pare100_response_context_2026-10-16.md) tem aceite local restrito em memória, sem aceite PostgreSQL/global. Decisões humanas posteriores de 16/10 sobre SPEC0221/0222/0225 são as do [registro de gates](evidence/USER-DECISIONS-20261016/spec-gates.json); estados pendentes em documentos anteriores são históricos.

Esses trabalhos continuam no [backlog 0380](../03_build/0380_backlog_paridade_100_deepseek.md), sem transformar a conclusão dos cartões de paridade em pré-requisito geral da produção do núcleo. A separação das trilhas foi decidida pelo usuário.

## Próximo passo e limites

Próxima ação recomendada: **consolidar a pendência B6 sobre a candidata estável `5a199668`**, com reprodução dos contraexemplos e prova dos consumidores compilados. Publicação para CI e validação no servidor seguem pela trilha 0374, com a autorização de push exigida pelo repositório. A análise atual não solicita nem executa publicação.

O resultado desta task é `COMPLETED` para análise; o núcleo permanece com `CONDITIONAL_GO` local e sem GO de produção. Os estados dos programas de implementação permanecem nos backlogs canônicos. Não houve revisão externa nova, consulta remota, novo ensaio de carga, inspeção de dados reais ou medição de disponibilidade contínua.

Evidências desta rodada: [testes e resultados individuais](evidence/ANALISE-HARNESS-20261017/focused-tests.json), [comando e ambiente](evidence/ANALISE-HARNESS-20261017/focused-tests-receipt.json), [tipagem](evidence/ANALISE-HARNESS-20261017/typecheck-receipt.json), [inspeção e hashes dos insumos](evidence/ANALISE-HARNESS-20261017/inspection.json) e [preflight](evidence/ANALISE-HARNESS-20261017/node-preflight.json).
