# G02 — pré-requisitos nativos em sysroot privado

Aquisição de dados para compilar a referência exata em Linux. Nenhuma instalação global, script mantenedor ou mudança de features/defaults/perfil/Cargo.lock. O CLI não foi executado.

O primeiro build offline chegou a `openssl-sys0.9.111` e falhou pela ausência de headers OpenSSL. A fonte `codex-rs/bwrap/build.rs` também exige `libcap` via pkg-config; o pacote de desenvolvimento estava ausente. O sandbox Linux original continua incluído: não foi usado `CODEX_SKIP_BWRAP_BUILD`.

O [contrato OpenSSL](contract.json) autentica `libssl-dev` e `libssl3t64`3.0.13-0ubuntu3.16amd64. O [contrato combinado](combined/contract.json) acrescenta `libcap-dev` e `libcap2`1:2.66-5ubuntu2.4amd64, reutilizando os dois archives OpenSSL autenticados sem novo download. O [relatório combinado](combined/acquisition.json) registra246entradas em sysroot privado, quatro packages e os hashes de cada arquivo/link.

Cadeia de origem: chave pública Ubuntu Archive2018, fingerprint `F6ECB3762474EDA9D21B7022871920D1991BC93C`, no keyring oficial já presente; gpgv verifica o InRelease noble-updates de18/10/2026; SHA256 e tamanho do índice Packages conferem com o conteúdo assinado; versão/arquitetura/caminho/tamanho/SHA256 dos quatro `.deb` conferem com esse índice. Downloads usam HTTPS no archiveUbuntu. Esses arquivos são dados de build; não há operação APTinstall ou postinst. [Status da assinatura](combined/gpgv.stdout.log).

Os helpers só decodificam `data.tar` com dpkg-deb. Todos os membros e links são inspecionados antes da extração com filtro de dados Python; caminhos absolutos/traversal/tipos especiais são rejeitados. Limites efetivos por scope4GiB/2CPU/128tasks/prazo600s, sem credenciais/home/configuração pessoal. Rede foi usada somente pela rotina fixa de aquisição; não há afirmação de allowlist de tráfego imposta pelo kernel. Downloads têm tamanho máximo, archives expandidos são limitados e os scopes próprios terminaram inativos. Não há quota de filesystem.

Uma primeira tentativa do helper terminou antes do child porque `execv` recebeu nome relativo para bwrap; o helper usa agora `/usr/bin/bwrap`. Logs/versão original/recursos dessa falha foram preservados. As aquisições seguintes passaram. Nenhum código de package foi executado: são somente headers/bibliotecas/dados extraídos.

O [adendo de build](../reference-compilation/native-build-addendum.json) vincula o relatório e a árvore readonly à compilação offline. OPENSSL_INCLUDE_DIR/OPENSSL_LIB_DIR e caminhos de include/pkg-config apontam ao sysroot privado, sem alterar opções de otimização/LTO/features do Codex. Programas mínimos confiáveis validam resolução de OpenSSL/libcap antes de upstream.

O pacote descreve recursos externos em `/tmp` por hash, sem afirmar que seus grandes arquivos estão embutidos no repositório. Os manifests e scripts permitem reconferência enquanto esses recursos existirem. Essa preparação não produz recibo funcional ou fechamentoG01/G02 e não aprova BUILD nativo CVG.
