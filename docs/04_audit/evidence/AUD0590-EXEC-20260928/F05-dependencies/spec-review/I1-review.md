# F05 I1 — crítica independente da SPEC 0164

**Crítico:** Erdos (`01a0eb4d-cb16-7953-93e5-cdc6beb03668`), contexto
novo, somente leitura do commit `53bd5e9`/SHA-256
`d68013400db55a2309ad61589190ed0343fc5c4d20feef6a1c9ea1a90ea86d04`.
**Veredito:** `REVISE` (0 P0, 2 P1, 3 P2). Nenhum BUILD, instalação,
teste ou alteração de lockfile pelo crítico.

| Prioridade | Lacuna | Resposta na revisão |
| --- | --- | --- |
| P1 | `npm ci` poderia executar scripts sem inventário. | Pin Node/npm, enumerar `hasInstallScript`, instalar com `--ignore-scripts` em checkout descartável e reconstruir só `esbuild` após conferir versão/integridade; mudança de catálogo bloqueia. |
| P1 | `npm ls` não prova todas as entradas do lockfile. | Enumerar `packages` por path/versão/`dev`/`optional`/pai e comparar com árvore após instalação limpa. |
| P2 | Pais de `fast-uri` 3.x e 4.x misturados. | Distinguir `fast-json-stringify` 6.x/7.x e impedir override global que rebaixe a linha 4.x. |
| P2 | Negativos de URI genéricos. | Fixar strings e componentes de host/porta, APIs e resultados esperados, além de controle benigno sem rede. |
| P2 | Audit completo não exigia explicitamente ausência do GHSA de Undici. | Verificar `GHSA-3wwx-pv8p-q78v` na cópia npm de `jsdom` e inventariar Node embutido separadamente. |

O gate T3, claim PR-L04 e rollback `NO_GO` foram considerados bem
delimitados. A [SPEC revisada](../../../../../02_spec/0164_dependency_advisory_remediation.md)
precisa de nova crítica antes da revisão humana. Nenhuma alteração em
`package.json`/`package-lock.json` foi feita nesta resposta.
