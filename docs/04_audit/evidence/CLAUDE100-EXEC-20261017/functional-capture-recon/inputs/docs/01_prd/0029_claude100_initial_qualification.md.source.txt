# PRD0029 — Primeira qualificação Claude100

Task `C100-G04`,17/10/2026. Deriva da [Discovery0020](../00_discovery/0020_claude100_source_and_execution.md), dos planos0381/0382/0383 e da direção explícita de implementação integral. Escopo documental definido para SPEC; não é autorização de BUILD ou aprovação das equivalências ainda pendentes.

## Comportamento esperado

O verificador recebe o identificador de um cenário, captura autêntica da referência, execução CVG e a regra de equivalência aprovada. Mostra resultado por obrigação, controles e limitações separadamente. Falta de captura, gate, campo, cenário ou identidade nunca vira PASS. IDs desconhecidos e pacotes incompatíveis são recusados; o denominador corrente não diminui por indisponibilidade.

O operador consegue distinguir: inventário de fonte, ensaio executado, comparação aprovada, controle CVG aprovado e marco completo. Não há botão que converta uma suíte de mocks em paridade real.

## Primeira jornadaM1

Em workspace e tenant sintéticos, abrir sessão, executar READ sobre arquivo próprio, solicitar WRITE, observar pausa sem edição, registrar approval autenticado, retomar e produzir uma edição. Reiniciar o processo em pontos definidos e confirmar que sessão/approval/operação continuam corretas e nenhum efeito é duplicado. Tentativa de outro tenant, token antigo, approval forjada e execução fora do root são negadas com prova bruta.

M1 é obrigatória para C100-Q01, mas depende das entregas qualificadas PAR-Q03/Q04/K01/K03/S01/X01–X04 e dos respectivos contratos. A primeira SPEC de qualificação pode implementar o mecanismo de medida antes dessa jornada, preservando Q01 aberto até a demonstração integrada.

## Aceite

1. Mesma entrada e regra de comparação para um par correto autenticado; nenhuma saída esperada fabricada pelo driver.
2. Alterações de resposta, ordem, identidade, tenant, erro, efeito, custo ou insumo invalidam o resultado pertinente.
3. Ausência de referência produz pendência explícita. Controles CVG usam SPEC aprovada e não exigem observabilidade de internals do Claude.
4. Raw e projeção permanecem rastreáveis, com fontes/versões/hashes e revisão independente.
5. M1 só fecha com execução no mesmo candidato e positivos/negativos atuais. Um aceite do comparador isolado não fecha Q01, família ou programa.

## Limites e operação

Sem novos serviços, contas, provider externo, dados reais ou deploy nesta unidade. Não se escolhe silenciosamente implementação cloud/IDE/gateway. Erro de infraestrutura é registrado como incompleto/falha, nunca convertido em resultado funcional esperado. O pacote de decisão da SPEC explicita a autoridade necessária para cada unidade; o programa continua até todos os marcosM0–M7.
