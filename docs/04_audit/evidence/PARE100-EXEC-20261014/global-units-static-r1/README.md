# Suíte global após o reparo estático — FAIL

O script `npm test` original terminou em 622,8 s, exit 1, com 4406 testes
passando, 44 falhando e 282 pulados. Foram 452 arquivos; quatro falharam.
Os sete grupos falhos do Vitest incluem grupos aninhados.

A [comparação por caso](comparison-to-r19.json) registra 17 falhas anteriores
que passaram: duas guardas estáticas e 15 casos afetados pelo perfil de
rede. Nenhuma asserção passou a falhar. Não houve teste removido, exclusão
ou mudança de configuração. As 1042 fontes e a candidata atual de 81
entradas permaneceram intactas durante a execução.

Restam 43 falhas de qualificação e um smoke que exige `ECONNREFUSED`
de uma porta fechada e recebe o código honesto do bloqueio de rede.
Além dessas asserções, a fixture PostgreSQL obrigatória falha na carga
por falta de recurso dedicado; não foi pulada ou transformada em sucesso.
O verificador privado R4 continua corrigido/retestado I0 sem novo aceite
independente, com dois REVISE anteriores preservados. Não há atestação de
isolamento OS, UDP ou processos nativos.

O checker oficial continua INCOMPLETE: [normal](boundary-default.json)
com 193 diagnósticos e [estrito](boundary-strict.json) com 390; ambos com
zero violações AST e zero installed/lock drift. Esses números não são
atestado de segurança ou aprovação da qualificação.

A [observação do freeze0220](spec0220-frontier-observation.json) verificou
450 pins idênticos e 15 divergentes entre os 465. Todas as divergências
precedem o reparo estático. A proposta pendente permanece intocada;
qualificar a fonte atual exige recomposição e revisão próprias, incluindo
os emits correspondentes. Não houve repin automático nem ativação de tabela.

Evidências: [comando](command.json), [resultado bruto](results.json),
[classificação](classification.json), [stdout](stdout.log), [stderr](stderr.log),
[fonte sem alterações durante o run](source-changes.json),
[manifesto](publication-manifest.json) e
[aceite restrito do reparo](../static-guards-r1/acceptance-scoped.json).
HOME/caches/backups ficaram privados; omissões de streams vazios são tipadas.
Programa original: 36 cartões, 2 DONE_LOCAL e 34 abertos; paridade integral
NOT_MEASURED. SPEC224 continua aprovada; 220/221/222/225/226 seguem pendentes,
sem revisão humana inferida desta execução.
