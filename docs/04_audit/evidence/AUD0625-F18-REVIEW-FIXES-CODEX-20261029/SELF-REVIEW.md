# Autorrevisão do reparo F18

Autor avaliando o próprio código; revisão independente posterior é da07/D9. A solução mínima conserva o estado privado e muda apenas a reconciliação do retorno. Não concede writer a kindcontrol nem acrescenta serviço público/contrato de sandbox.

P2-1 precisa manter unknown_effect mesmo sem call.approval; por isso a classificação threw carrega a marca no próprio error, preservando a causa alegada. O RuntimeResult usa o status FAILED existente para threw; não foi inventado um status novo. A primeira asserção que proibia FAILED foi corrigida por contrariar o contrato; a exigência correta é a classificação incerta explícita. O prefixo da resposta dos caminhos que já o acrescentam não é uma confirmação adicional.

P2-2 escolhe a alternativa aprovada de recusar, em vez de restaurar subárvores originais em dados entregues a extensões. Se a observação anterior contém marcador privado, reconstrução (inclusive JSON) não pode mascarar perda; se o próprio retorno introduz valor não projetável, também é recusado. O retorno identidade preserva o original somente no acumulador privado, nunca o entrega ao hook. Um literal opaque:true do usuário não é marcador privado. turn/end já conserva toolResult/contadores originais e só aceita texto/stopReason, com teste adicional de cópia e saída grande.

A fronteira R23 usa instrumentação de teste no módulo apenas para observar o callback real fornecido pelo iterativo; não substitui a decisão governada ou efeito nem adiciona seam público. O mutante isolado prova que o oráculo não depende só do resultado da ferramenta. Os demais sete mutantes do revisor foram aplicados separadamente e mortos por suas novas assertivas.

As primeiras tentativas de teste e a campanha diagnóstica são históricas, não evidência final. A fixture sem-aprovação agora retira a exigência tanto do descritor quanto da política. Caps não foram elevados. Houve pico IO fullavg10~46; tipos iniciais passaram90.477s/120 e controles finais foram repetidos em baixa pressão. Nenhum processo de par foi encerrado.

P3 restantes da revisão (signal como snapshot, DAG repetido opaco e guia amplo de migração de extensões) não foram ampliados nesta correção dos2P2; permanecem limitações conhecidas, sem autoridade do corpo alterada. Pacotes anteriores/hashes/SPEC/receipt/catálogos/lock preservados. Integração e aceite permanecem doDF.
