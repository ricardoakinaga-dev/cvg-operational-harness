# G02 — crítica independente R1

**ACCEPT_BOUNDED_PINNED_LINUX_REFERENCE_AND_OBSERVATIONS. Obrigatórios: 0.** Doze condições avaliadas; rodada 1/até 2, sem filhos. Aceite do ELF completo do CLI Linux/default compilado da fonte pinada e de suas observações delimitadas. **Cobertura comportamental da referência integral: PARCIAL, quatro comandos/nove observações.** Não fecha G02, cartões ou funções CVG.

Fonte `8d9f6466ff0294785d56f55b1fe363d132fe4133`, árvore `9825ae7625f19a030cb108aa92b075c59a04c63c`. ELF externo `/mnt/ia/cvg-codex100-exec-20261017/reference-target/release/codex`: **1.477.793.024 bytes**, SHA-256 `5cce726469af232c080355eff2a49ded7b6fbe26eaf7a702e6e15ce3e89f2605`. Recalculei o hash por streaming e li o cabeçalho ELF64 LE/x86-64; sem executar o binário. Os **21 inputs congelados coincidem antes/depois**, conforme [task.json](task.json) e [review.json](review.json).

| Condição | Avaliação | Resultado |
| --- | --- | --- |
| C01 | Immutable task inputs and artifact | Satisfeita no recorte |
| C02 | Source identity and input provenance | Satisfeita no recorte |
| C03 | Actual Cargo target, command, profile and features | Satisfeita no recorte |
| C04 | Recovery lineage and preserved failure | Satisfeita no recorte |
| C05 | Trusted observation origin and readonly boundaries | Satisfeita no recorte |
| C06 | Owned resource limits and preflight | Satisfeita no recorte |
| C07 | Raw transcripts and bounded outcomes | Satisfeita no recorte |
| C08 | Observed state transitions and synthetic home | Satisfeita no recorte |
| C09 | Exit and cleanup evidence | Satisfeita no recorte |
| C10 | First cause and incomplete evidence policy | Satisfeita no recorte |
| C11 | REA evidence disposition | Satisfeita no recorte |
| C12 | Claim boundary and residual coverage | Satisfeita no recorte |

O Cargo bruto contém 1.289 eventos de artefato, 1.288 fresh e um não-fresh, 111 build scripts e um build-finished success=true. Reconstruí byte a byte compiled-target-features.json. Comando efetivo: `/toolchain/bin/cargo build --frozen --release -p codex-cli --bin codex --jobs 1 --message-format=json-render-diagnostics`. Perfil original ThinLTO, debug line-tables-only, split-debuginfo off, strip=false, quatro codegen units; sem flags substituindo perfil/features. CLI features=[] é a ausência de features declaradas nesse target; as features transitivas estão no registro compilado. Rust/cargo 1.95.0 e quatro pacotes Ubuntu no sysroot privado têm cadeia de aquisição documentada; libcap preparado não comprova execução do helper separado.

A tentativa anterior 9149/1a7b continua falha: terminal -9, DISK_RESERVE_GUARD, sem OOM registrado. Os registros vinculados mostram cópia física própria conferida antes da remoção do cache antigo e retomada387a no /mnt/ia. Build387a terminal0, 2.525,503s, scope inativo. É uma linhagem com cache retomado; não demonstra recompilação independente idêntica nem release upstream assinado.

O coletor fica fora dos mounts graváveis do ELF; cada comando usa segunda namespace e pipes com close_fds. Conferi código preflight/run/driver/target-guard, oito controles SHA, cópias arquivadas e prefixos reais antes do alvo. Source/vendor/toolchain/native readonly no build; ELF/native/control/usr readonly na sonda, ambiente limpo, passwd/home sintéticos e rede sem rotas. Os prefixos brutos de cgroup mostram build18GiB/CPU4 e sonda4GiB/CPU2, ambos pids256/zero swap. Prazos, cap8MiB/saída e monitores foram inspecionados; limite de disco é monitor periódico confiável, não quota do kernel.

| Comando/caso | Evidência observada |
| --- | --- |
| --version | codex-cli 0.0.0 |
| --help | Saída real, exit0 |
| app-server --help | Saída real, exit0 |
| stdio: thread/list antes de initialize | -32600 / Not initialized |
| stdio: nome de cliente inválido | -32600 / invalid HTTP header; initialize válido posterior funciona |
| stdio: initialize válido | ID inteiro7; home privada; unix/linux; explicitGatewayOauth=true |
| stdio: initialize duplicado | -32600 / Already initialized |
| stdio: thread/list | data=[], readStates={}, cursores null |
| stdio: método desconhecido | -32600 / Invalid request |

São **quatro argv, nove observações**, seis requests/seis responses e uma notificação remoteControl/status/changed com status disabled. Reparseei stdio.stdout e comparei com capture.messages; conferi IDs tipados únicos, ausência de jsonrpc e hashes/tamanhos dos oito logs binários. Nomes de ferramentas/modelos/conta anunciados no help ou no erro não são requests executados. Não houve requests de modelo, ferramenta ou conta. Não há garantia de semântica i64 completa, todo RPC ou jornadas pelo simples ID7 observado.

Todos os quatro comandos têm exit0, forced_cleanup=false e secondary_failures=[]. Terminal da sonda24933/b9ab: exit0, primeira falha null, query_exit0, LoadState=not-found, ActiveState=inactive, ControlGroup vazio, cgroup REMOVED e cleanup_verified=true. Primeira causa/erros secundários/EOF/finally foram inspecionados estaticamente; os ramos de falha não foram executados nesta crítica. Não consultei nem controlei processos/scopes atuais. O sumário OBSERVED não substituiu os logs brutos.

Home contém config analytics/feedback desabilitados, installation_id correspondente à notificação e SQLite/WAL privados; auth.json ausente. Li cabeçalhos e hasheei arquivos, sem consultas SQLite ou alegação de integridade/persistência geral. Há metadata do host em OS/hostname; home sintética não significa anonimização da máquina.

**SAMPLING:** conferi independentemente 12 fontes, dois membros vendor, dois binários de toolchain e três membros native. A rechecagem de **9.288 paths e árvores completas** é atribuída ao verifier do build, cujo código/recibos li; não a refiz nem executei helpers. Não repeti verificação criptográfica de assinaturas nem reprodução do cache. Hashes dos dados brutos adicionais e da amostra estão em review.json.

| Fonte relativa ao upstream | SHA-256 da amostra conferida |
| --- | --- |
| `codex-rs/app-server-protocol/src/rpc.rs` | `78c516097c55b665e375807be6dcdceba232805c9ae9fa48420b0a537f0df705` |
| `codex-rs/app-server-protocol/src/protocol/v1.rs` | `e0642bd1bc7dbe5e24d508420471d705d5688efe8df3a8b40e3af22be55d7754` |
| `codex-rs/app-server-protocol/src/protocol/v2/thread.rs` | `8c10510bb88990aa0f0105e7a85c0bb7859db7232be29f84a6c66693600ef502` |
| `codex-rs/app-server/src/request_processors/initialize_processor.rs` | `4535560b07ab10d1538acd461560a55c1bdf0c9b4049e72775d6b770421f117f` |
| `codex-rs/app-server/src/message_processor.rs` | `4c26e4bc941a3f138c0f1193c7340ef1497e260f5056280d7881fb84ad007f42` |
| `codex-rs/app-server/src/error_code.rs` | `16d659572072b361931f554d326e052df4ab6af7eb04eb07ff6ef33f93c3a30a` |
| `codex-rs/cli/src/main.rs` | `743324d1f7bc5a0b6fc5192826a128b568fd7b22a0c13815d2813dee5330a5ae` |
| `codex-rs/utils/home-dir/src/lib.rs` | `1338259489ade54b01caa1468b6d25fc5a183657fa94cca0add8b91865635ef5` |
| `codex-rs/Cargo.toml` | `05c9740164aa212e1719bae3ad2ec50320b14480ac4171e11cc4ba77782c4f9c` |
| `codex-rs/Cargo.lock` | `6f63e126b80490d838f618f48a209ccaabe202d8dfd8c27d4ca692c7be4d6bfd` |
| `codex-rs/rust-toolchain.toml` | `570656042681cfd8795403a455baf9a33035331a07db0645e866bbcea89a3d64` |
| `codex-rs/cli/Cargo.toml` | `a19f6f4d367c8222b54d575414961a36d1f771f71a11e5f14aa748869d7ebfac` |

REA: inspect_binary_layout registrou provider_unavailable para pwntools-elf/REA_PWNTOOLS_PYTHON. Sem instalação, configuração, retry ou open_binary. Rust reader de256MiB não foi tentado no ELF de1,48GB; não houve recorte/strip para contornar. artifact-readelf.txt é evidência ordinária de shell/dados, não REA Evidence.

**Limites obrigatoriamente preservados:** equivalência com instalado0.163 UNKNOWN; outros binários/plataformas/opt-ins/SDK/modelo/tool/approval/restart/jornada integral e funções completas continuam abertos. Zero recibos funcionais, nenhum CVG feature BUILD, fechamento de cartão/G01/G02 global ou autoridade de release. Os campos NOT_RUN anteriores e Codex_binary_executed=false da fase de compilação não anulam as capturas posteriores, nem estas qualificam fases além do recorte. Lead recebe este parecer para integração; somente review.json e report.md foram escritos.
