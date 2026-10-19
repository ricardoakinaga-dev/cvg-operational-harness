# Observação local de metadado sandbox

Task SPEC0223, T2 somente prova. O caminho público fonte CVG single_pass foi
executado com portas sintéticas e eco em memória; não houve modelo, approval,
rede, shell, arquivo da ferramenta, helper nativo ou efeito externo.

O controle direto WORKSPACE chamou o gate deny uma vez, executou zero corpos e
retornou UNSAFE_REQUEST. Capability NONE completou um eco sem chamar o gate.
Capability WORKSPACE perdeu o campo sandbox no descritor normalizado, não chamou
o gate e completou um eco. Os fingerprints das duas capabilities foram iguais.
O invariante de preservação falhou; o exit0 da medição não é aprovação de sandbox.

Attempt03: exit0, 424ms, 1054inputs sem alteração, 465pins preservados, subprocesso
auxiliar adotado/recolhido e grupo final ausente. Tipo/lint focados PASS, onze
mutações de dados da observação rejeitadas pelo validadorI0. Crítica I1 pendente.
Não há prova de ABI compilada, policy de produção, managed lifecycleML29, segunda
topologia, contençãoOS, paridade entre motores, paridade integral ou release.

Falhas anteriores preservadas: attempt02 viu grupo auxiliar ainda presente e foi
marcada falha; inspeção posterior confirmou grupo ausente. O launcher atual usa
subreaper e join explícito. Primeiro validador esperava log incompleto no bloqueio;
a falha foi repetida para captura e a expectativa corrigida para o log nativo com
tool/result=not_started. Hashes dos inputs antigos são históricos: não se afirma
que as versões privadas anteriores dos scripts continuem disponíveis byte a byte.
A execução atual03 possui os scripts atuais e hashes correspondentes.

A correção de produção da SPEC0222 continua aguardando revisão humana. Todas as
36tarefas/oito fases e aceites originais permanecem;2DONE_LOCAL/34abertas,
integraçãoT2/gates globais pendentes e paridadeNOT_MEASURED.
