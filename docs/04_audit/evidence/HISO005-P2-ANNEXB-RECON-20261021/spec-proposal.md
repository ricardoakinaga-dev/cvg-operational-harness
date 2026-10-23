# Proposta de SPEC — B6: função declarada em bloco no código sloppy (Annex B.3.3)

**RASCUNHO T1, não promovido. Não autoriza BUILD.** Saída da recon `HISO005-P2-ANNEXB-RECON-20261021`, revisão r2. A r2 corrige os obrigatórios M1 e M2 da [revisão r1](review-r1/review.json) e aplica os opcionais O1–O7.

- A correção é T3: D-12 exige revisão explícita do usuário antes do código.
- O número da SPEC fica com o lead. A 0246 está reservada; a próxima livre na main é a 0251.
- Base: main `24cdb463`, kernel `semantic-kernel-v7-cjs-export-value`, engine `7f25da7d…`.
- Origem: [achado do BUILD0247](../HISO005-P2-BUILD-0247-20261020/finding-annexb-block-function.json).
- Números: [ocorrências](occurrences.json) e [controles](controls.json).

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

**Fixtures.** São 43 fixtures em disco, rodados no Node 22.23.2 real: 28 positivos (o Node carrega `products/x.js`) e 15 negativos. Os 43 batem com a semântica esperada ([controls.json](controls.json)).

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

**Raiz real `228e7918`** ([occurrences.json](occurrences.json)):

- Nos 1.341 arquivos que a B6 analisa, não há nenhuma função de bloco em código CJS sloppy. As 3 funções de bloco desse conjunto estão em 2 arquivos com sintaxe ESM.
- Também não há nenhuma nos outros universos:
  - os 1.349 arquivos de código entre os inputs;
  - os 3.874 arquivos rastreados, com 251 CJS sloppy;
  - os 7.859 `.js`/`.cjs` de `node_modules/`, com 432 CJS sloppy;
  - os 16 de `node_modules` aninhados.
- A B6 tem 0 provas. Nenhuma prova depende do defeito.

## 2. WHAT — garantia

- **G1.** O kernel nunca dá PROVEN quando o Annex B.3.3, o B.3.4 ou a declaração rotulada do B.3.2 pode mudar a ligação de um nome lido pelo código analisado. Isso vale antes ou depois do bloco, com o bloco avaliado ou não.
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

## 4. Recomendação

**Opção b, na forma b1**: toda função de bloco em código sloppy de módulo `require`, sem filtro de conflito. Motivos, pelos números:

1. Na raiz real, b, b1 e a custam o mesmo: zero tuplas. O padrão não existe em nenhum dos cinco universos, nem nos 432 CJS sloppy de `node_modules/`.
2. b1 fecha os 18 PROVEN falsos com um predicado local e fechado. Ele não depende de análise de escopo, que pode esquecer uma forma de declaração; em b, um esquecimento deixaria PROVEN falso.
3. b1 pega a criação com `undefined` (P21–P23) sem modelá-la. Uma opção a que modelasse só a cópia passaria nos casos de cópia e deixaria esses PROVEN falsos.
4. b1 custa só uma prova correta a mais que b nos fixtures (N05). Esse padrão tem zero ocorrência na raiz.
5. A opção a não traz ganho medido na raiz. Ela mexe no núcleo de K5/K6 e tem mais superfície para prova falsa nova. Fica como evolução se uma raiz futura tiver o padrão e o custo de b1 aparecer.

Se o revisor preferir precisão, b é aceitável, com a lista fechada de conflitos da §5.3 e os controles N05–N09.

## 5. Contrato proposto (opção b1; b como alternativa)

### 5.1 Onde

Em `load()`, logo depois das categorias C0 da SPEC0247 e antes do corpo, só em módulo `require`:

- uma varredura sintática do arquivo;
- uma tupla `UNKNOWN_ANNEXB_FUNCTION` por função de bloco qualificada, com detalhe `nome@linha`;
- na passagem normal. O censo não precisa da tupla, porque a regra global já impede o PROVEN pela passagem normal. A SPEC decide se repete no censo, como a C0.

A regra é sintática, então pega também a criação com `undefined` de bloco não avaliado.

### 5.2 Predicado (b1)

A regra pega a `FunctionDeclaration` com corpo quando vale tudo isto:

- o pai **não** é `SourceFile`, nem o `Block` corpo de função ou de bloco estático de classe, nem `ModuleBlock`. Isso inclui bloco solto, ramo de `if`/`else` com e sem chaves, `case`/`default`, rotulado, `try`/`catch`/`finally` e corpo de laço;
- o código é sloppy: não há `'use strict'` ou `"use strict"` exato em nenhuma posição do prólogo de diretivas do arquivo ou de função envolvente (inclusive arrow e método), e não há classe envolvente.

A comparação do prólogo é pelo texto cru. Diretiva com escape ou entre parênteses conta como sloppy, o que é correto e conservador. Módulo `import` fica fora (G2). Arquivo `require` com sintaxe ESM já recebe `UNKNOWN_MODULE_FORMAT`; a tupla nova só acrescenta.

### 5.3 Conflito (só na alternativa b)

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

| ID   | Critério                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AB01 | Primeira falha na base v7: os 18 positivos P01–P05, P12–P14, P16b, P17, P20 e P21–P27 dão PROVEN.                                                                                                                                                                                    |
| AB02 | vN: os 28 positivos não dão PROVEN; os 18 da AB01 têm `UNKNOWN_ANNEXB_FUNCTION` no arquivo da declaração, inclusive P21–P23 (bloco não avaliado ou lido antes).                                                                                                                      |
| AB03 | Negativos strict (N01 arquivo, N02 função, N03 ESM, N13 arrow, N14 herdado, N15 segunda diretiva): PROVEN mantido, sem a tupla nova. N04 (classe): sem a tupla nova.                                                                                                                 |
| AB04 | Custo declarado e exato: b1 perde só N05–N09; b perde só N06–N09. Nenhum outro PROVEN muda.                                                                                                                                                                                          |
| AB05 | Em todos os fixtures, as tuplas e violações da base ficam iguais fora a tupla nova (multiset). P16, P19, N10 e N11 mantêm a violação.                                                                                                                                                |
| AB06 | Controles do próprio predicado: `if`/`else` sem chaves (P03/P26), `case` (P06), rotulado (P07/P08), catch (P10), laço (P11), método de objeto (P24), `'use strict'` tardio (P17), com escape (P20) e entre parênteses (P27) são pegos; função no topo de arquivo ou de função não é. |
| AB07 | Raiz real `228e7918` com a receita oficial: tuplas e payload iguais aos da base fora a telemetria e o literal de versão; normal = strict; validation true; zero provas; 0 tuplas `UNKNOWN_ANNEXB_FUNCTION`.                                                                          |
| AB08 | Regressões B6 (0228–0247) preservadas, mutante da regra morre, crítica fresca sem obrigatórios, gates Node 22 e consumidor fresco.                                                                                                                                                   |
| AB09 | Promoção só do delta próprio; sem push, deploy ou produção.                                                                                                                                                                                                                          |

## 7. Riscos

- **Custo de precisão.** Funções de bloco sloppy sem efeito no valor viram UNKNOWN. Hoje o custo na raiz é zero. Uma raiz futura que alcance pacote CJS sloppy com esse padrão paga o custo; nenhum dos 432 CJS sloppy atuais tem o padrão.
- **Detecção de strict.** Errar para "strict" deixaria PROVEN falso. Por isso a regra usa só o prólogo de diretivas e a classe envolvente, e trata qualquer dúvida como sloppy.
- **Opção a, se escolhida.** Ela precisa modelar os dois efeitos do B.3.3.1 (§1.1), as três exclusões e o caso `arguments`. Também pode trocar violação falsa por PROVEN (G3).
- **Interação com a SPEC0246.** Esta correção deve entrar antes dela, como diz o cartão. Ela não muda P-REINO.

## 8. Pergunta proposta para a decisão T3

"Aprova o BUILD local da SPEC de Annex B (opção b1), que faz o kernel B6 recusar com `UNKNOWN_ANNEXB_FUNCTION` toda função declarada em bloco em código CJS sloppy, fechando 18 provas falsas de fixture ao custo de 5 provas corretas de fixture e sem mudar nenhuma tupla na raiz real?"

Esta proposta não autoriza código, produção, release, dados reais, push ou deploy.
