# Adaptadores manuais e gramática Windows

Inventário T1 sob o [contrato](../contract.json). A fonte é o commit oficial
`8d9f6466ff0294785d56f55b1fe363d132fe4133`. O grafo CLI anterior permanece
intacto; seus quatro vínculos manuais recebem uma projeção adicional de fonte,
sem afirmar que clap foi expandido ou executado.

[inventory.json](inventory.json) preserva os corpos Args/FromArgMatches, as
declarações dos tipos delegados e seus campos com ownership original. Sete
mutações de argumentos são ligadas a campos reais: um conflito em
SessionTuiCli, quatro globais no exec e dois conflitos na TUI. A duplicação
da mesma mutação em augment/update de SessionTuiCli é conferida e contada uma
vez. Fields flatten/subcommand/skip conservam a classificação do grafo anterior;
copiar a lista do tipo delegado não significa achatamento efetivo da árvore.

ResumeArgs preserva a condição `raw.last && raw.prompt.is_none()`, os dois
ramos de conversão e a reconstrução no update; os demais wrappers atualizam
o valor interno existente. Oito casos futuros cobrem as combinações da
condição e da presença do primeiro posicional após parsing. Não são resultados
de execução do parser.

A gramática Windows inclui quatro campos, grupo obrigatório de identidade,
conflitos e dependência user→codex_home nas declarações. `--elevated` é
exigido por setup_level, depois do parsing. O despacho Windows só reconhece
setup no primeiro elemento do vetor, rejeita modo remoto antes de executar
provisionamento e só então persiste configuração. Fonte não prova efeito,
rollback ou semântica de identidade no host atual. Nomes de bypass continuam
sendo obrigações da referência, sem conceder autoridade ao runtime CVG.

Reprodução somente leitura, da raiz:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-adapters/schema/generate.py --check
```

Sem `--check`, o leitor grava apenas inventory, verification e manifest
nesta pasta. Usa somente a biblioteca padrão Python e duas funções de lexer
do pacote local já revisado, carregadas por AST; não importa código do alvo.
[verification.json](verification.json) registra regeneração, comparação de
objetos Git e onze controles negativos de adulteração. A reprodução exata é
uma verificação do extrator; revisão independente de conteúdo continua
necessária. O manifesto exclui seu próprio hash.

Limites: projeção lexical específica deste pin, sem rustc, expansão de macros,
avaliação cfg, execução clap ou semântica completa de conflito/herança.
Strings e atributos são evidência, não um schema JSON aceito. Scalar parsers,
plataformas, arg0, efeitos nativos, factories, tipos transitivos, autenticação
da referência executável e reuso continuam em seus contratos próprios.
Qualificação funcional `NOT_RUN`; G01 e o objetivo integral permanecem abertos.
