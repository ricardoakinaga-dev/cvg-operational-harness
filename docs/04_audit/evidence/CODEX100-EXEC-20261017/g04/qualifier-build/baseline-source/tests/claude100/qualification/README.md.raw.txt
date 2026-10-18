# Comparador inicial Claude100

Suporte privado de teste da task `C100-Q01-QUALIFIER-001`, conforme SPEC0229.
A aprovação humana autoriza esta implementação local e sintética. Ela não
aprova uma captura funcional, a jornada M1, contratos PAR adicionais ou produção.

O programa recebe sete caminhos explícitos. Todos os arquivos precisam estar
sob um diretório de evidências do operador; o diretório de saída precisa ser
novo, com pai existente dentro desse mesmo root.

```bash
node scripts/claude100-qualify.mjs \
  --manifest manifest.json \
  --catalog catalog.json \
  --rule rule.json \
  --capture-index capture-index.json \
  --authority-index authority-index.json \
  --evidence-root /tmp/meu-pacote-sintetico \
  --out resultado-novo
```

`capture-index` e `authority-index` são insumos separados fornecidos pelo Lead
após conferir a origem das capturas e a decisão real. Um hash vincula bytes;
a confiança nesse pacote depende do operador e da revisão independente. Este
verificador não cria credenciais ou autorização de runtime.

`EXACT_JSON` compara o documento inteiro usando CVG-CANON-1 e, se declarada,
a política fechada de metadados do kit privado Q03. `EXACT_BYTES` compara todos
os bytes. Outros artefatos declarados são verificados por integridade; uma
afirmação sobre outro documento exige regra própria. Não há execução de
expressões, seleção de campos, inferência semântica ou chamada de modelo.

O resultado é impresso em JSON e materializado em `report.json`, com cópias dos
inputs consumidos e projeções no diretório novo. Somente
`MATCH_REQUIRES_REVIEW` retorna exit0. Isso significa que o mecanismo encontrou
igualdade sob aquela regra e que a revisão segue pendente. Os demais estados
retornam exit1; erro de uso da CLI retorna exit2. Um erro de escrita preserva
os arquivos parciais para diagnóstico e exige uma saída nova na próxima rodada.

Somente `report.json` é um relatório publicado. Arquivos `report.pending.json`
e `report.blocked.pending.json` são estágios incompletos, mesmo quando contêm
JSON inteiro. O programa escreve e sincroniza esses estágios, fecha todos os
handles e então publica exclusivamente o estágio escolhido por hardlink. A
autoridade é reconferida de forma síncrona imediatamente antes dessa operação;
nenhuma limpeza posterior altera o resultado publicado. A publicação depende
de hardlinks locais no mesmo diretório e não promete sobrevivência a perda de
energia após a criação da entrada de diretório.

Projeções maiores que4MiB são materializadas integralmente em partes ordenadas
`reference.projection-000`, `reference.projection-001` e equivalentes CVG. A
lista `evidence.normalized` preserva essa ordem; concatenar os bytes de cada
lado reconstrói a projeção inteira. Cada descritor respeita o limite4MiB; partes
não precisam ser documentos JSON isolados. Nenhum valor/evento é omitido.

Namespaces de normalização são IDs e seguem o limite aprovado de128caracteres
ASCII. Antes de materializar um documento normalizado, o comparador estima um
limite superior de geração, sem transformar valores: até seis vezes os bytes
JSON de entrada, mais os tamanhos máximos das substituições de metadados. O
orçamento local de recurso é64MiB por projeção e256MiB por saída completa;
falha desse recurso pertence ao comparador e retorna INFRA_FAILURE. O kit Q03
continua sendo a única implementação da normalização. Uma expiração posterior
não mascara uma falha de escrita do próprio comparador.

`fixtures/wire-v1` contém exemplos fabricados, inclusive coletor e decisão
fictícios. Os testes usam esses dados exclusivamente para exercitar o mecanismo;
eles não são evidência funcional do Claude nem aprovação real de equivalência.
O catálogo é somente leitura e nenhuma task/família é promovida por este código.

Execute a suíte focal somente depois de qualificar o kit Q03 da mesma candidata:

```bash
node node_modules/vitest/vitest.mjs run tests/claude100/qualification \
  --no-file-parallelism --maxWorkers=1
```

Os gates gerais e a revisão independente seguem obrigatórios para o aceite da
unidade. A primeira qualificação funcional ainda depende do driver da referência,
acesso autorizado, regras dos cenários e M1 no mesmo candidato.
