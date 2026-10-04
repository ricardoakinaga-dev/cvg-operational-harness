# Checkpoint 06 — monitor, restore e nova crítica

Status: `IN_PROGRESS`; aceite global e produção `NO_GO`. Zero chamadas externas OpenAI.

A crítica D011 reproduziu dois defeitos: probe HALF_OPEN preso após cancelamento neutro e DNS seguinte iniciado após cancelamento entre redirects. Os 396 testes congelados passaram, com 443 hashes preservados; esse resultado não elimina os dois achados. Lead corrige ambos e preserva as reproduções para uma nova revisão.

Monitor separado passou em 12 testes. A prova com parada de processo real teve recibo persistido pelo receptor após 19,9 segundos, com poll padrão de 10 segundos e timeout de 2 segundos. Somente processos locais: domínio de falha remoto e gestor real não estão qualificados.

Backup inicial: 19 testes passaram e um falhou na guarda de hold ainda não integrada. Cópia de documentos, identidade/chain do journal, recusa de locks, corrupção, paths e symlinks foram exercitadas. A prova por webhooks com correção, done/snooze, envio incerto, pausa, cauda isolada e órfão está em preparação. Falhas de fixture e a falha pré-integração da pausa permanecem registradas. A suite selada do Builder operacional indica 376 testes verdes; aguarda entrega final para integração dos caminhos próprios.

Os gates da baseline anterior não certificam este código novo. Fonte final, nova crítica e gates integrados ainda são necessários. SPECs aprovadas, NO_MODEL e condições humanas permanecem vigentes.
