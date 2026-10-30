# F02 P3 — complementos de teste entregues ao Opus

Atribuição10814, revisãoD9 4b95bb56, branch `codex/aud0625-f02-p3-20261029` sobre f4e799b805c92ec4ce81e00678c79c24608ae00e. Somente um teste novo e documentação; nenhuma fonte de produção, contrato, SPEC ou limite foi alterado.

P3-1: depois do aquecimento, três lançamentos nativos reais de sucesso mantêm FDs do host em23→23→23→23. O mutante que remove só launch.close() do finally dá33→43→53→63 (o aquecimento também vaza10), com asserção causal. Cada subprocesso de teste termina/reaped, encerrando os descritores vazados da mutação. Nenhum FD do processo controlador é fechado à força.

P3-2: allowNetwork=false executa e escreve um marcador próprio; true retorna spawn_failed/process_profile_invalid_process_grant sem payload. O mutante que remove somente a recusa do grant, preservando --unshare-net, executa e retorna0: teste falha pela admissão indevida. Isso diferencia contrato de admissão do isolamento de rede; não houve acesso de rede.

2novosPASS,2mutantesmortos por assertivas/1caso filtrado por rodada. Regressão afetada58PASS/0falhas/0skip/xfail; typecheck0/95.380s dentrodocap120s, lint0/56.111s dentrodocap60s, formato0. Fontes restauradas byte a byte depois dos mutantes; toda a baseline materializada preservada. Logs brutos ficam em transporteJSONsemperda, com SHA e conteúdo recuperável.

Não é nova correção runtime nem fechamento X01/F05/K08 ou de produção. F02-base recebeu APPROVE D9; complemento de teste aguarda revisão/integraçãoDF. Semfullsuite/PGDocker/pushPRmerge/lockfile. Deltas canônicos99/20/30: registrar etapaP3local entregue, evidências e próximoDF; ledgers permanecem readonly por coordenação. Próxima ação do Codex:F18fase1/SPEC0280, conforme10814.
