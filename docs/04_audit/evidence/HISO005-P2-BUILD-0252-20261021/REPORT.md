# HISO005-P2-BUILD-0252: BUILD local da SPEC0252 (Annex B.3.3 no kernel B6, opção b1)

Claude Code, 22/10/2026, worktree detached `/mnt/dados/cvg-work/cvg-d9ef-annexb-recon-20261021`. Base `24cdb463` (kernel v7). A SPEC0252 r3 não mudou (sha256 `d1e20269…`). Comandos, sha256 e commits estão em [build.json](build.json); os operadores estão em [operators/](operators/common.py).

## Mudança

- **Commits:**
  - `1ed16fdb`: SPEC, recon e revisões r1–r3, sem alteração;
  - `b5a76d2d`: código;
  - `9a571d36`: correção do M1 da revisão de código r1 e reforço do teste;
  - `3e8275c2`: evidência.
- **Engine:** `semantic-kernel-v8-annexb-block-function`.
  - Um helper único, `strictPrologue`, lê o prólogo do arquivo e o do corpo de função.
  - `annexBBlockFunctions` aplica o predicado b1.
  - Em `load()`, logo depois da C0 e antes do corpo, cada módulo `require` emite uma tupla `UNKNOWN_ANNEXB_FUNCTION` com detalhe `nome@linha`, na passagem normal e no census.
  - Nada muda em `cjsUnknown`, `rules`, `usage` ou limites.
- **Teste novo:** `tests/b6-0252-annexb-block-function.test.js`, 165 casos.
  - 88 fixtures físicos: 43 da recon, C01–C15, D01–D11 e X01–X14.
  - Cobre AB01–AB06 e o census.
  - A tabela do prólogo tem 60 linhas, em quatro níveis: arquivo, corpo de função, bloco e corpo próprio.
- **Literal da versão:** migrado em 7 suítes B6: 0236, 0237 (2 ocorrências), 0240, 0241, 0244, 0245 e 0247.

## Aceites

| ID   | Resultado                                                                                                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AB01 | PASS. Na v7 dão PROVEN os 26 positivos, 11 positivos D e 6 positivos X. A primeira falha na v7 aparece em 109 de 141 casos na r1 e em 132 de 165 na r1b ([first-red.json](first-red.json)).                                                   |
| AB02 | PASS, 165/165. Nenhum dos 62 positivos dá PROVEN (37 da SPEC, 14 D e 11 X). Os detalhes batem com a b1 da recon e, no X, com a tabela escrita à mão.                                                                                          |
| AB03 | PASS. Os 10 negativos strict seguem PROVEN, sem tupla. N04, C06 e X12 (classe) não têm tupla. C08 segue PROVEN. C04 e C05 ficam UNKNOWN com `f@2`.                                                                                            |
| AB04 | PASS. O custo no catálogo da SPEC é exatamente N05–N09. Nenhum fixture ganha PROVEN.                                                                                                                                                          |
| AB05 | PASS. Nos 88 fixtures, o multiset é igual ao da base, fora a tupla nova. P16, P19, N10 e N11 mantêm a violação.                                                                                                                               |
| AB06 | PASS. Os controles do predicado passam e o census emite as mesmas tuplas nos 88 fixtures. As 60 linhas da tabela foram rodadas no Node 22 ([prologue-table.json](prologue-table.json)).                                                       |
| AB07 | PASS ([b6-final-comparison.json](b6-final-comparison.json), [base-vs-sealed.json](base-vs-sealed.json)).                                                                                                                                      |
| AB08 | PASS. Os 29 mutantes morrem ([mutants.json](mutants.json)), os gates passam (seção abaixo) e o crítico deu REVISE na r1 e APPROVE na r2 ([r1](code-review-r1/review.md), [r2](code-review-r2/review.md)).                                     |
| AB09 | Sem push, PR, deploy nem produção no BUILD. A promoção é do lead, por branch `candidate/*` e PR com os 5 checks obrigatórios verdes no SHA exato.                                                                                              |

## Mutantes (29, um por vez, bytes restaurados com sha256 conferido)

- **Lista da AB08 (18).** Cada mutante e o que o mata:
  - `own`: C01;
  - `any`: C02;
  - `arrow`: C03;
  - `ts`: C11 e D04;
  - `single-quote`: C07;
  - `all`: C08;
  - `removed`: AB01;
  - `normal-only`: census;
  - `block`: C12;
  - `expr`: C13;
  - `tpl`: C14;
  - `fnlate`: C15;
  - `evaluated`: P21 e P22;
  - `cooked`: P20;
  - `parens`: P27;
  - `outside-prologue`: P17;
  - `object-method-class`: P24;
  - `import`: N03.
- **Notas R3 (4):**
  - `tsonly`: D04;
  - `empty`: D01 e D02;
  - `fnsep`: D05, D06 e D09;
  - `textprefix`: D03a, D03e e D03f.
- **Revisão r1 (3):**
  - `computed-name`: X06, X07 e X10;
  - `trim`: linhas da tabela com espaço;
  - `includes`: linhas com prefixo e com `;`.
- **Extras (4):**
  - `no-recurse`: X13;
  - `cjs-unknown`: AB05;
  - `pos-line`: P06;
  - `no-generator`: C04 e C05.
- **Rodada interrompida:** a rodada sobre `b5a76d2d` parou em 6 de 6 mortos ([mutants-r1-interrupted.json](mutants-r1-interrupted.json)).

## Gates (Node 22.23.2)

- **Estáticos, todos PASS** ([gates-r1b.json](gates-r1b.json)):
  - prettier nos 9 caminhos tocados;
  - `eslint .`;
  - typecheck;
  - `skip:governance`;
  - `docs:check-links`, com a checagem de higiene da evidência.
- **B6 focal** (18 arquivos, 0228–0252): 1.153/1.153.
- **Perfil nativo:** 79/79.
- **`test:core`** com `CVG_TEST_SCOPE=core`: 6.554 casos, dos quais 6.319 passam, 0 falham e 235 são pulados, todos de PostgreSQL.
- **Consumidor fresco de `9a571d36`:** PASS, com 207 exports, 76 de runtime e 0 acessos à rede.
- **Não rodados:** certify, e2e e `test:postgres`. A certificação integrada é a do CI no PR de promoção.

## B6 na raiz `228e7918` (receita do BUILD0247 reconstruída, época r2)

- **Receita:**
  - worktree limpa para a referência instalada;
  - cache npm copiado e conferido por sha512 (299 payloads);
  - referências com escopo: 304 pacotes, 121 arquivos compilados, `shared-contracts-fresh-force-v2`;
  - medição protegida;
  - 1.410 de 1.410 entradas conferidas antes e depois;
  - 0 arquivos da raiz alterados.
- **Base v7 (`7f25da7d`):** 11.723 diagnósticos e 10.833 tuplas no normal e no strict, multiset igual ao selado. O payload difere do selado só em `compiledProvenance.referenceDigest` (`e4e4c39a…` contra `2d94ee8b…`), porque o manifesto da referência registra os caminhos do runtime. A receita, os arquivos e o compilador são os mesmos.
- **vN v8 (`a1ef8120`):**
  - 11.723 diagnósticos e 10.833 tuplas no normal e no strict;
  - payload igual ao da base fora a telemetria e `/semanticBoundary/kernelVersion`;
  - 0 provas e validation true;
  - normal = strict;
  - 0 tuplas `UNKNOWN_ANNEXB_FUNCTION`;
  - 229/256 contextos e 134.899/250.000 estados;
  - worker em no máximo 40,9% dos 300 s.

## Desvios e registros

1. **Leitura mais conservadora da §5.2 (M1 da revisão r1).**
   - Uma função só conta como strict quando a diretiva está no corpo dela.
   - O motivo: o nome computado de um método de objeto é código de fora. Sem a correção, X06, X07 e X10 davam PROVEN falso, e o Node carrega o produto. A b1 da recon tinha o mesmo defeito.
   - Classe continua strict em qualquer parte.
   - **Decisão do lead (22/10):** errata registrada aqui, sem r4. A regra só acrescenta UNKNOWN, não cria premissa nova nem PROVEN novo, e o crítico de código aprovou na r2 com ela. Os bytes aprovados da SPEC ficam como estão.
2. **Declaração sem nome.** Uma `FunctionDeclaration` em bloco sem nome entra com nome vazio, pela leitura literal da §5.2. Isso só acontece com erro de sintaxe, que já dá `UNKNOWN_PARSE`.
3. **Fixtures X fora do catálogo da SPEC.** Os 14 fixtures X têm os detalhes escritos à mão, porque a b1 erra 9 deles. O gerador não usa a coluna vN.
4. **Época r1 substituída pela r2.** Os artefatos da r1 têm sufixo `-r1`, e os `.gz` da r1 foram apagados. Não há cópias `--diag`.
5. **`skip:governance`.** O gate reescreve `certification/skip-inventory.json`. Os bytes do HEAD foram restaurados; o arquivo não entrou em commit.
6. **Notas R3-O4 a O6.**
   - O4: a gramática só roda sem UNKNOWN, o que não ocorre nem nos 88 fixtures nem na raiz.
   - O5: a tabela da §6 está malformada. Não foi corrigida porque os bytes da SPEC foram aprovados.
   - O6: classe é strict em qualquer parte; a `tools-wide` não emite no census, mas a vN emite (§5.1); os 18 da §1.3 são subconjunto dos 26 da AB01.
7. **Gitleaks (lead, 22/10).** No intervalo do PR, o gitleaks acusou `generic-api-key` em duas linhas de `operators/gen_test.py`. Eram falsos positivos, listas de IDs de fixture (`X04-computed-key-return`, `X01-computed-key-arrow`, …) na mesma linha. Nenhuma regra foi afrouxada. As duas listas passaram a ter um item por linha, e o gerador rodou de novo.
   - O teste gerado saiu igual byte a byte: sha256 `452c765a…16aa` antes e depois.
   - Mudaram só `observedAt` e `generatorSha256` em [test-generation.json](test-generation.json), de `cea0afb3…` para `5d90b3cf…`, e o mesmo sha em [build.json](build.json).
8. **Runtime.** Fica em `/mnt/dados/cvg-work/annexb-build0252-runtime/`; a worktree `eval-228e` foi removida. O executor não editou ledgers, cartões, coordenação nem outras SPECs; o lead registrou ledgers e cartão.
