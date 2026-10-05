# C1 — inputs globais e metadados verificáveis — R9

Task `C1_GLOBAL_MANIFEST_VALIDITY_R9`, T2 corretivo local sob SPEC0180/ADR010 e autorização contínua.

Recon: crítica R8 válida prova sete shapes globais inválidos PASS apesar de closure/scalar/scope checks verdes. Validar objetos JSON de manifesto, workspaces array/paths, nomes e mapas de dependências antes derivar grafo. Não usar defaults silenciosos para workspaces nulo; dependências arrays/strings/número e nomes inválidos bloqueiam globalmente, inclusive workspace consumidor não alcançado. Duplicidade/aliases conhecidos devem preservar arestas de domínio, sem suprimir unknowns ou alargar interpretação.

Escopo: checker e controles próprios append-only em cópia isolada. Shapes de report públicos intactos. Originais253/prefixo363 preservados; antes/depois discriminante, tipos/lint/native/installed e crítico novo nofreeze. Sem Root/Main/env/provider/PG/push/produção.
