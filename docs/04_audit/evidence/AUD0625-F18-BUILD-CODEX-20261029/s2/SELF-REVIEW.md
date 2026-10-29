# Autorrevisão do BUILD F18

Revisão do próprio autor, sem pretensão de independência. D9 continua responsável pelo parecer externo sobre commits imutáveis.

O estado real continua privado pela posse de referências no kernel e nos adaptadores centrais credenciados por WeakSet privado; não é entregue às extensões. Não há novo serviço de escrita em ctx.get nem reexport do módulo de credencial no índice público. kind control sozinho não concede escrita. A mudança não isola JavaScript arbitrário executado pelo host.

A revisão encontrou e corrigiu quatro pontos antes do freeze: next abandonado seguido de throw podia iniciar efeito antes de normalizar a falha (agora há notificação imediata e latch antes de started); falha de controle de fim podia ocultar o motivo prévio (agora preserva o motivo causal); omitir execute/signal com rest podia chamar getter (agora projeta descritores de dados antes de omitir, sem congelar originais); compaction e doubles centrais antigos precisam credencial explícita (algoritmo, limites e oráculos preservados). Guards/checkpoints continuam observacionais; loops compartilham o pipeline.

Os dois oráculos antigos CTL-W02 que reescreviam o journal para not_started depois de corpo executado foram corrigidos para fato físico succeeded e duração efetivamente observada do downstream. O resultado governado de falha continua distinto e bloqueante. Isso implementa D2 aprovado; não reduz a exigência de confirmação/settlement.

Histórico preservado: parsing inicial e nome duplicado de fixture; primeira matriz196/2 e138 após ajustes; primeira rodada ampla755/5; integração parcial de doubles ainda2falhas antes da correção final. Campanha1:13 mortes de assertiva e um worker timeout sem testes, INCONCLUSIVO. Campanha2:17 mortes por assertiva na versão anterior. Campanha final:18/18 mortes por assertiva na fonte atual, sem crédito por timeout/skip; restauração SHA comprovada. Nenhuma dessas versões anteriores concede PASS à fonte final.

Limites: checkout parcial com dependências reaproveitadas e versões conferidas; não é qualificação clean/integral. Testes sintéticos/in-memory; um sandbox handle sintético prova preservação de autoridade, não contenção nativa. Zero fullsuite, PostgreSQL, Docker, E2E, certify ou push/PR/merge. X01/K08/F05 global, revisão D9, integração e aceite permanecem fora deste fechamento local.
