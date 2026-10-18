# Revisão independente R1 — SDK

Archimedes: **ACCEPT_BOUNDED_SDK_SOURCE_CONTRACTS**. Nenhum achado material,
nenhum retrabalho. [Retorno terminal original](review-r1.raw.txt),
[inputs congelados](review-r1-inputs.json) e [contrato](contract.json).

O crítico conferiu 24 inputs locais e dois raiz antes/depois, sem drift.
Executou 15 sondas focais e os quatro leitores em `--check`, todos exit0.
Conferiu 54 identidades de fonte distintas, 25.387 spans Python e 965
TypeScript. Amostras de fonte incluíram assinaturas, aliases, defaults,
decorators, `@internal`, gerados, RPC/notificações, erros/cancelamento/lifecycle,
JSONL, processo/argv/env/imagens/sinal/cleanup. Doze adulterações adicionais de
assinatura TypeScript foram rejeitadas em memória.

O retorno distingue controles de leitores e regeneração de testes funcionais.
Uma assert inicial da sonda do crítico contou a categoria CVG junto às famílias
funcionais; ele corrigiu a sonda para 22 famílias, sem defeito nos artefatos.
Dez pacotes/460 payloads/dez manifestos anteriores e catálogo487+22 permanecem
preservados. Todos os recibos funcionais continuam nulos; seis gaps SDK, cinco
limites externos e 291 correlações TUI permanecem abertos.

Pauli e Archimedes encerrados; dois agentes no total, sem descendentes. Aceite
exclusivo deste recorte T1: não fecha G01, autentica executável, qualifica motor
nativo nem concede BUILD ou release. Próxima ação registrada na continuidade:
concretizar variantes testáveis dos 179 aceites públicos genéricos.
