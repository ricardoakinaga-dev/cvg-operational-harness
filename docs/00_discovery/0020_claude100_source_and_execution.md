# Discovery0020 — Paridade Claude100 verificável

Task `C100-G04`,17/10/2026; documentação T1. Direção estabelecida pelo pedido de implementação integral dos planos0381/0382/0383. Não altera domínio de produto nem concede gate de BUILD T3/T4.

## Problema e usuários

Operadores e desenvolvedores do Operational Harness precisam dos resultados das 16 famílias identificadas no Claude Code, com continuidade e controles verificáveis. A análise0618 encontrou componentes existentes/parciais e funções apenas anunciadas. Confundir existência de classes ou comandos com entrega esconde falhas de integração, recuperação e autoridade.

## Evidências e resultado

[G01](../04_audit/evidence/CLAUDE100-EXEC-20261017/G01-source-review.md) conferiu o binário2.1.302 e classificou134origens. [G02](../04_audit/evidence/CLAUDE100-EXEC-20261017/G02-oracles-and-access.md) especifica os protocolos e pendências de acesso. [G03](../04_audit/evidence/CLAUDE100-EXEC-20261017/G03-reuse-reconciliation.md) distingue entregas locais de reuso integrado. Nenhuma dessas provas concede paridade funcional.

O resultado integral conserva117resultados comparáveis e17controles obrigatórios, sujeito à expansão de variantes confirmadas, sem exclusão para fechar percentual. A primeira necessidade é uma medida rejeitável: aceitar uma observação autêntica correta, recusar adulteração e provar a jornadaM1 no mesmo candidato quando os pré-requisitos estiverem disponíveis.

## Restrições e incertezas decisivas

ADR010, dados sintéticos, contas/serviços somente com autorização específica, pipeline e gates D-12 permanecem obrigatórios. Núcleo não depende do Claude instalado. Persistência entre hosts, exportação versionada, poda de contexto e plano persistido têm discrepâncias abertas; acesso remoto e porta keyless da referência não foram demonstrados. Esses pontos são pendências atribuídas, sem substituição do alvo por mock.

## Encaminhamento

Problema e resultado já foram escolhidos pelo usuário nos planos. Rota proporcional: PRD inicial documental para a medida e jornada, seguido de SPEC da unidade exata; novo contrato de segurança/autoridade só entra em BUILD após revisão humana T3. Suporte privado T2 independente segue SPEC0230, sem esperar provisionamento remoto.
