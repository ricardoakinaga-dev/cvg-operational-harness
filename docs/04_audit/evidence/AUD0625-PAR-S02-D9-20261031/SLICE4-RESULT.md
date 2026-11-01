# PAR-S02 fatia 4 — `resumeSession` e o registro no cartão (SPEC 0292 R1 §7)

Autor: Claude D9. Branch `claude/aud0625-par-s02-build-d9`, sobre a fatia 3 `856362113`.

## O que entrou

- `resumeSession` continua devolvendo a análise **inteira** do S04 (`analysis.turns` por turno): a SPEC §3 manda que `fork` e `resumeSession` sigam usando a função inteira, e a projeção não guarda a lista de turnos. Por isso a leitura do log inteiro continua nele. O que muda: o log que ele acabou de ler passa por `projectSession` e a projeção é entregue ao **dono do stream** (canal privado do módulo, `seedProjection`), de modo que o primeiro checkpoint desse escritor não lê o log uma segunda vez. Um `open` comum continua obtendo a projeção só quando um checkpoint fica devido (checkpoint + cauda, ou o log inteiro).
- Cartão PAR-S02 do [0380](../../../03_build/0380_backlog_paridade_100_deepseek.md): estado `IN_PROGRESS` e linha "Execução atual" com as quatro fatias, sem aceite nem integração.

## Provas

- PG 42/42: um escritor aberto por `open` lê o log para formar a projeção quando o checkpoint fica devido (controle: mais de 0 linhas); um escritor vindo de `resumeSession` anexa o mesmo tanto e grava o checkpoint (160) sem ler nenhuma linha; a projeção final é igual à pura.
- Regressão S01/S04 (adapter, writer, resume) junto: 117/117.
- Mutante: 1/1 morto (resume sem `seed`). Dois outros candidatos (aceitar a semente só quando coincide com a cabeça do dono; engolir erro da semente) eram código inalcançável com o lock tomado e com o mesmo redutor da análise: foram **removidos** em vez de mantidos sem teste.

## Desvio

O pedido falava em `resumeSession` "pelo checkpoint". Na leitura, isso não cabe sem trocar o contrato do S04 (a análise por turno exige o log inteiro). A parte que a SPEC pede para o escritor ("uma sessão reaberta parte do checkpoint mais a cauda") já está na fatia 3 para o `open` comum; aqui o `resumeSession` aproveita a leitura que já faz.
