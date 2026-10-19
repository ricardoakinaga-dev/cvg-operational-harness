# SPEC0237 — revisão independente documental R1

**Veredito: REVISE. Obrigatórios: 3 (P0: 0; P1: 1; P2: 2; P3: 0).**

Task `C100-Q01-REF-CAPTURE-001`. Julgamento do contrato proposto, antes de BUILD, conforme o [contrato exato de revisão](../review-contract.md) e os [inputs congelados](../review-inputs-r1.json). Fonte normativa: [snapshot SPEC0237](../spec-r1.source.txt), SHA-256 `917c462aaeee16ca381e4b716a0ac68f516274d1f9577d6d4d42e8cb76750fb0`, 31.547 bytes. As referências de linha abaixo pertencem a esse snapshot, não à outra SPEC0237 da frente HISO.

A proposta delimita três capturas reais do cliente sob SSE programado, conserva o resultado de READ sem qualificá-lo e exige denial nativo correlato para WRITE_DENIED. Os obrigatórios abaixo são lacunas do contrato documental. Nenhum depende de provar compatibilidade nativa antes do gate que autorizará a tentativa.

## Achados obrigatórios, agrupados

### G1 — Wire e proveniência: R1-01, P1

**O wire v2 é declarado fechado, mas faltam as definições que permitiriam verificar essa propriedade.** Âncoras: L31, L104–108 e L116; critérios RC03/RC07/RC08/RC09. Confiança: alta na ausência documental; o efeito em implementação permanece hipótese.

L104 afirma que tipos/payloads finitos estão declarados por etapa, mas não apresenta essa declaração. Cita ARM/START_NATIVE/END_CASE sem fixar direção, emissor autorizado, campos completos, domínios e transições/acks. Também não define o framing binário v2 que distinguirá request, resposta/segmento e stdout/stderr por processo. L108 define bindings dos artefatos finais; não define como os registros/chunks de cada pipe os comprovam. A SPEC0235 tem uma tabela de payloads e um framing próprios, mas L31 separa expressamente seu wire do novo: não existe uma incorporação normativa seletiva que resolva a lacuna.

**Contraprova documental:** um builder pode interpretar END_CASE como confirmação do cliente; outro, como comando do host. Ambos conseguem construir envelopes com os seis campos de L104 e os bindings de L108, mas seus validadores discordam sobre origem e encerramento. Analogamente, não há regra v2 enumerada para decidir qual frame associa um segmento SSE ao request e qual combina sequência, dimensão e EOF. A exigência geral de conferir origem antes da união é correta, mas não resolve essas interpretações. Isso deixa a rejeição dos mutantes de proveniência de RC08 dependente de decisões futuras não congeladas.

**Correção necessária:** fechar uma tabela normativa compacta de mensagens, produtores/destinatários, payloads/domínios e transições, incluindo configuração/porta e término; fechar tags/dimensões/framing dos canais binários e a correspondência com artefatos/refs. É suficiente incorporar explicitamente partes precisas do contrato anterior e enumerar os deltas. Fixar a rejeição de origem/tipo/etapa/ordem/dimensão/EOF inválidos. Não se pede implementação ou ensaio nesta rodada.

**Condição de reprovação:** restar um evento/chunk necessário ao caminho feliz ou ao partial sem interpretação única de origem, fase, bytes e refs; um mutante de troca de produtor/caso/segmento não ter rejeição documental determinada.

### G2 — Script fixo: R1-02, P2

**Os literais de início SSE e de ID de mensagem são contraditórios ou escapados de modo ambíguo.** Âncora: L84; critérios RC03/RC04. Confiança: alta, conferência dos bytes do snapshot.

A sequência fechada contém literalmente `message*start`, enquanto a frase seguinte define `message_start.message`. L86 exige nome SSE igual a `data.type`. O template de ID está em código como `msg_cvg*<caseId>\_<turno>`: o asterisco e a barra invertida fazem parte dos bytes do documento, sem regra que diga se são bytes do ID ou corrupção de formatação.

**Contraprova documental:** seguir a sequência produz `event: message*start` e `type: "message*start"`; seguir o campo nomeado produz `message_start`. São scripts com bytes e hashes diferentes. Para o ID, preservar a barra invertida ou tratá-la como escape Markdown também produz strings diferentes. Não é uma alegação de incompatibilidade observada; é divergência entre duas leituras do contrato que deveria fixar o script antes do alvo.

**Correção necessária:** substituir essas notações por literais inequívocos, definir o template efetivo de ID e fornecer ao menos um exemplo de evento e de ID expandido. A conferência pode ser inteiramente documental/inertemente calculada. A materialização/hash dos scripts continua na etapa já prevista, sem antecipar execução nativa.

**Condição de reprovação:** duas leituras literais da SPEC ainda permitirem produzir nomes de evento, tipos ou IDs diferentes sem mudança explícita de contrato.

### G3 — Resultado parcial por caso: R1-03, P2

**Não está definido o status do caso iniciado e interrompido por infraestrutura.** Âncoras: L98, L114 e L118; critérios RC08/RC09. Confiança: média-alta; falta mapeamento normativo, não falta um status terminal global.

L98 preserva brutos parciais e deixa casos futuros NOT_RUN. L118 corretamente classifica timeout/sinal/cap/IO como INFRA_FAILURE. Entretanto, L114 oferece somente NOT_RUN, INCOMPATIBLE e CAPTURED por caso, sem mapear uma interrupção infra após start. A própria proposta distingue incompatibilidade de transcrição de falha de infraestrutura.

**Contraprova documental:** TEXT completo; READ com NATIVE_START e primeiro POST, seguido de TIMEOUT antes de receber o callback; WRITE_DENIED não iniciado. O terminal global é INFRA_FAILURE/1 e WRITE_DENIED é NOT_RUN. Falta a regra para READ: NOT_RUN contradiz o lançamento observado; CAPTURED contradiz a coleta incompleta; INCOMPATIBLE não está definido para essa causa. O resultado não deve depender de o builder inventar a semântica desse último enum ou descartar os refs parciais para encaixar o schema.

**Correção necessária:** definir um estado parcial/falho, ou um mapeamento explícito e fiel dos estados existentes, com invariantes de nativeExecution, refs parciais, causa de falha e casos futuros. Definir separadamente o caso já CAPTURED quando só o cleanup/publicação posterior falha; o terminal global continua falho. Documentar esses exemplos sem executar o alvo.

**Condição de reprovação:** o exemplo de TIMEOUT após start ou de cleanup falho após captura não ter representação única que preserve fatos, brutos e limites do sucesso.

## Julgamento por critério

Os juízos abaixo são de suficiência documental. **RC01–RC11 runtime: NOT_RUN**, inclusive os critérios cujo desenho foi considerado suficiente.

| Critério | Juízo documental | Evidência e limite |
| --- | --- | --- |
| RC01 — inputs/closure | SUFICIENTE | L27–31/L50–54: perfis literais, fronteira antes de import, FDs e inputs fechados. Implementação futura não examinada. |
| RC02 — contenção | SUFICIENTE | L33–48: pins, cinco binds RO, namespaces/recursos, preflight antes do alvo, ownership de cleanup. Sem atestação de runtime. |
| RC03 — inputs consumidos | REVISAR | Argv/env/stdin/casos estão delimitados em L56–66; R1-01/R1-02 afetam a ligação e a identidade exatas. |
| RC04 — SSE/consumo | REVISAR | L84–86 separa plano/escritas/finish/consumo corretamente; R1-02 impede um script literal único. |
| RC05 — READ sem oracle | SUFICIENTE | L79/L82: callback por ID, conteúdo integral mesmo errado, final constante, nenhuma qualificação semântica. |
| RC06 — WRITE_DENIED | SUFICIENTE | L80/L100: callback de erro, denial com tool/input/ID e workspace; RO sozinho não passa. Shape é hipótese declarada. |
| RC07 — caps/privacidade | REVISAR | L70/L88/L92–96 fixa tetos e sanitização; R1-01 deixa o domínio de validação do novo framing incompleto. |
| RC08 — origem/falhas | REVISAR | Partições físicas e ledger bijetivo são exigidos, mas R1-01/R1-03 deixam o contrato incompleto. |
| RC09 — cleanup/publicação | REVISAR | L98/L116/L120 conserva causas, IDs e publicação exclusiva; R1-01/R1-03 afetam protocolo/partial. |
| RC10 — gates/regressão | SUFICIENTE COMO PLANO | L116/L135/L138: externo/NOT_RUN, 250 testes preservados, crítica de código antes do alvo e gates atuais após captura. Nenhum gate executado aqui. |
| RC11 — autoridade | SUFICIENTE | L11/L112/L118/L136–140: 117+17, sem índices/receipts automáticos, PAR/M1/paridade/produção sem crédito. Novo gate T3 continua necessário. |

CURRENT/PROPOSED/UNKNOWN estão separados em L13–21. O report0235 congelado tem três observações e `REFERENCE_RECON_ONLY`; isso não demonstra HTTP200 ou ferramentas. Ajuda, literais estáticos e observações de documentação oficial sustentam a proposta, sem provar sua compatibilidade com o binário. Nenhum obrigatório foi aberto por essa compatibilidade permanecer NOT_RUN.

## Evidência, limites e encerramento

Foram realizados somente leitura documental e checks inertes: 39/39 verificações de SHA/tamanho (18 snapshots, 18 fontes correspondentes e três metadados), sete JSONs de inputs/metadados validados sem chaves duplicadas, inspeção dos literais acima e links relativos dos artefatos desta revisão. O catálogo congelado contém 134 requisitos em 16 famílias. Consulte [checks de entrada](input-checks-before.json), [checks JSON](json-checks.json), [resultado estruturado](result.json) e [manifesto](manifest.json) para digests, escopos de leitura e conferência final.

Confiança global: **alta para o julgamento documental delimitado**. Não houve descendentes, import/execução de código do projeto, Claude, app, testes, build, Docker, PG, rede ou instalação. Fontes oficiais externas não foram reabertas; seus metadados não são snapshots das páginas. Não se verificaram kernel, daemon, memória executada ou o binário instalado; somente seus pins declarados. Os exemplos de falha acima são contraprovas documentais, não reproduções executadas.

O [claim local](claim.json) registra a lane exclusiva. Escrita restrita a este diretório; SPEC, inputs, fontes, catálogo, estado, ledgers e arquivos do Lead não foram alterados por esta revisão. A reserva e o pedido exato prevalecem sobre a rotina geral de atualizar ledgers compartilhados; o Lead recebe o resultado por estes artefatos.

Próximo passo: Lead reconciliar os **três obrigatórios em conjunto**, preservar R1 e emitir novo freeze para o retrabalho já orçado. Esta R1 usa um crítico fresco, zero descendentes e zero retrabalhos; teto global de dois retrabalhos preservado. REVISE não é aprovação humana, autorização de BUILD ou paridade, nem encerra C100-Q01/M1.
