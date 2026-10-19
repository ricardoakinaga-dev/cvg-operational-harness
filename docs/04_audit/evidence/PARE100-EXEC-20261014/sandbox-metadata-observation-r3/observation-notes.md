# Observação0223 R3

Dois lançamentos do caminho público fonte single_pass repetiram a perda de sandbox
WORKSPACE por capabilities: gate zero, um corpo em memória e COMPLETED. Controle
direto WORKSPACE: gate uma vez, nenhum corpo, UNSAFE_REQUEST. Capability NONE
completa um eco sem gate. Os fingerprints das capabilities permanecem iguais.
O invariante falhou; nenhum efeito externo ou correção de produção foi executado.

O validador exige duração de ferramenta zero no bloqueio e, neste fixture local,
journal.createdAt <= updatedAt <= audit.timestamp. Anomalia de relógio invalida a
prova; clocks brutos não são zerados. Os três novos contraexemplos foram rejeitados,
somando40negativos/1positivo e4falhas reais de launcher com filhos sintéticos
recolhidos. Authority1061fontes e receipts externos preservam a origem confiável
da captura; não autenticam host malicioso ou execução de código arbitrário.

Formato, tipo e lint focados passaram. Packet9743074d/24arquivos+6constraints em
crítica fresca Schrodinger01a143dc. AceitePENDING, invarianteproduçãoFAIL,
paridadeNOT_MEASURED. Não prova contençãoOS, ABI, ML29, policyprodução, dois motores,
outro perfil ou release. Gates220/221/222humanosPENDINGsemreenvio,36critérios e
34cartões abertos mantidos; integraçãoT2global continua pendente.
