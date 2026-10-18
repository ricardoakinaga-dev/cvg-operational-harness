# G01 — factories dinâmicas e contributors

Inventário T1, sob o [contrato](contract.json), da fonte oficial
`8d9f6466ff0294785d56f55b1fe363d132fe4133`. O objetivo continua sendo a
incorporação nativa integral ao harness. Este pacote produz contratos de fonte,
sem implementar ou qualificar runtime.

| Caminho                                      | Fronteira preservada                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Contributors](contributors/README.md)       | Registro, interfaces e executores das extensões de produção, separados de testes e de implementações externas arbitrárias. |
| [Pipelines](pipelines/README.md)             | MCP, callbacks dinâmicos, projeção de schemas, exposição e ferramentas hospedadas pelo provider.                           |
| [Acréscimos ao catálogo](catalog-delta.json) | Busca web standalone e busca hospedada são duas capacidades distintas.                                                     |
| [Preservação](catalog-preservation.json)     | Os 507 registros anteriores têm seus objetos JSON preservados byte a byte; catálogo passa a 487 funcionais e 22 controles. |

O primeiro recorte de contributors localizou nove implementações de produção,
e suas sete famílias inicialmente não expandidas passaram a ter trabalho
explícito sob [contrato adicional](contributors-expansion-contract.json).
O histórico inicial fica na lane do worker, separado da expansão corrente.
O recorte corrente expande as nove famílias e 32 ferramentas: skills, board,
goals, histórico do reviewer, history/notes, memória, cópia entre ambientes,
geração de imagem e web/run. Os 10 grupos de comandos de web/run e sua opção
response_length são obrigações explícitas; nenhum grupo foi reduzido a busca
textual. Esses nomes conhecidos estão resolvidos na fonte, sem prova de efeito.
Uma interface ToolContributor externa continua aberta a implementações
arbitrárias; o censo do repositório não fecha esse catálogo em runtime.

Registro, descoberta, exposição ao modelo e autorização são etapas distintas.
Cache MCP não é snapshot de autoridade: a preparação de chamada usa metadata
atual, mantendo a identidade anunciada. Projeção de schema para o modelo pode
ser permissiva e não equivale a validação de execução. Essas diferenças devem
ser preservadas e decididas na implementação CVG, sem importar grants do Codex.

O [verificador original](../../verify_increment.py) e seu resultado continuam
como checkpoint histórico de 485 funcionais. O
[verificador corrente](../../verify_current.py) valida a expansão aditiva,
os inputs anteriores e a nova revisão. Nenhum resultado histórico é reemitido
como aprovação de novas funções.

Permanecem pendentes a classificação completa dos componentes, variantes de
plataforma/estado, tipos e scalars ainda abertos, G02, G03 e a SPEC concreta
G04. Qualificação funcional `NOT_RUN`; G01 e o objetivo integral não concluídos.
