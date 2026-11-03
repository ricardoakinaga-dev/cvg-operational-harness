# Alvo publicado para incorporação

O conector GitHub confirmou a `main` em `a2f345a3b7fac79f8a1506d369b9371f92e187c8`. A comparação com a candidata privada5be encontrou127 caminhos diferentes sob packages/apps/legacy/products:66alterações e61adições, incluindo54caminhos de produto. A incorporação usará somente os sete paths dos três componentes próprios, sem importar toda a branch.

O patch próprio derivado de feeda até5be passou em `git apply --cached --check`, combinado e por caminho, sobre índice temporário do alvo. As89160entradas do índice permaneceram idênticas; nenhum patch foi aplicado por esta etapa T1. A aplicação e as verificações posteriores pertencem à [unidade0312](../../../../02_spec/0312_codex_component_main_intake.md).

As415entradas de pacotes têm a mesma identidade name/version/resolved/integrity/link nas duas bases. O lock inteiro é diferente: a candidata doadora inclui uma dependência de desenvolvimento adicional do sandbox. Manifests e lock do alvo são preservados; igualdade de versões não concede igualdade de dependências ou aceite funcional.

Evidências primárias locais: `remote-main.json`, `source-comparison.json`, `seven-source-pins.json`, `patch-portability.json`, `dependency-disposition.json` e `verification.json`. Objetos Git de pares foram somente lidos; working trees, índices e referências de pares não foram alterados. A certificação5be continua separada. Recon concluído; promoção e paridade não concedidas.
