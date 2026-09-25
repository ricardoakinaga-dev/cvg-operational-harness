# M07 — Preservação do estado Gauntlet anterior

O diretório `.gauntlet/` já continha a execução independente `aud20-20260920-w1`, atualizada em 20/09 e ainda marcada `ACTIVE / FIX_RETEST`. O PID salvo no lock (`1223167`) não estava ativo na inspeção; a validação do estado retornou erro por drift e o resume permaneceu fail-closed. A execução antiga não foi reaberta, rebaselineada nem encerrada.

Para permitir um run isolado de M07 sem sobrescrever o anterior, o diretório foi movido integralmente para `.gauntlet-archive/AUD20-20260920-w1/`. Os SHA-256 dos seis arquivos antes e depois do movimento coincidiram:

| Arquivo | SHA-256 |
| --- | --- |
| `.writer.lock` | `bfa8aa95ce710061e5bdf31d525f1573713df4c9ad19aa99d7c4a3438f309a40` |
| `artifacts.jsonl` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `bar.json` | `19a5d0176f99472ef302f6aa75fc2d1793ee37e542182fc0fc3a7899483663b1` |
| `history.jsonl` | `363498197263f1c2fdb2dcdb9fe975320e8a77293d646e2fa7e5b02ea7cf26db` |
| `progress.md` | `539efb448a7a68fe2d6e0101899f359e3f41e41ed937cb1fde000f4c0e2829e9` |
| `state.json` | `7277a3be3cd9592df46e148ee518c88f729d7e7124fb3abe2597767f8fb73abb` |

O novo `.gauntlet/` fica dedicado a M07. O arquivo de estado anterior segue disponível no caminho de archive acima para restauração ou inspeção.

## Preservação do primeiro ciclo M07

O run `m07-discovery-20260923` registrou uma crítica I1 `REJECT` na rodada 1: faltava a matriz de 53 dependências de teste por owner. A descoberta recebeu essa matriz e teve referências de fonte/links corrigidas. O caminho da classificação foi corrigido na proveniência da quality bar; os critérios de aceite não mudaram. Como os artefatos e a revisão de proveniência mudaram após aquele run, o estado foi preservado integralmente em `.gauntlet-archive/M07-discovery-20260923-round1/` e um run dedicado ao pacote corrigido será iniciado.

| Arquivo | SHA-256 antes e depois do archive |
| --- | --- |
| `.writer.lock` | `7017c5e54d8259e9914766ad1697ee0769e05cb0857629ba62ec115881c5bf8a` |
| `artifacts.jsonl` | `6196710d7bdca0dd89fa71101137676c0044024bbc227d719911310e20272cae` |
| `bar.json` | `3f0625d1380e2b8c026be27448292f84ddeba8c0d2f4822b5e01a5e6da9743ce` |
| `history.jsonl` | `20f980bcb92990a5ddd18957aa1044ac48ebd31c69e86461d89f657b8bf5712b` |
| `progress.md` | `fdc4d19d7835228b182a92f7f2eb36b271f74f0b65ea81e930dc926dc4359f81` |
| `state.json` | `5c710e43c470a558e59ce26539939974e6854b827766d79b914ac9dfed79172a` |

## Preservação do segundo ciclo M07

O run `m07-discovery-20260923-r2` registrou uma crítica I1 `APPROVE` para D1–D4, com observação de clareza sobre owners sem arestas de produção. A descoberta agora lista os 25 owners explicitamente, incluindo os casos sem arestas. O segundo run foi arquivado antes de congelar a revisão final, preservando seu resultado e a barra `M07-DISCOVERY-v1.1` em `.gauntlet-archive/M07-discovery-20260923-round2/`.

| Arquivo | SHA-256 antes e depois do archive |
| --- | --- |
| `.writer.lock` | `8bfd6cbc6bd2fb38f6dcd79bbb4f44bb2606029396161a78a36efbb90fbf28a6` |
| `artifacts.jsonl` | `206189624e5745547dfeaf1a11742cc0d7eb52e1510dce45eb9a17b892a8ecef` |
| `bar.json` | `1cc6a3c27b8c91452081f8fc93ba09f11de3a6562471c93038564c952edd20dd` |
| `history.jsonl` | `003c471f34db17f53d11c86404aac7c30083b22f1890f6394afea3acb177a2e8` |
| `progress.md` | `a48eb10f288e2898dfee3f4488d58987aece7e4e081a56d2dda159fc41cb94d7` |
| `state.json` | `4317b369cd7d5d47ba5273b7e212aa4415224f8fe14a07ae00e98cbc35a4a6b7` |
