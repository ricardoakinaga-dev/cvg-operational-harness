# Revisão independente — F01 / SPEC 0277 (ex-0274 do Codex), commit `e6a701ca9`

Revisora: sessão Claude D9. Revisão do **commit** `e6a701ca94d0d6c4726882ddddf40d8ac13daa3c` (branch `codex/aud0625-sandbox-build-20261029`, sobre `63fc9862`), numa cópia detached; a working tree do Codex não foi tocada. Node 22.23.2, `--maxWorkers=2`, carga 14–17, sem PG/Docker. Sem push. Produção segue `NO_GO`; esta revisão não fecha o 0222 gerenciado, o X01, o F02 nem o F05.

## Veredito: APPROVE (sem obrigatórios, 3 observações)

A mudança é pequena e certa: `normalizeDescriptor` (`packages/harness/src/capability-boundary.ts`) lê `sandbox` por `Object.getOwnPropertyDescriptor`, recusa propriedade que não seja de dados sem executá-la, recusa enum inválido, e grava o campo só quando é um dos 4 modos diferentes de `NONE`. O resto do caminho (`cloneDescriptor` por spread, `listDescriptors`, `resolveDescriptor`, `toTool`, `compositionFingerprint` por `stableSerialize`) propaga o campo sem mudança.

## Foco pedido

1. **Normalizer: 4 modos e enum inválido sem disparar getter.** `IN_PROCESS`, `WORKSPACE`, `PROCESS` e `EGRESS` voltam em `listDescriptors`, `resolveDescriptor` e no `ToolDefinition` do adaptador. `null`, `'UNKNOWN'`, `'workspace'`, número, booleano, objeto, array e `String` objeto são recusados (`invalid_descriptor`), o getter (enumerável ou não) lança sem ser lido (`accessor reads=0`), e uma propriedade herdada do protótipo cai na recusa de "plain object". Um `Proxy` é consultado **uma vez** (`getOwnPropertyDescriptor` de `sandbox`), então um valor que mudaria na segunda leitura não vale; mutar o objeto do chamador ou o clone listado depois do registro não altera o modo guardado ([probe-out.txt](proofs/probe-out.txt)).
2. **Fingerprint.** `WORKSPACE`, `PROCESS` e os outros modos têm fingerprints distintos (os 4 modos dão 4 valores); ausente, `undefined` e `'NONE'` dão o mesmo fingerprint legado `98f036d6…`, sem a chave `sandbox`.
3. **Fábrica pública sem gate ou com gate negado ⇒ o corpo não roda.** A matriz do Codex cobre 4 modos × 2 perfis (single_pass e iterative) × 6 resultados (sem gate, negado, indisponível, lança, handle com modo errado, permitido): o corpo roda uma vez só no "permitido", com o handle congelado e do modo certo, e `UNSAFE_REQUEST` nos outros cinco. `NONE` continua sem gate.
4. **Mutações numa cópia minha** ([mutations.txt](proofs/mutations.txt)): perder o campo (F1, 56 falhas), aceitar inválido (F2), aceitar acessor silenciosamente como `NONE` (F4), guardar `NONE` (F5), tirar `PROCESS` ou `EGRESS` do enum (F6, F7), perder o campo no clone (F8), aceitar `null` (F9), mapear `IN_PROCESS` para `NONE` (F10), ler o getter sem a guarda (F3b): todas **mortas**. Na pipeline: gate ausente liberando (G1) e `requiredSandboxMode` sempre `NONE` (G3) morrem. Sobrevivem duas equivalentes: F3 sozinha (a guarda de propriedade de dados lança antes da leitura) e G2 (o ramo `denied` é redundante com a recusa posterior de qualquer resultado diferente de `allowed`).

## Observações (não bloqueiam)

- **O1 (compatibilidade):** a mudança altera o fingerprint de qualquer composição que contenha uma capability com modo diferente de `NONE`, sem mudar `schemaVersion: 'capability-composition-v1'`. O `proposalHash` do efeito inclui esse fingerprint, então um efeito já proposto e ainda não confirmado, de uma composição assim, não reconheceria o mesmo hash depois da atualização. Hoje nenhuma composição de produção do repositório declara `sandbox` pelo registro de capabilities (as ferramentas `fs-tools`, `shell-tool` e `exam-egress` declaram o modo mas entram pelo caminho `tools`), então o efeito prático é nulo; vale uma linha no relatório do PR.
- **O2 (comportamento intencional):** qualquer capability registrada com um modo e executada sem gate passa a parar com `UNSAFE_REQUEST` (era executada como `NONE`). É o objetivo do F01; só vale avisar consumidores externos.
- **O3 (teste):** nenhum teste fixa que o `Proxy` é lido uma única vez; a sonda mostra que é assim. Um teste curto do contador de traps fecharia o ponto.

Nada disto muda o aceite. Pode seguir para o F05.
