# G02 — limite observado do REA para o ELF principal

Foi chamado o MCP REA inspect_binary_layout com path explícito do ELF original e detail summary, sem abrir/trocar alvo ativo ou executar o binário. O [resultado bruto](raw-result.json) retornou provider_unavailable: essa operação requer Python com pwntools4.15.0,pyelftools0.33 e Unicorn2.1.2, não configurado no provider solicitado.

Não houve instalação, configuração, repetição da chamada, stripping, truncamento ou troca do alvo. O reader Rust embutido também não foi chamado sobre esse arquivo:1477793024bytes excedem sua guarda de256MiB. A [disposição](disposition.json) preserva a evidência indisponível e a distinção de ferramentas.

O ELF/source/toolchain e seus headers/dynamic foram verificados por ferramentas ordinárias e pela proveniência do build; essas saídas não são REA Evidence. A análise MCP do helperbwrap permanece no [pacote próprio anterior](../auxiliary-bwrap-rea/README.md). O build principal e a sonda real keyless foram aceitos no recorte Linux/default, sem decompilação ou layout REA desse ELF, sem paridade CVG e sem certificação de release.
