# SPEC0224 — proposta de contexto com resultado completo

A [SPEC0224](../../../../02_spec/0224_pare100_complete_tool_result_context.md)
está em revisão técnica documental. O protocolo proposto é opt-in no perfil
iterative; usa resultado JSON completo, seleção única, admissão do pedido
final e reserva de orçamento no checkpoint antes da chamada. Checkpoint2
não pode ser convertido silenciosamente em1. Os dez critérios TR01–TR10
continuam NOT_RUN e a falha OBS-I1-001 permanece aberta.

Primeira candidata:41d44eac; packetR1:b19c4e07/20arquivos,14fontes atuais,
seis critérios de qualidade da proposta. Bacon I1 de contexto fresco revisa
somente o pacote selado, sem descendentes ou execução de aplicação. O Lead
mantém arquivos congelados e prepara verificações documentais disjuntas.
Nenhum aceite técnico ou humano foi concedido neste estado inicial.

A função de publicação autentica o packet e todas as fontes atuais antes
de copiar evidências. Snapshots de código/Markdown são arquivados como
`.source.txt`; [archive-map.json](archive-map.json) preserva os nomes
originais e hashes. Pareceres em andamento não são publicados como finais.
São permitidos somente dados sintéticos nesta frente; nenhum provider,
modelo, PG, helper nativo, efeito real, push ou deploy foi executado.

As SPECs0217/0220/0221/0222,465pins e os36critérios/estados continuam
protegidos pelo verificador documental do programa. O novo contrato exigirá
requalificação dos inputs alterados quando houver BUILD autorizado. Nenhum
pin/checker foi ajustado para promover gates. Permanecem2DONE_LOCAL/34abertos
e paridadeNOT_MEASURED.

## Revisão R1 e candidata R2

O [parecer R1](review-r1/review.json) retornou REVISE, dois achados materiais;
Bacon foi encerrado. O [Lead](lead-review-r1-verification.json) verificou
70artefatos,40hashes e39tamanhos de inputs, sem conceder aceite.31streams
vazios permanecem no privado e estão explicitamente excluídos. Erro inicial
do parser Lead esperava bytes no registro de hash do manifest; foi
corrigido antes de qualquer aceite. Exceções bootstrap/truncamento do
crítico permanecem declaradas, sem alegação de captura perfeita.

R2:candidataf3bc9a61, packet1c8e16eb/24arquivos/17fontes. Agora todos os
TOOL_RESULT são obrigatórios até o estado terminal. Um codec reversível
base64 do state lógico preserva inclusive U+0000 em JSONB e mantém o digest
do conteúdo lógico. CAS de checkpointId+digest é obrigatório em todas as
escritas2, com ledger de receipts para settlement idempotente; lease não é
presumido no caminho unbound. São contratos PROPOSED, ainda não implementados.
BeauvoirI1fresca01a14448 revisa somente o packetR2, fontes/candidata congeladas.
A consulta à documentação oficial PostgreSQL17 foi leitura web do Lead;
nenhum banco, provider ou modelo de aplicação foi executado.

Oito verificações documentais R1 passaram em
[commands.json](checks/proposal-r1-01/commands.json). R2 precisa de seu próprio
parecer e das verificações atuais antes de submissão humana. TR01–TR10,
gates globais e implementação continuam NOT_RUN/PENDING.

## Aceite técnico restrito R2

O [parecer R2](review-r2/review.json), SHAd25eb6f9, julgou C1–C6 satisfeitos
como proposta, sem achados materiais. Beauvoir foi encerrada. O
[Lead](lead-review-r2-verification.json) recompôs14artefatos,48hashes/tamanhos
antes/depois,17fontes correntes e candidata root/W. O
[aceite](lead-acceptance.json), SHA1d82e365, é exclusivamente
ACCEPT_SCOPED_SPEC_FOR_HUMAN_REVIEW. Limites de bootstrap, streams e displays
truncados constam no parecer; nenhum teste de aplicação ou banco foi rodado.

Candidata final: `f3bc9a6115d17abb4185644cfc998f7aef39164774afff00042a64202b2c49ea`.
O [pacote de decisão humana](human-decision-packet.json) vincula esse hash,
escopo local isolado e aceite técnico. Revisão humana permanece pendente;
nenhum BUILD ou release foi autorizado. O registro de submissão será
preenchido somente quando a pergunta for de fato enviada. As perguntas
anteriores0220/0221/0222 não serão reenviadas.

Oito verificações T1 R2 passaram em
[commands.json](checks/proposal-r2-01/commands.json); nenhuma mudança de
candidata/fontes desde essa observação. Registros finais de publicação
terão sua própria checagem documental.36critérios e34paisabertos mantidos.
