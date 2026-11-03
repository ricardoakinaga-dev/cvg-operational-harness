# CI003 — testes do inventário e admissão do contexto

TaskTEST-ONLYT2 da mesmaCI003/0410, oferta1873169 e gateHOWR2 aprovado1859652. Autoria exclusiva de tests/coverage-project-inventory.test.js em candidata própria derivadafeeda7e8; móduloLead e dependências são inputs copiados byteexatos/readonly, não implementação desta folha.

## Aceites

- I1: três arquivos selecionados exatos, partição exclusiva/completa de inventários core/all com extras, contagens e ordem independente; dados não mutados.
- I2: omissão, duplicata, substituição, falta de cada selecionado e projeto errado recusados por razões explícitas.
- I3: admitCoverageContext aceita versão4.1.12/doisprojetos, pool custom, caps2/1, ordem0/1, isolamento, timeout/ambiente iguais ao root, sem browser/globalSetup/setupFiles e coverageV8 habilitada.
- I4: desvios de cada campo recusados antes de glob/start/import quando pré-admissão; erro de inventário/glob/fora de root recusa antes de qualquer execução. Checar causa específica, não exit1 genérico.
- I5: chamadas aos globs públicos fake reais da API, marcadores de start/import sempre zero, imutabilidade de configs/listas/metadados; helper não simulado.
- I6: mesmos testes rejeitam implementação conhecida incorreta em cópia isolada; resultados brutos/config/cache próprios e Node22/Vitest4.1.12.
- I7: patch só1testpath e hashesinputsPREPOST; contraexemplo real entregue ao autor sem alterar produção. AceiteCI003/S1–S7/global continua doLead.

Public API de inventário recebe strings relativas; contexto converte caminhos absolutos por root/globs. Outside-root inclui irmãos, subidas e o próprio diretório pai. Testes usam caminhos sintéticos, sem criar/importar módulos de aplicação, iniciar provider/worker ou acessar PG/Docker. Qualquer falha da API esperada pelo contrato é preservada como RED até reparo do autor; não adaptar oráculo ao bug.
