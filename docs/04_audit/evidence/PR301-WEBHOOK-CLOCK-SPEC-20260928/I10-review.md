# I10 — crítica independente da SPEC 0162

**Decisão: REVISE**

## Escopo e integridade

O SHA-256 de `docs/02_spec/0162_webhook_clock_highwater_marker.md` foi conferido antes da leitura e corresponde exatamente a `9a262565656c935aa8217a094bbdef7a05ba1a74ecf289ff90d1ae681a938ed9`.

Esta crítica usa somente a SPEC indicada. Não consultou os documentos referenciados, críticas/evidências anteriores, código ou histórico. Não executou testes, SQL, migration ou BUILD. As referências abaixo são seções e números de linha da SPEC cujo hash foi conferido.

## Achados

### P1 — Dois modelos incompatíveis de escrita do high-water

**Referências:** §Estado durável, itens 5–6, linhas 32–33; §Segurança e operação, linha 54; testes requeridos, linhas 87–88.

O item 5 revoga DML direto do runtime e concede somente `EXECUTE advance_guard(...)` para atualizar o marker. A linha 54 diz que o caminho normal dispensa `SECURITY DEFINER` e que o runtime altera a coluna com grant column-level. Os testes das linhas 87–88 voltam a exigir ausência de DML direto e avanço exclusivamente por `advance_guard`. Não é possível configurar simultaneamente essas ACLs. A escolha também muda quem executa o trigger, a fronteira de confiança da claim e o que o teste deve provar.

**Contraexemplo:** uma implantação segue a linha 54 e concede `UPDATE(highest_seen_at)` ao runtime. Ela viola a ACL dos itens 5–6 e permite tentativas de UPDATE fora de `advance_guard`; outra implantação segue o item 5 e a linha 54 descreve incorretamente seu principal fluxo de escrita.

**Aceite:** remover a contradição escolhendo um único caminho normativo. Se for `advance_guard`, exigir teste em que UPDATE direto falha e a função aceita somente claim witnessada, exata e vinculada à transação. Se for DML column-level, especificar como a claim é criada e consumida sem a função, e ajustar todas as ACLs e testes para esse modelo.

### P1 — O instante de microssegundos não tem contrato de transporte até o SQL e a decisão

**Referências:** §Estado durável, item 3, linha 29; item 6, linha 33; §Avanço e decisão, itens 1 e 4, linhas 44 e 47.

O protocolo exige que `sampled_at` seja idêntico ao valor testemunhado e que o trigger compare igualdade exata, mas não fixa representação/conversão entre `clock_timestamp()`/`timestamptz`, driver Node, JSON/JCS, HMAC, parâmetros SQL e leitura de volta. O runtime indicado é Node 22, onde uma conversão comum por `Date` conserva milissegundos, enquanto PostgreSQL pode devolver microssegundos. Também não define a unidade, precisão, arredondamento ou limite de aceitação do timestamp assinado pelo webhook ao compará-lo com essa amostra.

**Contraexemplo:** PostgreSQL amostra `2026-09-28T12:00:00.123456Z`; o runtime converte para `Date` e envia `.123Z`. O attest/witness cobre `.123456`, mas `advance_guard` recebe `.123000` e rejeita a igualdade. Se o sistema arredondar antes de assinar, o valor SQL deixa de ser o instante atestado. Na fronteira da janela, a mesma omissão pode fazer duas implementações classificar diferentemente uma assinatura com timestamp em segundos ou milissegundos.

**Aceite:** normatizar uma representação sem perda para `timestamptz` em todas as fronteiras (incluindo parse/serialize e bind do driver), proibir conversão por tipo com precisão menor, e fixar formato/unidade/precisão/canonicalização do timestamp assinado e a regra matemática inclusiva/exclusiva da janela. Testar round-trip de `.000001`, `.123456` e `.999999`, igualdade do digest e decisão nos dois limites da janela, inclusive depois de atraso entre amostra e UPDATE.

### P1 — O protocolo não fecha a semântica da assinatura de entrada

**Referências:** Contexto, linhas 11–13; §Estado durável, item 3, linha 29; §Avanço e decisão, itens 1–3, linhas 44–46; §Limites, linha 98.

A SPEC diz que valida a “janela assinada” e que assinatura/timestamp inválidos podem produzir resposta 401, mas não declara o contrato de entrada que liga assinatura, timestamp e evento: bytes cobertos, algoritmo e versão, parsing/canonicalização, origem confiável do instante assinado, unidade/precisão, tolerância e ordem de validação. Há dependência de SPEC 0160, mas o contrato necessário não é resumido ou identificado como interface normativa aqui. Isso deixa uma parte central da autorização impossível de implementar apenas a partir deste protocolo, e torna ambígua a alegação de que uma amostra witnessada autoriza a decisão.

**Contraexemplo:** dois handlers recebem o mesmo timestamp textual com fração de segundo e payload equivalente, mas um valida a assinatura sobre os bytes HTTP originais e outro sobre JSON reserializado; ou um interpreta o campo como segundos e o outro como milissegundos. Eles podem divergir sobre autenticidade/expiração mesmo usando a mesma amostra PostgreSQL.

**Aceite:** referenciar os identificadores exatos dos requisitos de 0160 que fixam esse contrato, ou incorporar uma definição normativa completa e versionada. Critérios devem rejeitar assinatura alterada, representação duplicada/ambígua, unidade errada e timestamp exatamente no limite conforme a regra declarada; casos válidos devem produzir decisão idêntica em todas as implementações conformes.

### P1 — “Reconciliation” após SAMPLE persistida e rollback não define uma transição executável

**Referências:** §Estado durável, itens 2–3, linhas 27–29; §Avanço e decisão, itens 1 e 7, linhas 44 e 50; verificação exigida, itens 1–2 e 5, linhas 85–89.

A SPEC corretamente mantém o gate fechado quando a witness tem SAMPLE acima do marker SQL. Porém, remete a “reconciliação exclusiva” sem definir a operação e sua prova: qual principal/função a executa, qual receipt/attest permite avançar, como o novo marker é escolhido, como a witness diferencia uma reconciliação de uma autorização, e qual transição idempotente resolve crash/ACK incerto nessa operação. `advance_guard` é descrita como consumo de `sample_attest` para uma operação normal; bootstrap e recovery têm operações próprias, mas não há protocolo de reconciliação pós-rollback equivalente. A regra “antes de qualquer nova decisão” pode assim manter o serviço fechado sem uma ação implementável para liberar o estado recuperável.

**Contraexemplo:** `SAMPLE=12:00:00.500000` é witnessada e a transação SQL reverte antes do COMMIT; marker permanece em `.400000`. Após reinício, o banco já está em `.600000`. A instância vê divergência e fecha o gate. A SPEC manda reconciliação exclusiva, mas nenhum passo diz se ela cria outro SAMPLE em `.600000`, reutiliza o receipt `.500000`, usa `advance_guard`, ou publica um novo tipo de record antes/depois do SQL. Um crash durante essa ação repete a ambiguidade.

**Aceite:** especificar máquina de estados e protocolo de reconciliação (lock/fence, prova e nonce, amostra-alvo, função/ACL, ordem SQL/witness, readback, retry por operation_id e tratamento UNKNOWN_COMMIT). Testar os crashes antes/depois de cada append e COMMIT, repetição idempotente, marker abaixo/acima da máxima externa e relógio ainda abaixo da máxima; nenhum caminho deve abrir gate antes do readback e da prova witnessada.

### P1 — A ordem de medição temporal não limita o erro de associação entre chrony e clock PostgreSQL

**Referências:** §Estado durável, item 3, linha 29; §Avanço e decisão, item 1, linha 44.

A amostra PostgreSQL exata é associada a chrony/monotonic midpoint, dispersão, offset e idade A2, mas a SPEC não define como calcular o limite de erro da amostra PostgreSQL a partir dessas medidas, nem exige uma janela máxima entre as leituras de chrony e `clock_timestamp()`. Um deadline monotônico limita idade posteriormente, mas não demonstra que o instante DB amostrado estava dentro do erro permitido quando foi capturado.

**Contraexemplo:** chrony é medido saudável; antes da consulta SQL, o relógio PostgreSQL sofre um step para frente ou para trás; a leitura `clock_timestamp()` recebe os metadados da medição anterior. Sem limite de intervalo e regra de incerteza, a política pode tratar como saudável uma amostra cuja relação com o relógio de referência não foi medida.

**Aceite:** definir ordem e intervalo máximo entre medições, fórmula de erro/incerteza aplicada ao instante PostgreSQL e limiar fail-closed, usando somente relógio monotônico para idade. Testar steps antes, entre e depois das leituras, atraso da consulta e ultrapassagem do limite de idade; nenhuma amostra fora do orçamento A2 deve autorizar nem alterar o estado como se fosse saudável.

### P2 — O modelo de atestação HMAC não fecha rotação e consumo atômico entre verificador e banco

**Referências:** §Estado durável, itens 3, 5 e 7, linhas 29, 32 e 34–36.

A SPEC requer atestações one-use, `key_version`, validade curta e validação no PostgreSQL por `pgcrypto`, ao mesmo tempo que põe a chave no HSM do verificador e em tabela privada do guard-owner. Não define distribuição/rotação/revogação dessas cópias, sincronização de versão, nem se a invalidação do nonce/attest ocorre atomicamente com a claim transacional. Como HMAC é simétrico, todo validador que possui a chave também pode produzir uma atestação válida; a fronteira de confiança e o procedimento em falha precisam ser explícitos.

**Contraexemplo:** a rotação instala `key_version` nova no verificador antes do banco, ou vice-versa. Uma instância em retry apresenta attest ainda válido sob a versão antiga; outra já revogou essa versão. A SPEC não determina se ambas aceitam, nem como um attest concorrente deixa de ser one-use após rollback SQL.

**Aceite:** definir protocolo de rotação com versões simultaneamente válidas, instante/condição de revogação, falha parcial e fail-closed; esclarecer que principal pode emitir e qual componente é confiável para validar; definir consumo persistente/concorrente e interação com rollback. Testar rotação nos dois sentidos, attest antigo/novo, replay concorrente em duas sessões e rollback seguido de retry.

### P2 — A garantia de “nunca abriu” e de completude depende de cobertura operacional não definida

**Referências:** §Estado durável, item 2, linha 27; §Rollout e compatibilidade, linhas 78–81; verificação exigida, itens 1 e 6, linhas 85 e 90.

O desenho exige inventário completo de boots/intervalos de serving desde genesis, cadeias de controller e observer, checkpoints WORM e fencing comprovado. Não fixa como cada instância registra o início/fim de serving antes de receber tráfego, nem como inventário externo prova ausência de uma instância sem registro (por exemplo, uma instância isolada ou credencial antiga ainda válida). A exigência de resposta assinada corrente não corrige por si só uma lacuna de cobertura na origem do inventário.

**Contraexemplo:** uma instância antiga perde conectividade com controller/witness e continua servindo com credencial ainda válida enquanto a frota nova tenta bootstrap. Se o sistema registrar apenas os boots que conseguiram append, a cadeia pode estar íntegra e ainda omitir essa instância; uma resposta current pode não provar “never opened” nem que não há serving antigo.

**Aceite:** especificar mecanismo de admissão que torne impossível servir sem lease/fence atual validado em cada decisão, além de inventário e revogação de credencial. Testar instância isolada, controlador indisponível, boot não registrado, credencial antiga e partição durante abertura; em todos, nenhum webhook pode ser aceito por instância fora da epoch corrente e bootstrap/reopen deve falhar fechado.

## Testes de aceite adicionais consolidados

1. **Precisão:** preservar sem perda uma amostra PostgreSQL com seis casas fracionárias por driver, JSON/JCS, HMAC, SQL bind, trigger e readback; validar também fronteiras temporais assinadas e atraso após sample.
2. **Assinatura e claims:** vetores válidos e negativos cobrindo bytes originais, canonicalização, versão, timestamp/unidade, duplicidade/ambiguidade, campos extras, digest alterado, receipt de outra operação/epoch, replay e expiração.
3. **Transações e retry:** em cada crash point entre SAMPLE, attest, claim, UPDATE, reserva e COMMIT, comparar marker SQL e head witness; repetir a mesma operation_id após resultado conhecido e UNKNOWN_COMMIT; provar que só a reconciliação especificada libera o gate.
4. **Bootstrap e recovery:** interromper após receipt externo e em cada COMMIT/readback/rebase/open; retries não duplicam epoch, baseline, receipt ou consumo; baseline nunca fica abaixo da maior amostra/decisão provada.
5. **ACL e claims:** verificar ACL efetiva para todos os principals, UPDATE direto negado no modelo escolhido, claim one-use vinculada a PID/txid/OLD/NEW e impossibilidade de `SET ROLE`, GUC ou privilege transitivo forjar contexto.
6. **HA/fencing:** particionar writer antigo, atrasar/reverter standby, duplicar identidade, interromper CAS/fence e restaurar antes/depois da fence; somente uma epoch pode escrever e nenhum gate abre sem readback e prova atual.
7. **Carga:** manter o perfil de desempenho prescrito após incluir caminho real de witness, verifier e receipts, contabilizando atrasos e falhas em todas as requests agendadas; publicar os cinco resultados individuais sem excluir timeouts.

## Riscos residuais

O protocolo depende de disponibilidade e correção de serviços administrativos independentes (controller, observer, witness, sink, authority de fencing, verificador e registry de identidade), além da completude e retenção de seus registros. A SPEC exige fail-closed quando essas provas faltam, o que pode interromper serving durante partições ou falhas prolongadas. As garantias também dependem de configuração PostgreSQL, identidade/rotação de certificados e operação de fencing corretamente provisionadas. B3, D-06, provider/IdP/canal reais, CI/atestation e gates de staging/produção continuam explicitamente fora deste escopo (§Limites, linha 98).

**REVISE** pelos achados P1. Este parecer não aprova T3, não autoriza BUILD e não altera os gates listados na própria SPEC.
