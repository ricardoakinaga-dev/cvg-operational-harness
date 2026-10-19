"""Applies the R2 corrections (R2-01 and R2-O01..O07) to the r2 drafts, producing r3. Every replacement must match
exactly once. usage: make_r3.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *


def apply(src, dst, pairs):
    s = (EV / src).read_text()
    for old, new in pairs:
        assert s.count(old) == 1, (src, old[:80], s.count(old))
        s = s.replace(old, new)
    (EV / dst).write_text(s)


P42 = [
("**PROPOSTA T3. BUILD ainda não autorizado.** Rascunho r2 da preparação T1",
 "**PROPOSTA T3. BUILD ainda não autorizado.** Rascunho r3 (correções da R2 aplicadas sem terceira rodada de crítica) da preparação T1"),
("[rascunho 0243](spec0243-r2.source.md)", "[rascunho 0243](spec0243-r3.source.md)"),
("mesmo zerando os 17.696 estados exclusivos dos arquivos dos helpers que estouram, sobram 107.764 estados, acima de 100.000.",
 "mesmo zerando os 19.008 estados exclusivos dos quatro arquivos dos helpers que estouram, sobram 106.452 estados, acima de 100.000."),
("Uma chamada a `compare()` depois da primeira finalização é recusada fail-closed com `COMPARISON_AFTER_FINALIZE`; na medição diagnóstica, o checker não faz nenhuma.",
 "Uma chamada a `compare()` depois da primeira finalização é recusada fail-closed com `COMPARISON_AFTER_FINALIZE`, e a recusa invalida o verificador inteiro: o resultado daquela chamada e as finalizações seguintes saem `UNAVAILABLE`. Na medição diagnóstica, o checker não faz nenhuma chamada assim. O teste ID-11 de `tests/b6-0234-installed-identity.test.js` continua verde."),
("A regra compara duas execuções nos mesmos inputs e com as mesmas referências instalada e compilada:\n\n- a v4 com os valores atuais;\n- a v4 com L1–L3.\n",
 "A regra compara duas execuções na raiz avaliada `228e7918`, com as mesmas referências instalada e compilada:\n\n- o commit-base da 0242 (§5), sem o delta;\n- o commit com L1–L3.\n\nAs referências são construídas uma vez, pela receita do commit-base, e lidas pelos dois lados. A 0242 não altera `boundary-semantic-compiled.mjs`, então o leitor compilado aceita o mesmo recibo nas duas execuções.\n"),
("Hoje essas pré-imagens só existem na candidata detached `d6203875`, que é BUILD0241 mais T2. A main, `3704e3f8` e `ae14b824`, ainda tem o kernel v3. A promoção dos caminhos do BUILD0241 e da T2 pelo lead torna a main elegível.",
 "Hoje essas pré-imagens só existem na candidata detached `d6203875`, que é BUILD0241 mais T2. A main (`3704e3f8`) e o commit documental `ae14b824` ainda têm o kernel v3. A promoção dos caminhos do BUILD0241 e da T2 pelo lead torna a main elegível.\n\nComposição com o [rascunho 0243](spec0243-r3.source.md), que altera `build-installed-reference.mjs`, `boundary-semantic-compiled.mjs` e `boundary-installed-identity.mjs`:\n\n- **Ordem fixa.** Se as duas forem aprovadas, a 0243 vem primeiro e a 0242 depois. Numa candidata compartilhada, cada delta é um commit próprio, nessa ordem.\n- **Base da 0242.** Para cada arquivo, vale a pré-imagem da tabela ou, se a 0243 já estiver no commit-base, a pós-imagem registrada na promoção dela, com o SHA-256 anotado.\n- **Só a 0242 aprovada.** A base é a tabela, e as referências vêm da receita atual."),
("Medições reais:\n\n- avaliam a raiz do BUILD0241 (`228e7918`), os mesmos inputs da T2;\n- usam referências construídas pela receita atual em `228e7918`, onde ela cabe no teto (margem medida de 22 MB), ou pela receita da 0243, se já estiver aprovada e construída;\n- as duas execuções da §3.3 usam as mesmas referências.\n\nA 0242 não depende da 0243 para o BUILD. As duas podem dividir a candidata, mas cada delta tem aceite próprio.",
 "Medições reais:\n\n- avaliam a raiz do BUILD0241 (`228e7918`), os mesmos inputs da T2;\n- usam referências construídas pela receita do commit-base: com a 0243 na base, a receita com exclusão; sem ela, a receita atual, que cabe em `228e7918` (margem medida de 22 MB);\n- as duas execuções da §3.3 usam as mesmas referências.\n\nCada delta tem aceite próprio, e cada conservação compara o commit anterior ao delta com o commit do delta."),
("| LB02 | Primeiras falhas preservadas: com os valores atuais, a raiz `228e7918` corta por `maxContexts`; uma fixture com etapa intermediária mais longa que o orçamento (reduzido pela opção de teste) leva a finalização final a `COMPARISON_TIMEOUT`; o teste A2 falha nos valores novos antes da migração.",
 "| LB02 | Primeiras falhas preservadas: com os valores atuais, a raiz `228e7918` corta por `maxContexts`; na pré-imagem, uma fixture com relógio simulado (stub de `performance.now`) e etapa intermediária mais longa que 120 s leva a finalização final a `COMPARISON_TIMEOUT`, ou o teste novo rodado contra a pré-imagem registra essa falha; o teste A2 falha nos valores novos antes da migração."),
("`compare()` depois da primeira finalização dá `COMPARISON_AFTER_FINALIZE`;",
 "`compare()` depois da primeira finalização dá `COMPARISON_AFTER_FINALIZE` e invalida o verificador;"),
("| LB07 | Regressões 0228/0234/0236/0237/0240/0241 preservadas;",
 "| LB07 | Regressões 0228/0234/0236/0237/0240/0241 preservadas, inclusive ID-11;"),
]

P43 = [
("**PROPOSTA T3. BUILD ainda não autorizado.** Rascunho r2 da preparação T1",
 "**PROPOSTA T3. BUILD ainda não autorizado.** Rascunho r3 (correções da R2 aplicadas sem terceira rodada de crítica) da preparação T1"),
("- **Compilada.** O archive usa uma de duas formas: a lista explícita de arquivos incluídos com `--literal-pathspecs`, ou uma única pathspec mágica constante do código, `:(exclude)docs/04_audit/evidence`, com ambiente limpo. Depois da extração, o conjunto de arquivos regulares precisa ser exatamente a lista incluída menos o que as regras `--exclude` atuais do tar removem. Divergência recusa com `COMPILED_DIRTY_SOURCE`.",
 "- **Compilada.** O archive usa uma de duas formas: a lista explícita de arquivos incluídos com `--literal-pathspecs`, ou uma única pathspec mágica constante do código, `:(exclude)docs/04_audit/evidence`, com ambiente limpo. Depois da extração e antes da cópia de `node_modules` para o snapshot, nenhum arquivo regular pode estar fora da lista incluída, e a igualdade atual de `sourceInputs` continua valendo. Divergência recusa com `COMPILED_DIRTY_SOURCE`."),
("A guarda estática roda primeiro, sobre a listagem completa do commit e os arquivos da raiz de origem. Ela vem antes de `validateConfigs`, `fingerprintResolution`, `sourceInputs`, `compilerInputs` e do archive.",
 "A guarda estática roda sobre a listagem completa do commit e os arquivos da raiz de origem. Ela vem depois da asserção de commit e das checagens de listagem da §3.2, e antes de `validateConfigs`, `fingerprintResolution`, `sourceInputs`, `compilerInputs` e do archive."),
("3. um `.npmrc`, ou um arquivo lido pelo fingerprint de resolução (`package.json` da raiz e dos workspaces, `package-lock.json`), cai sob o prefixo.",
 "3. qualquer `.npmrc` sob o prefixo (leitura estrita, mesmo que o npm não o leia), ou um arquivo lido pelo fingerprint de resolução (`package.json` da raiz e dos workspaces, `package-lock.json`) sob o prefixo."),
("| instalada | `usage.npmElapsedMs`, `recipe.observation.elapsedMs`, `recipe.observation.traceSha256` | variam a cada execução do npm |",
 "| instalada | `usage.npmElapsedMs`, `usage.maxProcesses`, `recipe.observation.elapsedMs`, `recipe.observation.maxProcesses`, `recipe.observation.traceSha256` | variam a cada execução do npm (pico amostrado, tempo e trace) |"),
("A medição B6 com as duas referências tem multiset de diagnósticos e de tuplas UNKNOWN iguais, salvo os digests das referências. Qualquer outra diferença é defeito.",
 "A medição B6 roda com o mesmo engine e os mesmos valores nos dois lados, porque a 0243 não altera o engine nem o checker. Com as duas referências, o multiset de diagnósticos e de tuplas UNKNOWN é igual, salvo os digests das referências. Qualquer outra diferença é defeito."),
("A base da implementação é definida pelo conteúdo, não pela ancestralidade. É o commit qualificado vigente que contém, byte a byte, as pré-imagens do BUILD0241 e da T2 listadas no rascunho da [0242 §5](spec0242-r2.source.md). Hoje elas só existem na candidata detached `d6203875`; a main (`3704e3f8`) ainda tem o kernel v3 e as receitas anteriores.",
 "A base da implementação é definida pelo conteúdo, não pela ancestralidade. É o commit qualificado vigente que contém, byte a byte, as pré-imagens do BUILD0241 e da T2 listadas no rascunho da [0242 §5](spec0242-r3.source.md). Hoje elas só existem na candidata detached `d6203875`; a main (`3704e3f8`) ainda tem o kernel v3 e as receitas anteriores.\n\nComposição com a 0242, que altera `boundary-semantic-engine.mjs`, `check-product-boundary.mjs` e `boundary-installed-identity.mjs`:\n\n- **Ordem fixa.** Se as duas forem aprovadas, a 0243 vem primeiro e a 0242 depois. Numa candidata compartilhada, cada delta é um commit próprio, nessa ordem. A base da 0243 é então a tabela de pré-imagens.\n- **Fora dessa ordem.** Se a 0242 já estiver promovida, a base usa a pós-imagem registrada na promoção dela para os arquivos que ela altera, com o SHA-256 anotado.\n- **Conservação.** Compara o commit anterior ao delta com o commit do delta. O engine e o checker são iguais dos dois lados."),
("A 0243 pode ser construída antes, junto ou depois da 0242, sem dependência de código. Cada uma tem aceite próprio.",
 "Cada delta tem aceite próprio."),
("| RS04 | Guarda e ordem: glob de workspace expandido sobre a árvore completa, chave ou link do lock, `file:`, `.npmrc` e manifesto de workspace sob o prefixo recusam com o código da §3.3, antes de qualquer outra checagem.",
 "| RS04 | Guarda e ordem: glob de workspace expandido sobre a árvore completa, chave ou link do lock, `file:`, `.npmrc` e manifesto de workspace sob o prefixo recusam com o código da §3.3, depois da asserção de commit e das checagens de listagem e antes de `validateConfigs`, `fingerprintResolution`, `sourceInputs`, `compilerInputs` e do archive."),
("| RS06 | Conservação da §3.6 em `228e7918`: só os campos da lista diferem; medição B6 com multiset de diagnósticos e tuplas iguais à da receita sem exclusão; normal e strict iguais.",
 "| RS06 | Conservação da §3.6 em `228e7918`, entre o commit anterior ao delta e o commit do delta: só os campos da lista diferem; medição B6 com o mesmo engine e os mesmos valores dos dois lados, multiset de diagnósticos e tuplas iguais; normal e strict iguais."),
]
apply('spec0242-r2.source.md', 'spec0242-r3.source.md', P42)
apply('spec0243-r2.source.md', 'spec0243-r3.source.md', P43)
print('r3 written', sha(EV / 'spec0242-r3.source.md'), sha(EV / 'spec0243-r3.source.md'))
