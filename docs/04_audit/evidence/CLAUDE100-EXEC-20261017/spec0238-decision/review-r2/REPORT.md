# SPEC0238 — revisão independente documental R2

**Veredito: APPROVE_SPEC. Obrigatórios abertos: 0 (P0/P1/P2/P3: 0).** Os três grupos da R1 estão resolvidos documentalmente. Não foram identificados novos obrigatórios na revisão integral do contrato e dos apêndices A/B.

Mesma unidade `C100-Q01-REF-CAPTURE-001`, mesmo crítico retomado, R2/retrabalho **1 de 2**, sem novo ator ou descendentes. Julgamento conforme o [contrato R2](../review-contract-r2.md) e o [freeze R2](../review-inputs-r2.json). Fonte normativa: [snapshot SPEC0238](../spec-r2.source.txt), **56.607 bytes**, SHA-256 `48b270842ec83b422ecafeff2a4e802abd2194838ad3669becd2ebf825c464e6`. Todas as linhas citadas abaixo pertencem a esse snapshot.

APPROVE_SPEC significa que o desenho delimitado pode compor um pedido concreto de decisão humana T3. **Não aprova BUILD, captura, compatibilidade nativa ou paridade. RC01–RC11 runtime permanecem NOT_RUN.**

## Disposição conjunta dos achados R1

| Grupo anterior | Disposição R2 | Âncoras e fundamento |
| --- | --- | --- |
| G1 / R1-01 — wire e proveniência, P1 | RESOLVIDO_DOCUMENTALMENTE | L134–181: substituição expressa do wire v1, 19 linhas de tipos/direções/payloads/admissão, aliases fechados, ACKs, framing, dimensões, EOF, registros físicos e associação aos artefatos. |
| G2 / R1-02 — script fixo, P2 | RESOLVIDO_DOCUMENTALMENTE | L84–96: `message_start`, sequência de sete eventos, cinco IDs literais sem escapes, canonicalização, delimitadores LF e exemplo expandido de `message_stop`. |
| G3 / R1-03 — estados parciais, P2 | RESOLVIDO_DOCUMENTALMENTE | L124/L183–197: FAILED, dispatchRef, failureOrders e distinção entre tentativa incerta, PID observado, incompatibilidade, captura completa e falha global posterior. |

O contrassenso específico de END_CASE foi eliminado: somente HOST→observer; CASE_ENDED é o ACK observer→HOST. CONFIGURE vincula porta/perfil/envs antes do alvo; ARM/ARMED e START obedecem à sequência e ao vínculo processo/caso. O envio intencional, o resultado da escrita e a observação do filho são registros distintos. Não se deduz entrega ou execução de um comando apenas porque foi emitido.

Os cinco IDs estão escritos integralmente: `msg_cvg_TEXT_1`, `msg_cvg_READ_1`, `msg_cvg_READ_2`, `msg_cvg_WRITE_DENIED_1`, `msg_cvg_WRITE_DENIED_2`. A serialização `C(inputLiteral)` agora é a regra expressa dos deltas de ferramentas; não se transporta a redação anterior de JSON.stringify para produzir uma segunda interpretação. Nada disso afirma aceitação pelo Claude instalado.

Em B, NOT_RUN exige ausência de dispatch e de observações do caso. FAILED cobre timeout e falha de spawn mesmo sem PID confirmado. INCOMPATIBLE exige tentativa/transcrição observada sem causa infra superior; uma falha infra adicional preserva ambas as causas e conduz a FAILED. Casos CAPTURED podem permanecer assim quando apenas o cleanup/publicação global falha, mas o run falha. Os exemplos corrigem conjuntamente os três problemas, sem converter captura em qualificação semântica.

## Coerência integral dos apêndices A/B

| Fronteira documental | Julgamento |
| --- | --- |
| Direção, admissão, janela e término | Esquemas fechados e comandos/ACKs distinguem intenção, execução e conclusão. Replays, papel incorreto, salto de caso e falta de ACK impedem outro fork. STOP só admite finalizadores de operações anteriores; novo BEGIN não ganha êxito. L134–164. |
| CVGN2 | Header de 11 bytes, I0–3 e canal 1/2; streams separados, dois terminadores por filho iniciado, hashes/tamanhos ligados a END. Versão é processo 0, com evidência global, não um quarto caso. L162/L168–179/L189. |
| CVGO2 | Header de 14 bytes; caso/request/kind/segment possuem combinações fechadas. Ordinal HTTP global não reinicia; STATE usa dimensões próprias. Terminadores e contiguidade são por chave; papel físico não é escolhido pelos dados. L168–179. |
| Bytes tentados versus enviados | Segmento registra tentativa e callback. Falha interrompe segmentos seguintes; BODY deriva do prefixo FINISHED, sem afirmar recepção pelo cliente. COMPLETE exige plano igual, finish e ausência de erro/close prematuro. L96/L153–154/L177–179. |
| Raw, EOF e origem física | RAW_PIPE por papel, offsets sem gaps/reuso e derivações físicas separadas. Cauda incompleta é PARTIAL_PIPE, sem chave/EOF inventados. FRAME mantém bytes e objeto; partições são validadas antes da união e refs resolvem no arquivo nomeado. L114/L168–181. |
| Ledger, caps e falha parcial | Bijetividade/ordem/causas preservadas; eventRef null só no sufixo justificado pelo cap HOST. Estouro do ledger deixa pending, sem relatório completo. Tetos de wire/frame/objeto precedem alocação; provas ausentes não se tornam PASS. L106/L116/L126/L179–181. |
| Estados, cleanup e publicação | Falha antes do dispatch mantém casos NOT_RUN; depois do dispatch admite FAILED sem START inventado. Transcrição completa requer ACK/estado/IO reais. Cleanup incerto/global e link falho impedem COLLECTED/publicação enganosa. L108/L124–130/L185–197. |

As contraprovas foram julgadas como regras documentais: END_CASE do cliente, magic do observer no pipe do cliente, READ/I1, EOF duplicado, bytes após terminador, header incompleto, timeout após start, spawn sem PID, JSON nativo inválido, cleanup global falho e link final falho. O contrato determina rejeição ou parcialidade sem preencher lacunas com o plano. **Não foi executado parser, validador futuro, ferramenta nativa ou teste de aplicação.** Os exemplos JSON continuam exemplos, sem crédito de captura.

## Julgamento por critério

Todos os critérios abaixo têm desenho **SUFICIENTE para a decisão documental delimitada**; o estado runtime de cada um continua **NOT_RUN**.

| Critério | Evidência e limite |
| --- | --- |
| RC01 — inputs/closure | L27–31/L52–54: perfis literais, bootstrap antes de imports, FDs, closure e inputs fechados; regressão0235 preservada como obrigação futura. |
| RC02 — contenção | L35–48: pins, cinco binds RO, namespaces, limites, ownership e preflight antes do alvo. Nenhum inspect real nesta revisão. |
| RC03 — inputs consumidos | L58–66/L142–181: argv/env/stdin/caso ligados a comandos, filhos, canais, hashes e artefatos. |
| RC04 — SSE/consumo | L76–96/L153–179: script unívoco, plano separado da escrita, callback/finish separados do consumo e prefixos falhos preservados. |
| RC05 — READ | L79/L82: callback real por ID, conteúdo integral mesmo errado e final constante; nenhuma asserção semântica fabricada. |
| RC06 — WRITE_DENIED | L80/L110: callback, denial tool/input/ID e ausência de efeito; filesystem RO sozinho não comprova policy. Shape permanece hipótese. |
| RC07 — caps/privacidade | L70/L98/L102–106/L134–179: teto por domínio, auth sanitizada, framing limitado e falha explícita; nenhuma qualificação de implementação. |
| RC08 — proveniência/falhas | L114–126/L177–189: origem física, frames/offsets/digests, ledger e status independentes de declaração de sucesso. |
| RC09 — cleanup/publicação | L108/L126–130/L183–197: causas globais, IDs próprios, partial e publicação exclusiva; erro posterior não desaparece. |
| RC10 — gates/regressão | L126/L212/L215: permanece externo/NOT_RUN; crítica de código antes do alvo, 250 regressões e gates atuais são plano pós-gate. |
| RC11 — autoridade | L11/L122/L128/L213–217: 117+17, PAR/M1/produção sem crédito, índices/receipts não automáticos e gate T3 próprio. |

CURRENT/PROPOSED/UNKNOWN continuam separados em L13–21. Ajuda/literais e documentação oficial congelada sustentam hipóteses; o probe0235 só observou 503. Incompatibilidade futura falha fechado, sem trocar flags, modelo, binário ou script silenciosamente. Não se exige demonstração runtime anterior ao gate que autoriza a tentativa.

## Evidências, limites e encerramento

Checks inertes efetuados: **43/43** verificações do freeze (18 snapshots, 18 correspondentes e sete metadados); igualdade dos 17 registros originais com R1; sete artefatos de R1 conferidos pelo manifesto anterior, mais snapshot antigo e peer HISO; dez JSONs de inputs/metadados sem duplicatas/números não finitos; inspeção de offsets/tamanhos dos três exemplos hex; conferência dos cinco IDs e das 19 linhas da tabela. O cálculo dos headers confirma 11/14 bytes; isso não testa o parser do coletor. A conferência final de hashes/links consta nos artefatos desta revisão.

O [recibo de migração](../identifier-migration.json) é consistente com a troca de identificador ainda não aprovado. O snapshot antigo permanece com SHA `917c462aaeee16ca381e4b716a0ac68f516274d1f9577d6d4d42e8cb76750fb0`; o [manifesto R1](../../spec0237-decision/review-r1/manifest.json) permanece com SHA `afa52ad9a038f047b00b68428a15a6ed8bb0cde4dd1c499d36637c45439cf627`. A SPEC237 HISO conserva o digest declarado no recibo. A renumeração não reinicia orçamento nem altera autoridade.

Confiança: **alta na suficiência documental, limitada à fonte congelada**. Permanecem desconhecidos compatibilidade nativa, execução real dos ramos de permissão e comportamento do código futuro. Não houve rede/reabertura das páginas oficiais, app, native, testes, build, Docker, PG, instalação, import de código do projeto ou descendentes. Não há atestação de memória/kernel/daemon nem certificação de segurança ou funcionalidade por este parecer.

Escrita somente nesta lane, registrada no [claim local](claim.json). SPEC, inputs, estado, ledgers, catálogo, fontes, peer e bytes de R1 não foram alterados por este crítico. O [resultado estruturado](result.json), os [checks documentais](documentary-checks.json) e o [manifesto](manifest.json) registram critérios, digests e limites; o manifesto exclui seu próprio hash, informado separadamente no retorno.

Próximo passo: Lead incorporar este parecer ao pacote SHA da SPEC0238 para a decisão humana T3 já prevista. Não há retrabalho documental obrigatório adicional nesta R2. O orçamento permanece um crítico total, retrabalho1/2 e zero descendentes; a aprovação documental não encerra Q01/M1 ou concede BUILD.
