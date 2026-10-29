# SPEC 0288 — Landlock aplicado de verdade e relatório honesto de contenção (PAR-X02)

Data: 29/10/2026. Estado: **PROPOSED_FOR_HUMAN_T3_REVIEW**. T3: muda o contrato de capacidades do sandbox, introduz um helper nativo e decide a imagem de execução. **Sem BUILD até revisão humana explícita.**

Task: `AUD0625-PAR-X02-SPEC-DF-20261029`. Cartão: PAR-X02 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md), "Landlock real e relatório honesto de contenção"). Origem: G2/SBX-03, SBX-07; absorve P100-024 e AUD0611-G02. Depende do PAR-X01 ([SPEC 0286](0286_par_x01_single_subprocess_service.md), BUILD do nível A com a Claude 07, recibo `human-decisions-19`). Base: `claude/aud0625-par-x01-07` @ `d83918312` (fatia 1 do X01). Autor: Claude DF. A revisão é de uma sessão não autora.

## 1. O que o cartão pede

- **Hoje:** `landlock` é inferido de `os.release() >= 5.13`; nenhum ruleset é aplicado; `requireLandlock` não prova nada.
- **Entrega:** probe de ABI por syscall e ruleset aplicado no processo filho, por um helper nativo pequeno; o campo deixa de afirmar suporte só pela versão.
- **Aceite:** sem ruleset aplicado, `requireLandlock` falha fechado; um teste nativo mostra escrita fora do workspace negada pelo Landlock.

## 2. Evidência atual (CURRENT, base `d83918312`)

| Fato                                                                                                                                                                                                                                                                                | Onde                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `hostProbe.probeLandlock()` só compara a versão do kernel com 5.13. O comentário admite que o Node não chama `landlock_create_ruleset` sem addon nativo.                                                                                                                            | `packages/sandbox/src/capabilities.ts`  |
| Nenhum código aplica ruleset: não há `landlock_restrict_self` no repositório.                                                                                                                                                                                                       | busca no repositório                    |
| `requireLandlock` checa só `capabilities.landlock`, o boolean derivado da versão. Com kernel ≥ 5.13, `IN_PROCESS` e `WORKSPACE` são concedidos sob "Landlock exigido" sem nenhuma regra ativa.                                                                                      | `packages/sandbox/src/gate.ts`          |
| Nos modos `IN_PROCESS` e `WORKSPACE` a ferramenta roda **dentro do processo do harness**. Landlock é por thread ou processo e irreversível (`landlock_restrict_self`); aplicá-lo ali restringiria o harness inteiro. Logo, `requireLandlock` **não pode** ser honrado nesses modos. | semântica do Landlock                   |
| Esta máquina de desenvolvimento (kernel 7.0) responde `landlock_create_ruleset(NULL, 0, LANDLOCK_CREATE_RULESET_VERSION)` com **ABI 8**; o LSM `landlock` está ativo.                                                                                                               | sonda local (Python ctypes, só leitura) |
| A imagem de execução (`Dockerfile`, estágio `runtime`, `distroless/cc-debian13:nonroot`) **não tem bubblewrap** nem shell. A execução contida de processos (`PROCESS`) cai em `unavailable` dentro do contêiner de produção. Hoje ela só existe no host de desenvolvimento e na CI. | `Dockerfile`                            |

## 3. Escopo

**Dentro:**

1. Um helper nativo mínimo, `cvg-landlock-exec`, que (a) responde à sonda de ABI e (b) aplica um ruleset recebido e faz `execve` do payload, dentro do bubblewrap e antes do payload.
2. Um relatório honesto de capacidades: `landlock` passa a significar "helper presente e ABI confirmada por syscall", nunca a versão do kernel, e o ABI e os direitos tratados aparecem no relatório.
3. `requireLandlock` com significado exato: só o modo `PROCESS` pode cumpri-lo, e cada lançamento prova a aplicação pelo canal de status.
4. O teste nativo do aceite.

**Fora:**

- Landlock para ferramentas em processo: não é possível sem restringir o harness.
- Regras de rede do Landlock (ABI ≥ 4) como única defesa de rede: o bubblewrap já faz `--unshare-net`. As regras de rede entram como defesa adicional quando o ABI permitir (§5.4).
- Cgroups e o nível B do X01.
- Mudar a imagem de produção sem a decisão D-C.

## 4. O helper

- Fonte em C no repositório (`packages/sandbox/native/cvg-landlock-exec.c`, ~200 linhas), sem dependências além da libc e dos cabeçalhos do kernel. Compilado estático no estágio de build. Nenhum pacote npm novo, nenhuma mudança no lockfile.
- Interface por argumentos e fd, sem variável de ambiente:
  - `cvg-landlock-exec --probe` escreve `{"abi":N}` no fd de status e sai com 0; ABI ausente sai com código próprio;
  - `cvg-landlock-exec --status-fd F --rules-fd R -- <argv>` lê de `R` um ruleset canônico pequeno (JSON com teto de bytes: caminhos e direitos), cria o ruleset com os direitos que o ABI conhece, adiciona as regras, chama `prctl(PR_SET_NO_NEW_PRIVS)` e `landlock_restrict_self`, escreve `{"applied":true,"abi":N,"handled":[...]}` em `F`, fecha `F` e `R` e faz `execve`.
- Qualquer falha antes do `execve` escreve `{"applied":false,"error":"…"}` e sai com código próprio. **Nunca** executa o payload sem o ruleset aplicado quando foi chamado para aplicar.
- O status vai pelo mesmo tipo de canal privado do X01 (I6). O payload não herda os fds.

## 5. Contrato

1. `SandboxProbe.probeLandlock()` passa a rodar o helper `--probe` (pelo serviço do X01, sem `child_process` fora dele: I1 da 0286). A versão do kernel deixa de ser critério.
2. `SandboxCapabilities` ganha `landlockAbi?: number` (inteiro ≥ 1). `landlock: true` exige `landlockAbi` definido. **Mudança técnica (T-1):** o campo existente mantém o tipo e só muda o significado. Nenhum consumidor quebra, e o significado fica mais estrito.
3. Gate:
   - `requireLandlock` em `IN_PROCESS` e em `WORKSPACE` passa a dar **sempre** `unavailable` ("Landlock não se aplica a ferramenta em processo");
   - em `PROCESS`, a concessão exige `landlockAbi ≥ ABI mínimo` (D-B).
4. Lançamento (X01): com `requireLandlock`, o comando passa a ser `bwrap … -- cvg-landlock-exec --status-fd F --rules-fd R -- <payload>`. O resultado do lançamento ganha `landlock: { applied: true, abi, handled }` lido do canal de status.
   - Status ausente, ilegível ou `applied:false` encerra como `spawn_failed`, com a causa, **antes** do payload; o helper só executa depois de aplicar.
   - Sem `requireLandlock`, o relatório diz `landlock: { applied: false }` em vez de silêncio.
5. Ruleset derivado do perfil de processo já aprovado (F02): leitura nos binds somente leitura; leitura e escrita só no workspace e no tmp do lançamento; execução só nos caminhos de binário do perfil. É sempre uma lista fechada, sem caminho vindo do payload.

## 6. Aceite e provas

| ID   | Prova                                                                                                                                                                                         | Controle que precisa falhar          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| XL01 | Com `--probe`, o ABI vem do syscall e não da versão. Kernel ou contêiner sem Landlock dá `landlock:false`.                                                                                    | Probe por versão                     |
| XL02 | `requireLandlock` em `IN_PROCESS` e `WORKSPACE` dá `unavailable`.                                                                                                                             | Concessão com Landlock reportado     |
| XL03 | Teste nativo: o payload sob o ruleset tenta escrever num caminho **gravável pelo bubblewrap mas fora da lista** (um bind de teste) e recebe `EACCES`. O mesmo payload, sem o helper, escreve. | Helper que não chama `restrict_self` |
| XL04 | Status ausente ou `applied:false` dá `spawn_failed` antes do payload (sentinela do payload não criada).                                                                                       | Executar sem status                  |
| XL05 | Ruleset maior que o teto, com caminho relativo ou com direito desconhecido: recusado antes do `execve`.                                                                                       | Parser permissivo                    |
| XL06 | O payload não herda o fd de status nem o de regras.                                                                                                                                           | fd herdado                           |
| XL07 | Relatório: `landlockAbi` e `handled` aparecem; o `reason` não afirma Landlock sem prova.                                                                                                      | Texto antigo                         |

Mutações: sem `restrict_self`, sem `NO_NEW_PRIVS`, ABI mínimo ignorado, `requireLandlock` concedido em processo e status ignorado.

## 7. Fatias do BUILD (para estimativa; não autorizadas)

1. Helper C com probe e aplicação, e testes nativos XL01/XL03/XL05/XL06 (cerca de 1 dia).
2. Contrato de capacidades e gate, XL02/XL07 (meio dia).
3. Integração ao lançamento do X01, depois da fatia 2 dele, com XL04 e mutações (meio dia).
4. Build do helper na CI e, se D-C autorizar, na imagem (meio dia).

## 8. Decisões para o Ricardo

- **D-A.** Helper em C estático, compilado no build a partir de fonte do repositório. **Recomendado: sim.** Alternativas: Python ctypes (exige Python na imagem, o que é pior) ou Rust (exige toolchain e crates novos, o que é pior para a cadeia de suprimentos).
- **D-B.** ABI mínimo para `requireLandlock`. **Recomendado: ABI ≥ 3** (inclui `REFER` e `TRUNCATE`; o ABI 1 deixa renomear e truncar por fora da regra). Usar os direitos de rede do ABI ≥ 4 como defesa extra, quando houver.
- **D-C.** Imagem de execução. **Recomendado: não mudar agora.** A imagem de produção continua sem bubblewrap e sem helper, e `PROCESS` fica `unavailable` lá, fechado e documentado. O helper e o bubblewrap entram só no build da CI e do desenvolvimento. Levar a execução contida para a imagem de produção pede uma SPEC própria, junto com o servidor (U10). Alternativa: adicionar bubblewrap e o helper ao estágio `runtime` agora.
- **D-D.** `requireLandlock` em `IN_PROCESS` e `WORKSPACE` passa a ser sempre `unavailable`. **Recomendado: sim.** É a única leitura honesta. Quem precisar de Landlock usa `PROCESS`.

Decisão técnica, sem gate próprio:

- **T-1:** `landlock` mantém o tipo e fica mais estrito, e entra `landlockAbi` opcional.

## 9. Limites aceitos

- O Landlock restringe acesso a arquivos (e rede no ABI ≥ 4). Ele não limita CPU, memória nem número de processos; isso é cgroup, no nível B do X01.
- Com D-C como recomendado, o contêiner de produção não executa ferramentas de processo. A defesa nesse ambiente é não executar.
- Um kernel sem Landlock é recusado quando o perfil exige Landlock, sem degradar em silêncio.
