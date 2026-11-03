# Provisionamento da CLI — proposta autoral

O [anexo0310](../../../../02_spec/0310_cli_connection_auth.md) descreve uma alternativa concreta para a parte de provisionamento de F1: consentimento pelo OIDC existente, credencial curta emitida pelo CVG, emissão/poll/revogação, concorrência e entrega incerta, armazenamento local privado, saída e lifecycle de cliente.

É **AUTHOR_DRAFT**, sem revisão independente, aprovação humana ou implementação. Não há novo endpoint, credencial emitida, migration, login, teste de aplicação ou recurso aberto. Os doze comandos originais permanecem obrigatórios; auth login/logout são dois auxiliares adicionais propostos, cujo gate e aceite não são presumidos. AF01–AF12 estão NOT_RUN.

Oito snapshots de autenticação do bootstrap anterior foram conferidos contra seus objetos Git imutáveis. As preimagens da SPEC0310 e de BOOTSTRAP-R2 foram guardadas antes dos vínculos aditivos; o CONTRACT-R2 operacional não foi alterado. Referências primárias RFC8628/7009 foram consultadas para o protocolo; limites, armazenamento e integração CVG são propostas do autor. Ver [fontes](source-inputs.json), [task](task.json) e [checagem autoral](author-check.json).

A comparação com a candidata9ccb encontrou sete fontes iguais e o hook de sessão diferente: a versão posterior usa a identidade devolvida pela revalidação, enquanto o alvo lê a identidade no registro. A [diferença estática](target-auth-comparison.json) foi acrescentada como pré-condição explícita de disposição/qualificação do owner de identidade. Nenhuma fonte foi corrigida por este trabalho e nenhuma exploração/reprodução de segurança foi executada.

F1 ainda precisa do transporte autenticado conjunto de sessão, native0239 e K06, com wire, limites e prova de composição real. Rate-limit, schema/migrations e retenção exigem reconciliação dos responsáveis. F5 continua dependente do wire202 do ownerK06. Não houve nova revisão da CLI inteira nem reinício de orçamento do parecer HerschelR1. Somente depois de fechar essas pendências cabe revisão técnica final e apresentação de contrato T3 ao usuário.

A certificação5be96143 continua em paralelo, na mesma execução; a candidata9ccb está preparada para seus próprios gates globais depois do terminal/limpeza da campanha atual. Este documento não aprova paridade, integração canônica, push ou produção.
