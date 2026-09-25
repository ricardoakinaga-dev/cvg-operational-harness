# M07 — Pedido de validação Discovery

Data: 23/09/2026  
Estado: `AWAITING_HUMAN_APPROVAL`  
Discovery: [0017_m07_package_dependencies.md](../../../../00_discovery/0017_m07_package_dependencies.md)  
Task: [M07 no backlog](../../../../03_build/0341_50_improvements_backlog.md)

## Resultado entregue

O inventário estático cobre manifests, exports, imports, project references, scripts de build e a diferença entre o grafo observado e o subgrafo neutro planejado. As conclusões distinguem caminhos de produção e de teste e não classificam discrepância de configuração como falha de build sem uma execução isolada.

## Escopo para a próxima fase

PRD de M07 deve fixar quais packages são públicos, qual resultado verificável será exigido para dependências declaradas, project references e exports, e como registrar exceções legadas. SPEC deve transformar esses critérios em slices pequenos, com compatibilidade de exports, preservação do candidate e verificações aplicáveis. Não está em análise qualquer autorização de produção, dados reais ou ação sensível.

## Decisão solicitada

Validar o Discovery de M07 como base suficiente para iniciar o PRD documental, ou registrar os pontos que precisam ser corrigidos na descoberta. Esta validação **não** aprova SPEC, BUILD, alteração de código, integração externa ou produção. O BUILD só poderá ser solicitado após PRD/SPEC aprovados, revisão humana e gate local próprio de M07.

## Checklist proposto

- [x] Problema, usuários, valor, escopo e limites descritos.
- [x] Imports e manifests classificados com contagem e direção observada.
- [x] Produção separada de testes; configuração estática separada de falha comprovada.
- [x] Arquitetura-alvo e divergências documentais registradas.
- [x] Limites, riscos e evidência não executada declarados.
- [ ] Decisão humana: aprovar Discovery M07 para PRD documental.

## Preservação e segurança

Sem BUILD, teste, build, serviço, rede, dado real ou ação sensível. G21-5/G21-6 permanecem fechados; produção `NO_GO`. O candidato histórico REM21-019 não cobre bytes ou task novos.
