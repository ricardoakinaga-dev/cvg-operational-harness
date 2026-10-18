# Revisão independente R1 — HISO005 / SPEC0234 e plano0389

**Veredito: ACCEPT_SPEC. Correções obrigatórias: nenhuma.**

Revisão técnica documental, em contexto independente, sem descendentes. Aceita o contrato de P1 para apresentação à revisão humana T3; não autoriza BUILD, não aprova implementação, não concede PASS à fronteira e não encerra HISO-005/B6. Os 14 aceites continuam **NOT_RUN** quanto à implementação.

## Escopo e identidade dos inputs julgados

Escrita delegada exclusivamente neste REPORT.md e em review.json. Demais caminhos readonly; continuidade, checks T1 e pacote de decisão pertencem ao lead. A delegação do usuário delimita esta unidade; não foram alterados claims, ledgers, fontes, candidatas ou programas concorrentes.

| Input congelado | SHA-256 efetivamente calculado |
| --- | --- |
| docs/02_spec/0234_b6_installed_content_identity.md | b33aff4d1d1e36d64dd97298bc73d1c058220776c349e6704478303ef8a9c76d |
| docs/03_build/0389_hiso005_positive_proof_execution.md | 560d63c93d1b4702a63f9fa0b1a05d9966facd763ba2dec9049c836e9c759e3b |

Ambos coincidem com review-inputs.json. Fontes de apoio não se tornam inputs normativos adicionais deste veredito.

## Achados obrigatórios

Nenhum achado P0/P1/P2 que exija revisão dos dois inputs. Não foi exigida de P1 a prova semântica reservada expressamente a P2/P3.

## Fundamentação por fronteira do contrato

**Autoridade e escopo.** SPEC0234:5,19,61–63,90 e plano0389:13,18–22,26,32 conservam a separação necessária: identidade física é observação adicional; todos os instalados continuam verified:false; tabela inativa, exceptionsApplied:false, normal=strict e baseline INCOMPLETE. Produto conhecido conserva FAIL. P2 retém semântica, exports/loaders, receptores, configuração e espelhos; P3 exige integração controlada, consumidor, crítica e nova B6. Isso é compatível com SPEC0228:58–76,80–100. A aprovação anterior da0228 não foi reutilizada para o novo mecanismo.

**Referência e confiança.** SPEC0234:27–31 exige snapshot/cache próprios, sem conteúdo derivado do node_modules avaliado, hashes da ferramenta, configuração efetiva e SRI verificado contra lock congelado. A independência é do procedimento de construção em relação à instalação avaliada, e não independência em relação ao lock/npm escolhidos. SPEC0234:13,28,41 explicita essa base de confiança e o limite perante um responsável malicioso. Não há promessa de autenticidade institucional de pacotes nem de segurança do conteúdo SRI-idêntico. Recusar raízes/aliases/hardlinks evita autorreferências observáveis; não transforma digest em assinatura.

**Cache e viabilidade do recipe.** O recon original enumera 303 caminhos únicos, soma 60.775.410 bytes e declara todos os payloads regulares/presentes/SRI_MATCH. O apoio adicional recipe-cache-feasibility.json cobre as 354 entradas de registro: 304 disponíveis e 50 ausentes. Recontagem das linhas confirma que todas as ausências são optional e nenhuma é potencialmente aplicável pelo filtro estático os=linux/cpu=x64. O disponível adicional fora dos303 é node_modules/punycode. Portanto não há, nessa evidência, ausência de payload aplicável que refute o recipe proposto para esse host. Isso não demonstra a seleção efetiva do npm, libc/engines, resolução/peer/configuração, reify ou sucesso do comando.

A fonte local de pacote/npm foi apenas lida. O SHA-256 de pacote/lib/fetcher.js confere com toolchain-source-evidence.json: 1a385341f75d6c77496d30e7751012ad91489bb8c4e4e4db5e4568d2b9432a79. A implementação local usa cacache.get.stream.byDigest quando integrity/resolved estão disponíveis; o trecho posterior tem caminho de recuperação e remoção de cache em erro. Isso sustenta a plausibilidade de um cache próprio apenas com payloads, não prova que a invocação integral terá sucesso. O isolamento do cache original e a proibição de fallback online são relevantes mesmo com essa fonte fixada. ci.js foi lido estaticamente: valida lock/árvore ideal, reifica e condiciona lifecycle a ignore-scripts; nenhum desses passos foi executado.

**Execução, configuração e contenção.** SPEC0234:30–33 não confunde flags com prova: requer eliminação de configuração herdada, arquivos user/global próprios, configuração material revisada, sentinelas, observação de processos/conexões e encerramento de descendentes próprios. Na implementação, seleção real de Node/npm, variáveis materiais do bootstrap e resolução de caminhos devem satisfazer esse contrato; somente imprimir versões/argv não o satisfaz. Qualquer impossibilidade de eliminar configuração desconhecida, conter efeitos ou comprovar rede/scripts zero deve impedir referência válida. Não se exige aqui uma certificação geral de npm.

**Recibo e CLI.** SPEC0234:37–43,59 define versão/kind, escopo, identidade dos inputs e arquivos, digest esperado separado, canonicalização com comparação integral de bytes e recusa de campos obrigatórios ausentes/duplicados/tipos incorretos. Recodificação canônica e comparação integral recusam JSON com chaves duplicadas mesmo que JSON.parse sozinho as descartasse. A aceitação também exige validação de escopo físico: um recibo bem hashado não autoriza caminho fora da referência. A dupla de opções deve falhar estruturalmente quando incompleta/inválida, enquanto ausência de opt-in conserva0228; o resultado de identidade nunca muda a condição de passed do gate. A revisão da implementação deverá exercer o leitor/API/CLI reais, não somente a comparação de hashes.

**Inventário, links e limites.** SPEC0234:47–53 requer todos os arquivos, ocultos/extensões desconhecidas, tipo/modo, entradas extras/faltantes, pacotes aninhados e links; não há exclusão genérica de pós-install. Ausência por optional/plataforma/cache recebe UNAVAILABLE, e pacote novo exige reconciliação, sem teto303. Os limites têm unidades/valores, invalidação e proibição de elevação por CLI/env. Não é aceitável medir apenas um subconjunto e publicar MATCH, nem tratar parcial/timeout como sucesso. Os tetos não foram medidos e não garantem contenção de npm hostil; o contrato o declara.

**Validade temporal.** SPEC0234:43,51,79 exige revalidação antes/depois, invalidação de mutação, recusa de corrida e ausência de cache de veredito após mudança. A observação vale para os inputs/árvores efetivamente comparados; não atesta imutabilidade futura após a última conferência. ID-11 deve exercer mutações reais de bytes/tipo/link e invalidação no consumo posterior, sem se resumir a igualdade nominal de timestamps. Este parecer não afirma que já exista um protocolo de coleta implementado capaz de satisfazê-lo. Um BUILD que apenas faça duas leituras sem demonstrar a recusa exigida não poderá usar este ACCEPT_SPEC como aceite da implementação.

## Capacidade de refutação dos 14 aceites

A tabela avalia a qualidade do oráculo proposto, não registra execução de testes. Cada linha é capaz de refutar uma classe concreta de implementação errada; a evidência de BUILD deverá usar arquivos/processos/erros reais, como exige SPEC0234:84.

| Critério / linha SPEC0234 | Implementação errada que deve ser refutada | Avaliação documental |
| --- | --- | --- |
| ID-01 / 69 | Comparador que sempre recusa ou converte MATCH em verified:true/PASS | Positivo discriminante; exigir inventário completo e resultado conservador. |
| ID-02 / 70 | Comparar só manifesto, versão ou identidade nominal | Corpo diferente deve produzir MISMATCH. |
| ID-03 / 71 | Filtrar extensões/ocultos, omitir entradas ou ignorar tipo/modo | Variantes físicas devem aparecer como diferenças. |
| ID-04 / 72 | Aceitar payload corrupto/SRI ausente ou referência autorreferente | Recusa observável; limite de proveniência humana não é ocultado. |
| ID-05 / 73 | Ignorar binding de lock/config/toolchain/recibo/digest, reutilizar parcial | Invalidação sem fallback; exercer também validação estrutural/canônica do leitor exigida em37–39. |
| ID-06 / 74 | Seguir link cegamente, ignorar filho ou esconder produto atrás de link | Estados explícitos e FAIL de produto preservado. |
| ID-07 / 75 | Converter artefato igual, mas semanticamente perigoso, em confiança | Concatenação byteidêntica continua INCOMPLETE. |
| ID-08 / 76 | Reativar tabela, confiar no receptor nominal ou enfraquecer FAIL | Conserva os negativos da0228. |
| ID-09 / 77 | Demonstrar isolamento apenas com strings de flags ou mocks | Sentinelas e observação real do recipe podem refutar scripts/conexões e offline ausente. |
| ID-10 / 78 | Truncar inventário ou omitir dependência indisponível | Ausências e limites não podem fabricar completude. |
| ID-11 / 79 | Confiar em coleta obsoleta, timestamp nominal ou cache pós-mutação | Mutações reais invalidam; protocolo concreto ainda precisa ser demonstrado. |
| ID-12 / 80 | Perder diagnóstico/aresta ou remover negativos para acomodar mudança | Comparação por ocorrência/objeto e156regressões evitam prova baseada só em contagem. |
| ID-13 / 81 | Declarar sucesso sintético como cobertura da instalação real | Obriga recipe/revisão próprios,303 anteriores e novas entradas, com ausências explícitas. |
| ID-14 / 82 | Alterar integração/consumo/recursos sem evidência corrente | Gates completos, integridade, consumidor e crítica continuam obrigatórios. |

A matriz é suficiente para iniciar a implementação sob o gate humano correspondente; não é uma alegação de cobertura exaustiva de qualquer implementação adversarial. Em particular, ID-05 deve ser lido com37–43/59, ID-09 com30–33 e ID-10/11 com43/47–53. Casos felizes isolados ou um único erro de hash não demonstram todos esses contratos.

## Limites principais e handoff

1. Nenhum npm ci/install/extract, código de aplicação, rede, cache mutation, PG/Docker, certify/E2E, commit/push/deploy foi executado. Leituras locais e cálculo de hashes/contagens não são execução do recipe.
2. O recon completo resolve a dúvida estática sobre payloads possivelmente aplicáveis por os/cpu neste host; não resolve todas as dependências da execução npm. A referência real pode legitimamente tornar-se UNAVAILABLE.
3. Node/npm locais e responsável pelo recipe são parte explícita da confiança. Digest externo fixa bytes; não assina proveniência, não protege contra responsável malicioso e não certifica semântica.
4. Desempenho, limites, race detection, formato real do recibo, sanitização/configuração e contenção são obrigações de BUILD ainda não demonstradas. Falhar nelas impede aceite; o parecer não concede dispensa.
5. Lifecycle desativado pode produzir diferenças legítimas com a instalação existente. Isso exige MISMATCH/UNSUPPORTED explícito, sem exclusão automática.
6. P1 não concede verified:true, supressão, PASS, B6 ou produção. P2/P3 permanecem integrais na mesma frente; nenhuma nova frente foi iniciada.

Próxima ação do lead: concluir checks T1/pacote/controles fora dos dois inputs e apresentar a decisão humana T3 vinculada aos hashes efetivamente julgados. Se os inputs mudarem, este parecer não se transfere silenciosamente à nova versão.
