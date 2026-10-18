# G02 — dependências fixadas da referência Codex

Task `DX100-G02:ACQUIRE-LOCKED-REFERENCE-DEPENDENCIES`. Aquisição e análise de dados concluídas. Não é recibo funcional, fechamento G01/G02 ou implementação nativa do harness.

O [contrato](contract.json) precedeu as operações. A cópia física própria tem os mesmos 9.288 caminhos/bytes do pin `8d9f6466ff0294785d56f55b1fe363d132fe4133`, sem hardlinks ou alternates Git externos; [índice completo](source-snapshot.json). Links Git modo120000 são identificados pelo texto do link, com destino interno. Fonte original e lockfile permanecem intactos.

O Cargo1.95 oficial executou `cargo vendor --locked --versioned-dirs --no-delete` com diretório próprio, fonte/toolchain somente leitura, configuração privada e credenciais/hooks pessoais ausentes. Somente a fase de aquisição teve rede. Snapshot e help ficaram sem rede. Cada invocação confirmou limites reais de4GiB/2CPU/128tasks e prazo1800s antes da ferramenta. Disco foi monitorado com aborto próprio e reserva mínima; não houve quota de filesystem.

A [verificação das dependências](vendor-verification.json) vincula 1.311 pacotes remotos:1.293 archives registry autenticados pelos SHA256 do Cargo.lock e18pacotes Git dos oito commits completos fixados. Todos os78.372arquivos/metadados de vendor estão indexados no recurso próprio, por tamanho/tipo/hash. A [configuração de substituição](vendor-config.toml) preserva a saída original do Cargo.

A [prova adicional archive→vendor](archive-binding.json) confere76.302arquivos registry diretamente com os archives autenticados e741arquivos Git diretamente com checkouts limpos. O relatório identifica as omissões de metadados Git feitas pelo Cargo; nenhum membro adicional é aceito sem origem. Os18Cargo.toml Git normalizados pelo Cargo são registrados com hashes do original e do gerado, sem alegar igualdade literal. O catálogo funcional não é incrementado por arquivos ou dependências.

A primeira execução do verificador de vendor rejeitou o formato de log com URL mais checkout entre parênteses; [falha preservada](verification-r1.stderr.log). O parser foi corrigido para separar os dois campos. A primeira prova archive→vendor exigia igualdade de metadados que o Cargo omite, como `.gitignore`; [falha preservada](archive-binding-r1.stderr.log). A correção admite somente `.gitignore`, `.gitattributes` e `.gitmodules` ausentes, registra seus hashes e continua rejeitando membro de código ausente ou adicionado. Os relatórios finais foram produzidos após as correções.

Reverificação de dados, sem compilar ou executar o alvo:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/locked-dependencies/verify-vendor.py --check
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/locked-dependencies/verify-archive-binding.py --check
```

Esses comandos dependem dos recursos privados identificados no contrato. A portabilidade dos grandes arquivos externos não é alegada; seus descritores ficam no pacote. `--check` não regrava os relatórios.

As tentativas snapshot88eec05526, help9398baa3cc e vendor40530dd610 terminaram com exit0 e guardas observadas; nenhum código upstream/buildscript foi executado nesta aquisição. Nenhuma função recebeu PASS. A [compilação de referência](../reference-compilation/contract.json) possui contrato separado, sem rede; seus resultados pertencem àquela fase.

A documentação oficial descreve [vendor](https://doc.rust-lang.org/cargo/commands/cargo-vendor.html) e [source replacement](https://doc.rust-lang.org/cargo/reference/source-replacement.html). O checksum de membros gerado pelo Cargo é corroborado pelos archives/commits e pela identidade da ferramenta; não é tratado isoladamente como autenticação de origem.
