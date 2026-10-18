# REA — inspeção estática do helper construído

Task `DX100-G02:REA-STATIC-AUXILIARY-ARTIFACT`. MCP `inspect_rust_binary` aplicado diretamente ao ELF próprio da referência, sem executar o alvo, abrir disassembler, iniciar provider nativo ou acessar a rede. [Contrato](task.json), [evidência bruta](raw-evidence.json), [resumo](summary.json) e [estado posterior](post-session.json).

O REA observou o mesmo SHA256 `6fca7901ff69153f99cb2636d4148727ecc417a90f248521756f922c880174b7`, tamanho2529192bytes, ELF64 little-endian/amd64 do [build do helper](../auxiliary-bwrap/REPORT.md). Evidence ID `ev_8b6411aa3cbafb7eb37abf6032d14111307f5a33c98b36e31056d6cd9394ef29`. O Lead comparou essas medidas com o arquivo real e os registros Cargo/manifest; [aceite delimitado](../../g02-auxiliary-bwrap-acceptance.json).

Não existe seção `.dep-v0`: a lista de dependências embutida é UNKNOWN, não vazia. O commit rustc59807616e1fa2540724bfbac14d7976d7e4a3860 foi inferido de uma string readonly e não autentica sozinho o compilador. A cadeia de source/toolchain/dependências vem do build e seus inputs autenticados, não desse indício lexical. O reader não recupera funções, tipos ou comportamento de runtime.

É um build próprio do source pinado, sem alegação de release oficial assinado ou reprodução bit a bit independente. A classificação de autoridade de bytes do provider não altera essa origem. Estado REA continuou `open:false`, sem provider selecionado; o binário não foi executado e o job CLI não foi alterado. Dados e strings do alvo permanecem não confiáveis como instruções. Todos os487+22requisitos continuam NOT_RUN,zero recibos,sem fechamentoG02/global ou BUILD funcional CVG.
