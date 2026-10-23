# SPEC0252 — Função declarada em bloco no código sloppy (Annex B.3.3) no kernel B6

**PROPOSTA T3, revisão r3. Opção b1 escolhida pelo usuário em 21/10/2026; BUILD condicionado ao APPROVE do crítico independente sem obrigatórios** ([decisão](../04_audit/evidence/HISO005-P2-BUILD-0252-20261021/user-decision-20261021.json)). Premissa nova ou migração param e voltam ao usuário. Implementação: `HISO005-P2-BUILD-0252`, frente HISO005/B6, cartão [HISO005-P2-ANNEXB-RECON](../03_build/0370_harness_product_isolation_backlog.md). Origem: [recon T1](../04_audit/evidence/HISO005-P2-ANNEXB-RECON-20261021/REPORT.md) (crítico R2 APPROVE) e [achado do BUILD0247](../04_audit/evidence/HISO005-P2-BUILD-0247-20261020/finding-annexb-block-function.json). Autoridade: [constituição D-12/T3](../07_agents/AGENTS.md), [SPEC0236](0236_b6_semantic_boundary_proof.md) e [SPEC0247](0247_b6_cjs_export_soundness.md). Deve entrar antes da SPEC0246. A r2 aplicou o obrigatório e os opcionais O1–O9 da [revisão r1](../04_audit/evidence/HISO005-P2-BUILD-0252-20261021/spec-review-r1/review.md): detecção de strict começando no pai da declaração, quatro positivos novos (C01, C02, C03, C11) e mutantes nomeados com o fixture que mata cada um. A r3 aplica o obrigatório da [revisão r2](../04_audit/evidence/HISO005-P2-BUILD-0252-20261021/spec-review-r2/review.md) (prólogo de diretivas definido de forma fechada; positivos C12–C15) e os opcionais R2-O1 a R2-O3.

- Base: main `24cdb463`, kernel `semantic-kernel-v7-cjs-export-value`, engine `7f25da7d…`. As âncoras de linha são de `scripts/boundary-semantic-engine.mjs` nessa versão.
- Fixtures C01–C15 das revisões r1 e r2, versionados em [fixtures-c](../04_audit/evidence/HISO005-P2-BUILD-0252-20261021/fixtures-c/C01-own-strict-body/m.js) com sha256 em [fixtures-c-sha256.txt](../04_audit/evidence/HISO005-P2-BUILD-0252-20261021/fixtures-c-sha256.txt); o BUILD os copia para os testes.
- Números: [ocorrências](../04_audit/evidence/HISO005-P2-ANNEXB-RECON-20261021/occurrences.json) e [controles](../04_audit/evidence/HISO005-P2-ANNEXB-RECON-20261021/controls.json). Os IDs de fixture (P01–P27, N01–N15) são os de `controls.json`.

## 1. CURRENT — onde o kernel erra

### 1.1 A semântica que falta

Em código sloppy, o B.3.3.1 dá a uma função declarada em bloco, além da ligação do bloco, uma `var` no escopo de função mais próximo. No topo de um CJS, esse escopo é o wrapper do módulo. São dois efeitos:

1. **Criação na entrada do escopo var.** Se o nome ainda não é `var`, função ou parâmetro desse escopo, nasce uma `var` com `undefined` na entrada da função. Isso acontece mesmo que o bloco nunca seja avaliado. A `var` sombreia o nome externo em todo o escopo var, inclusive antes do bloco (P21, P22 e P23).
2. **Cópia na avaliação.** Quando a declaração é avaliada, o valor do bloco é copiado para essa `var` (P01–P05 e outros).

O B.3.4 vale também para `if (x) function f(){}` e `else function f(){}`.

O Annex B não se aplica em três casos:

- o nome é parâmetro do escopo var;
- um `let`, `const`, `class` ou `import` de mesmo nome fica entre o bloco e o escopo var, porque trocar a função por `var` daria erro antecipado;
- o código é strict.

`arguments` só não ganha `var` nova; a cópia na avaliação ainda o sobrescreve.

### 1.2 Âncoras em `scripts/boundary-semantic-engine.mjs` da main

1. **1408–1409.** `block()` predeclara a `FunctionDeclaration` só no ambiente `e` do bloco que está avaliando. A ligação de bloco já nasce com o valor da função.
2. **1563–1566 e 1568–1578.** `Block` e os ramos de `if` criam ambiente filho com `env(e, e.receiver)`, inclusive a cláusula sem chaves `[b]`. A ligação morre no fim do bloco.
3. **1517–1544.** A avaliação da instrução `FunctionDeclaration` não exportada não faz nada. Falta a cópia para a `var` do escopo de função.
4. **902–915 e 1865.** `call()` roda o corpo no ambiente dos parâmetros. O topo do módulo roda em `env()`, sem o wrapper CJS. Não há ambiente var separado do léxico, e por isso a `var` com `undefined` da entrada da função também não existe.
5. **754–758.** Antes e depois do bloco, `find()` sobe a cadeia e acha a ligação externa: a função de fora, a `const` ou a função declarada no topo do módulo, ou o parâmetro da função externa.
6. **965–978.** Nomes livres especiais: `undefined` vira `VOID`, `Object` vira intrínseco e `require` vira carregador (976–977). O nome que o Annex B tornaria `var` é lido assim.
7. **1548–1558.** `module.exports = x` lê `module` livre com `!find(e, 'module')`, outro nome especial. Hoje a C0 da SPEC0247 o cobre: um `module` declarado no arquivo dá `MODULE_REFERENCE`, e a escrita em função dá `FUNCTION_BODY_WRITE`; as duas deixam o valor U.
8. **O motor não conhece modo strict.** Não lê `'use strict'`, classe nem ESM para decidir a ligação.

**Violações falsas** (não são PROVEN falso):

- **N10, pela passagem normal.** Depois do bloco, `find()` não acha a ligação de bloco, que já morreu. O `require` livre vira carregador (âncoras 5 e 6) e a chamada com argumento finito carrega o alvo (1084–1090 → `edgeLoad` → `product`, 496–505). Sem a chamada, não há violação (N12).
- **N11, pelo censo.** `lexical()` (569–604), chamado em 703–718, só vê declarações diretas de cada escopo. Um `function require(){}` em bloco não sombreia o `require` lido fora dele. O efeito só aparece com argumento finito literal, mesmo com a função nunca chamada.

Nenhuma SPEC B6 (0236–0247) fala de Annex B, código sloppy ou modo strict. A K6 da SPEC0236 trata o bloco só como escopo léxico.

### 1.3 Efeito medido

**Fixtures.** São 43 fixtures em disco, rodados no Node 22.23.2 real: 28 positivos (o Node carrega `products/x.js`) e 15 negativos. Os 43 batem com a semântica esperada ([controls.json](../04_audit/evidence/HISO005-P2-ANNEXB-RECON-20261021/controls.json)).

- **18 PROVEN falsos** na main: P01–P05, P12–P14, P16b, P17, P20 e P21–P27. Os casos são:
  - bloco, `if (true)` com e sem chaves, `else` sem chaves, `if` que o kernel não decide e chamada no topo;
  - bloco dentro de função contra função, contra `const` ou contra função declarada no topo do módulo, e contra parâmetro de função externa;
  - método de objeto literal;
  - nome especial `undefined`;
  - `'use strict'` fora do prólogo, entre parênteses ou com escape;
  - `var` criada com `undefined` e bloco não avaliado ou lido antes (P21–P23).
- **8 positivos** já saem UNKNOWN por outra causa: switch, rotulado, try, catch, laço, `var` e nome que escapa sem conflito.
- **2 positivos** saem VIOLATION verdadeira: P16 e P19.
- **Negativos:**
  - 11 PROVEN corretos;
  - 2 UNKNOWN conservadores (N04 classe e N12);
  - 2 violações falsas (N10 e N11).

**Raiz real `228e7918`** ([occurrences.json](../04_audit/evidence/HISO005-P2-ANNEXB-RECON-20261021/occurrences.json)):

- Nos 1.341 arquivos que a B6 analisa, não há nenhuma função de bloco em código CJS sloppy. As 3 funções de bloco desse conjunto estão em 2 arquivos com sintaxe ESM.
- Também não há nenhuma nos outros universos:
  - os 1.349 arquivos de código entre os inputs;
  - os 3.874 arquivos rastreados, com 251 CJS sloppy;
  - os 7.859 `.js`/`.cjs` de `node_modules/`, com 432 CJS sloppy;
  - os 16 de `node_modules` aninhados.
- A B6 tem 0 provas. Nenhuma prova depende do defeito.

## 2. WHAT — garantia

- **G1.** O kernel nunca dá PROVEN quando o Annex B.3.3, o B.3.4 ou a declaração rotulada do B.3.2 pode mudar a ligação de um nome lido pelo código analisado. Isso vale antes ou depois do bloco, com o bloco avaliado ou não. Alcance: declarações presentes no texto dos módulos `require` analisados. O Annex B em código de `eval` (B.3.3.3), em código global (B.3.3.2) e via `Function`/`vm` fica fora da varredura sintática; esses casos já têm raiz própria (em CJS, `EVAL_REFERENCE` da C0; em geral, nome livre dá `UNKNOWN_BINDING`).
- **G2.** Código strict não muda: arquivo ou função com `'use strict'` no prólogo de diretivas (inclusive como segunda diretiva e herdado da função externa), corpo de classe e módulo ESM.
- **G3.** Na opção b, a regra só acrescenta raiz UNKNOWN: não cria PROVEN novo e não retira violação. Na opção a, corrigir o valor pode trocar uma violação falsa por PROVEN quando não houver outro UNKNOWN. A SPEC tem de listar esse efeito como mudança esperada e verificar cada caso contra o Node 22.
- **G4.** Na raiz real, tuplas e payload ficam iguais aos da base, fora a telemetria e o literal de versão. Normal = strict, validation true e zero provas.

## 3. Opções e custo medido

| Opção                                                                | Fecha os 18 PROVEN falsos dos fixtures                        | PROVEN corretos perdidos nos fixtures                | Tuplas novas na raiz real (A/B, 1.341 arquivos) | Risco de implementação                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| a) modelar o B.3.3                                                   | sim, se completo (previsto; precisa da `var` com `undefined`) | 0 (previsto); N10 só com o corpo, N11 só com o censo | 0 (previsto; não há ocorrência)                 | alto: muda o modelo de ambiente de K5/K6 (var e léxico), strict, parâmetros, bloqueio léxico, criação na entrada e cópia na avaliação, e `lexical()` |
| b) UNKNOWN em função de bloco sloppy **com conflito de nome**        | sim (medido)                                                  | 4: N06, N07, N08, N09                                | 0 (medido)                                      | médio: depende de uma análise de escopo completa para achar o conflito                                                                               |
| b1) UNKNOWN em **toda** função de bloco sloppy de módulo `require`   | sim (medido)                                                  | 5: N05 a N09                                         | 0 (medido)                                      | baixo: predicado local (pai sintático e prólogo de diretivas)                                                                                        |
| controle) UNKNOWN em toda função de bloco, sem olhar modo nem strict | sim (medido)                                                  | 11: N01–N03, N05–N09, N13–N15                        | 3 tuplas em 2 arquivos ESM (medido)             | baixo, mas viola G2                                                                                                                                  |

Como foi medido:

- **Fixtures.** As variantes b, b1 e de controle são cópias só-diagnóstico do motor (`tools-{b,wide,naive}` no runtime da recon). A regra só acrescenta `UNKNOWN_ANNEXB_FUNCTION`. Nos 43 fixtures, todas as outras tuplas e violações ficaram iguais às da main. As violações falsas N10 e N11 continuam nas três variantes.
- **Raiz real.** A/B com a mesma entrada para os quatro motores: starts do diag, origens vazias, sem referência instalada e compilado indisponível. O delta é contra a base.
  - Base, b e b1 deram o mesmo multiset de 10.761 tuplas (sha256 `25b59109…`), 0 provas e 229 contextos.
  - A variante de controle somou 3 tuplas `UNKNOWN_ANNEXB_FUNCTION`, em `node_modules/@vitest/utils/dist/diff.js` e `packages/persistence/src/__tests__/complete-process-support.test.ts`.
  - Não é a medição oficial, porque as referências da receita do BUILD0247 foram removidas com o runtime dele. A oficial tem 10.833 tuplas.
  - A diferença vem só da entrada: −288 `UNKNOWN_UNREACHED_INSTALLED_ENTRY`, +155 `UNKNOWN_INSTALLED_FILE_IDENTITY`, +46 `UNKNOWN_COMPILED_PROVENANCE` e +15 `UNKNOWN_INSTALLED_IDENTITY`.
  - O corpo analisado é o mesmo: 1.410 inputs, 1.341 módulos, 4.128 arquivos, 1.690.528 nós, 134.899 estados e 229 contextos.
  - A contagem sintática exata nos 1.341 arquivos dá o mesmo resultado: b 0, b1 0, controle 3 ocorrências em 2 arquivos.
- **Opção a.** Não foi implementada: seria o próprio BUILD T3. O custo dela é previsto pela contagem. Sem ocorrência na raiz, nenhum valor muda.

## 4. Escolha

**Opção b, na forma b1**, escolhida pelo usuário: toda função de bloco em código sloppy de módulo `require`, sem filtro de conflito. Motivos, pelos números:

1. Na raiz real, b, b1 e a custam o mesmo: zero tuplas. O padrão não existe em nenhum dos cinco universos, nem nos 432 CJS sloppy de `node_modules/`.
2. b1 fecha os 18 PROVEN falsos com um predicado local e fechado. Ele não depende de análise de escopo, que pode esquecer uma forma de declaração; em b, um esquecimento deixaria PROVEN falso.
3. b1 pega a criação com `undefined` (P21–P23) sem modelá-la. Uma opção a que modelasse só a cópia passaria nos casos de cópia e deixaria esses PROVEN falsos.
4. b1 custa só uma prova correta a mais que b nos fixtures (N05). Esse padrão tem zero ocorrência na raiz.
5. A opção a não traz ganho medido na raiz. Ela mexe no núcleo de K5/K6 e tem mais superfície para prova falsa nova. Fica como evolução se uma raiz futura tiver o padrão e o custo de b1 aparecer.

A alternativa b (com conflito de nome, §5.3) fica registrada só como referência; o BUILD implementa b1.

## 5. Contrato (opção b1)

### 5.1 Onde

Em `load()`, logo depois das categorias C0 da SPEC0247 e antes do corpo, só em módulo `require`:

- uma varredura sintática do arquivo;
- uma tupla `UNKNOWN_ANNEXB_FUNCTION` por função de bloco qualificada, com detalhe `nome@linha`, onde a linha é 1-based a partir de `getStart(sf)` (sem trivia), não de `pos`; como `unknown()` deduplica tuplas iguais, na prática é uma por par (nome, linha);
- na passagem normal e no census, como a classificação C0 da SPEC0247 (§3.1, item 1).

A regra é sintática, então pega também a criação com `undefined` de bloco não avaliado.

Âncoras do ponto de inserção na v7: modo `require`/`import` em 1821–1825, `UNKNOWN_MODULE_FORMAT` em 1826–1837, logo depois da C0 em 1858–1862.

A regra **não**: liga `module.cjsUnknown` (não dá U aos importadores, ao contrário da C0), acrescenta regra em `rules` da derivação, nem mexe em `usage` ou em limites. Só acrescenta a tupla.

### 5.2 Predicado (b1)

A regra pega a `FunctionDeclaration` com corpo quando vale tudo isto:

- o pai **não** é `SourceFile`, nem o `Block` corpo de função ou de bloco estático de classe, nem `ModuleBlock`. Isso inclui bloco solto, ramo de `if`/`else` com e sem chaves, `case`/`default`, rotulado, `try`/`catch`/`finally` e corpo de laço. Gerador e `async` em bloco entram também (no AST são `FunctionDeclaration`; o Node não lhes aplica o Annex B, então incluí-los é conservador, e C04/C05 já são UNKNOWN na v7);
- o código que **contém** a declaração é sloppy. A busca de strict começa no **pai** da declaração e sobe até o arquivo, olhando só: o prólogo de diretivas do arquivo; o prólogo de diretivas de cada função que contém a declaração, de qualquer tipo (declaração, expressão, arrow com corpo em bloco, método, getter/setter, construtor); e a existência de classe envolvente (corpo ou `extends`), que torna strict. É strict se algum desses prólogos tem a diretiva exata `'use strict'` ou `"use strict"`, ou se há classe envolvente; senão é sloppy.
- **Não contam** para strict: o prólogo do corpo da própria função declarada (C01); o prólogo de funções que não contêm a declaração, como uma irmã (C02); o tipo da função envolvente (arrow sloppy continua sloppy, C03); e a extensão do arquivo (`.ts`, `.cts` e `.mts` sem diretiva são sloppy quando rodam como CJS, C11).
- **Prólogo de diretivas**, definido de forma fechada e com a mesma regra nos dois níveis (arquivo e corpo de função): só existe no início do `SourceFile` e no início do `Block` que é corpo de função. É a sequência máxima de instruções iniciais que são `ExpressionStatement` cuja expressão é **literal de string puro** (`StringLiteral`, aspas simples ou duplas; não template, não parênteses, não outra expressão) e termina na primeira instrução que não é. Uma diretiva é strict só se o texto cru do literal, sem as aspas, é exatamente `use strict` (sem escape). Bloco que não é corpo de função não tem prólogo (C12); uma expressão antes da diretiva encerra o prólogo (C13: `0` antes de `'use strict'`); template `` `use strict` `` não é diretiva (C14); `'use strict'` depois de outra instrução no corpo de função não conta (C15), como no arquivo (P17). A implementação usa um helper único para os dois níveis, testado em tabela (inclusive `;` vazio antes da diretiva, escape e parênteses em corpo de função).

A comparação do prólogo é pelo texto cru. Diretiva com escape ou entre parênteses conta como sloppy, o que é correto e conservador. Módulo `import` fica fora (G2). Arquivo `require` com sintaxe ESM já recebe `UNKNOWN_MODULE_FORMAT`; a tupla nova só acrescenta.

### 5.3 Conflito (só na alternativa b, não implementada)

Para b, além do predicado b1, o nome tem que ter conflito, em lista fechada:

- declarado em qualquer escopo envolvente acima do bloco: `var` (inclusive içada), `let`, `const`, `function`, `class`, `enum`, `import`, `import =`, parâmetro (inclusive de função externa), parâmetro de `catch`, cabeçalho de `for` e nome de expressão de função;
- parâmetro do wrapper CJS: `exports`, `require`, `module`, `__filename`, `__dirname`;
- nome que o kernel resolve de forma especial quando livre: `undefined`, `Object`, `arguments`, `eval`.

Nome livre sem conflito já dá `UNKNOWN_BINDING` no uso (P18). Qualquer nome novo que o kernel passe a resolver quando livre entra nesta lista.

### 5.4 O que permanece

- **Violações falsas.** Nenhuma é PROVEN falso; b e b1 não as removem.
  - N10 vem da passagem normal. A opção a a corrigiria se modelasse o corpo.
  - N11 vem do censo. A opção a só a corrigiria se mudasse também o `lexical()` (569–604 e 703–718).
- Switch, rotulado, try e laço seguem `UNKNOWN_UNSUPPORTED_SYNTAX`, como hoje.
- A B6 segue INCOMPLETE. A regra global e as SPECs 0236–0247 não mudam.

### 5.5 Versão

A seguinte à da main no BUILD, com sufixo `annexb-block-function`. Sobre a v7: `semantic-kernel-v8-annexb-block-function`. Limites, perfil e receitas não mudam.

## 6. Aceites futuros — todos NOT_RUN

| ID   | Critério                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| AB01 | Primeira falha na base v7: os 26 positivos P01–P05, P12–P14, P16b, P17, P20, P21–P27, C01, C02, C03, C11, C12, C13, C14 e C15 dão PROVEN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AB02 | vN: os 37 positivos (28 da recon, C01, C02, C03, C10, C11, C12, C13, C14 e C15) não dão PROVEN; os 26 da AB01 têm `UNKNOWN_ANNEXB_FUNCTION` no arquivo da declaração, inclusive P21–P23 (bloco não avaliado ou lido antes). O multiset exato de detalhes por fixture é o da b1 da recon (`tools-wide`) e da revisão r1, por exemplo P06 `f@4`, P16 `undefined@1`, P16b `undefined@2`, P18 `g@1`, P19 `require@1`, P21/P22 `flag@5`, P23 `mode@5`, N05 `g@2`, N09 `f@4`, N10–N12 `require@2`, C01 `f@2`, C02/C03 `f@3`, C12 `f@2`, C13 `f@4`, C14 `f@3`, C15 `f@4`; os demais `f@2`/`f@3`. O BUILD fixa a tabela completa no teste.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AB03 | Negativos strict (N01 arquivo, N02 função, N03 ESM, N13 arrow, N14 herdado, N15 segunda diretiva, C07 aspas duplas, C09 strict no arquivo): PROVEN mantido, sem a tupla nova. N04 e C06 (classe e `extends`): sem a tupla nova. C08 (CJS sloppy só com funções no topo de arquivo e de corpo de função): PROVEN, sem tupla. C04/C05 (gerador e `async` em bloco): continuam UNKNOWN, agora com a tupla.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| AB04 | Custo declarado e exato: b1 perde só N05–N09. Nenhum outro PROVEN muda. (O custo da b, N06–N09, é só referência medida na recon com `tools-b`; a b não é implementada.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| AB05 | Em todos os fixtures, as tuplas e violações da base ficam iguais fora a tupla nova (multiset). P16, P19, N10 e N11 mantêm a violação.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| AB06 | Controles do próprio predicado: `if`/`else` sem chaves (P03/P26), `case` (P06), rotulado (P07/P08), catch (P10), laço (P11), método de objeto (P24), `'use strict'` tardio (P17), com escape (P20) e entre parênteses (P27) são pegos; função no topo de arquivo ou de função não é. A emissão no census é testada com `analyzeSemanticBoundary(input, { refusalCensus: true })`, como no teste da 0247.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AB07 | Raiz real `228e7918` com a receita oficial reconstruída. Base: v7 `7f25da7d` medida na mesma época e com a mesma receita; antes do A/B, a base tem de bater com o selado do BUILD0247 (11.723 diagnósticos, 10.833 tuplas, normal = strict), senão o BUILD para, como o BUILD0247 fez contra o selado do BUILD0245. vN: tuplas e payload iguais aos da base fora a telemetria e o literal de versão; normal = strict; validation true; zero provas; 0 tuplas `UNKNOWN_ANNEXB_FUNCTION`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| AB08 | Regressões B6 (0228–0247) preservadas, crítica fresca sem obrigatórios, gates Node 22 e consumidor fresco. Mutantes que têm de morrer, com o fixture que mata cada um: busca de strict a partir da própria declaração (C01); `'use strict'` em qualquer função do arquivo torna o arquivo strict (C02); arrow tratada como strict (C03); arquivo `.ts`/`.cts`/`.mts` tratado como strict (C11); só aceita aspas simples (C07: o mutante trata `"use strict"` como sloppy e emite a tupla, e a AB03 exige PROVEN sem tupla); marca toda `FunctionDeclaration`, inclusive no topo (C08); regra removida (AB01/AB02); regra só na passagem normal (teste do census, AB06); prólogo em bloco que não é corpo de função (C12); prólogo que não termina numa expressão que não é string (C13); template aceito como diretiva (C14); `'use strict'` tardio em corpo de função aceito (C15); tupla só com bloco avaliado (P21/P22); texto cozido em vez do cru (P20); parênteses aceitos (P27); diretiva fora do prólogo do arquivo (P17); método de objeto tratado como classe (P24); regra em módulo `import` (N03). |     |
| AB09 | Promoção só do delta próprio. O executor do BUILD não faz push, deploy nem produção; a promoção é o PR do branch candidato pelo lead, com os 5 checks obrigatórios verdes no SHA exato, sob a autorização da sessão (§8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 7. Riscos

- **Custo de precisão.** Funções de bloco sloppy sem efeito no valor viram UNKNOWN. Hoje o custo na raiz é zero. Uma raiz futura que alcance pacote CJS sloppy com esse padrão paga o custo; nenhum dos 432 CJS sloppy atuais tem o padrão.
- **Detecção de strict.** Errar para "strict" deixaria PROVEN falso. Por isso a regra usa só o prólogo de diretivas e a classe envolvente, e trata qualquer dúvida como sloppy.
- **Opção a, se escolhida.** Ela precisa modelar os dois efeitos do B.3.3.1 (§1.1), as três exclusões e o caso `arguments`. Também pode trocar violação falsa por PROVEN (G3).
- **Interação com a SPEC0246.** Esta correção deve entrar antes dela, como diz o cartão. Ela não muda P-REINO.

## 8. Decisão e gates

O usuário escolheu b1 em 21/10/2026 com a regra "BUILD após APPROVE do crítico". O BUILD segue os aceites AB01–AB09, em candidata própria, com a medição oficial da AB07 (receita oficial da B6 reconstruída, como no BUILD0247), gates Node 22, crítico de código independente, PR com os 5 checks obrigatórios verdes no SHA exato e merge sob a autorização da sessão. Nada aqui autoriza produção, release, dados reais ou deploy.
