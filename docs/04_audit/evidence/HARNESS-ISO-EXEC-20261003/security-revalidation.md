# HISO012 — revalidação somente leitura

03/10/2026. O npm audit do lockfile atual continua reprovando: três grupos HIGH
e um MODERATE. [Captura](security-audit-readonly-r1.json) e
[saída integral](security-audit-readonly-r1.log), exit1, inputs MATCH.
Nenhuma versão/lockfile foi alterada nesta revalidação. BUILD de manutenção de
segurança permanece dependente da revisão T3 da0180.

| Package | Versão observada | Linha corrigida documentada pelo mantenedor | Exposição a qualificar |
| --- | --- | --- | --- |
| brace-expansion |5.0.9|5.0.12: correção de expansão quadrática; outras HIGH constam no audit. [Advisory do mantenedor](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-q2hr-2g5m-vwhr).|Tree de minimatch/glob e ferramentas; não assumir que dependência dev dispensa correção.|
| fast-uri |3.1.6 e4.1.4 no lock|3.1.8/4.1.5 para normalização de host; HIGH adicionais também constam no audit. [Advisory do mantenedor](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj).|AJV/compilação de schema e Fastify; validar ambas as árvores, não atualizar apenas uma.|
| undici |7.29.0|7.29.1 corrige o advisory de BalancedPool; demais advisories do audit exigem conferência na mesma versão. [Advisory do mantenedor](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3).|Condições específicas incluem WebSocket, RetryHandler, cache/decompressão e TLS. O pacote npm e a implementação embutida no Node são artefatos diferentes.|
| fastify |5.12.3|5.12.5 corrige trailer sobre HTTP2. [Advisory do mantenedor](https://github.com/fastify/fastify/security/advisories/GHSA-4mh8-r7rc-xpvc).|Runtime de apps/api e legado secretary-journeys; advisory específico depende de HTTP2 e trailer.|

Fontes primárias consultadas via web nesta rodada. O primeiro URL tentado para
brace-expansion, no owner isaacs, retornou404; package.json confirmou o owner
juliangruber e seu advisory foi consultado. Não atribuir suporte ao URL inexistente.

`npm ls` capturado em [árvore de exposição](security-exposure-tree.json). Busca
direta identificou Fastify no API e no legado; não encontrou imports diretos dos
outros três packages nas fontes do consumidor/core pesquisadas. Isso é evidência
limitada de imports, não prova de ausência em dependências transitivas ou código
embutido do runtime. A qualificação de exposição e patch ainda não está concluída.

Próxima ação após revisão T3: conferir versões disponíveis/compatibilidade de todos
os advisories, aplicar updates direcionados sob claim do lock, instalar em cópia
coerente, repetir audit e regressões dos consumidores efetivamente afetados. Sem
exceção residual aprovada, não encerrar HISO012 ou afirmar segurança de produção.
