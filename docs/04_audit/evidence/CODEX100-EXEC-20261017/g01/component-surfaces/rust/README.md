# Componentes e targets Rust — fonte

Inventário T1 sob o [contrato](../contract.json), no pin
`8d9f6466ff0294785d56f55b1fe363d132fe4133`. O censo parte de todos os caminhos
Git, incluindo o workspace independente de lint fora de codex-rs.

[classification.json](classification.json) contém grupos de propósito e
ownership inspecionáveis. [inventory.json](inventory.json) liga cada grupo ao
manifest, aos arquivos de entrada/docs, às referências do catálogo e aos
consumidores declarados. Os grupos não são exclusões funcionais: suporte,
desenvolvimento, testes e proc-macros mantêm suas fontes e obrigações de build
ou capacidade; publish=false não apaga interfaces.

O leitor guarda tabelas de features, herança de workspace, dependências locais
e externas, tipo normal/dev/build e cfg de target, sem resolver Cargo. Também
retém flags e paths de lib/bin/test/example/bench e scripts de build. A seleção
do compilador e seus efeitos não foram executados.

As [convenções oficiais de targets Cargo](https://doc.rust-lang.org/cargo/reference/cargo-targets.html)
orientam o índice de arquivos candidatos. Targets declarados e candidatos de
diretório são registros separados. Candidatos desabilitados ou que colidem com
aliases declarados continuam visíveis; não há soma apresentada como quantidade
de executáveis compilados/instalados. Arquivos auxiliares em subdiretórios não
viram targets apenas por terem extensão .rs.

Declarações de visibilidade no nível raiz, atributos cfg/path/macro e corpos
main são evidência lexical. Não são expansão de reexports/macros, assinatura
completa de API Rust ou prova de disponibilidade em cada SO. Referências do
catálogo fora de pacotes Cargo são encaminhadas à integração não Rust.

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/rust/generate.py --check
```

`--check` só lê: duas gerações determinísticas, hashes/SHA-1 dos objetos Git,
manifesto e controles de adulteração. Sem a opção, grava inventory,
verification e manifest nesta pasta. [classification_recipe.py](classification_recipe.py)
materializa o agrupamento curado separadamente; seu uso deliberado não é um
teste de semântica dos grupos. O gerador carrega só duas funções de lexer
local já revisado, sem importar código do alvo.

Os negativos comparam a evidência à regeneração. Isso prova consistência e
vínculo com fonte, complementados por revisão independente; não prova
completude semântica geral. SDKs não Rust, efeitos, tipos/scalars/cfg/TUI e
oráculos continuam nos seus recortes. Zero recibos funcionais, sem fechamento
integral de G01, BUILD nativo ou paridade concedida.
