# Probe privado da porta nativa

Implementa a SPEC0235 aprovada, usando os hashes e limites fixos de `protocol.mjs`.
É uma ferramenta de reconhecimento local: um POST observado contra um endpoint
sintético que responde503 não prova sucesso funcional do modelo nem paridade.
Não produz recibos para o comparador0229 e mantém `reviewStatus: PENDING`.

A CLI exige `--manifest FILE --evidence-root PRIVATE_DIR --out NEW_DIR`.
O manifesto fica sob evidence-root privado e contém somente
`{"version":1,"runId":"ID_ASCII","fixtureId":"NATIVE_PORT_503_V1"}`.
A saída é exclusiva e nova. Não aceita URL, imagem, prompt, credencial ou comando
alternativos. Não instalar dependências ou baixar imagem para contornar bloqueios.

Antes do uso real, conferir aprovação humana da SPEC exata e revisão independente
do código congelado. A execução utiliza dois contêineres próprios, rede none e
rede compartilhada somente entre eles, sem conta/modelo real, porta publicada,
perfil pessoal ou montagem RW da saída. A versão nativa precisa ser observada
antes do prompt sintético. Recursos sem remoção confirmada permanecem explícitos
no relatório e exigem handoff; falha de daemon não garante limpeza.

`controller.test.js` usa um transporte e cliente nativo simulados, identificados
como `SIMULATED_TEST_CONTROL_PATH_NOT_NATIVE_EVIDENCE`. Esses testes verificam o
controlador, não satisfazem os controles positivos de contenção/HTTP real. Os
outros testes cobrem parsing fechado, perfis, protocolo, limites, entrada/saída,
identidades de erro, framing e CLI.

A confiança limita-se ao host, wrappers e coletor aprovados. A chave sintética é
um marcador de roteamento, sem atestação criptográfica do processo remoto. EOF,
falha de protocolo, limite, timeout, sinal, drift ou cleanup impedem sucesso. O
handshake attach é limitado a2s; a observação do stream segue o prazo total30s.
Eventos HTTP recebidos depois de STOP são recusados conservadoramente. Não há
proteção contra host malicioso, nem promessa de durabilidade após crash do host.
EOF/cap na quinta tentativa é falha incompleta, nunca ordinal inventado.

O bootstrap confiável importa somente builtins e seus templates fixos antes de
congelar a closure. Em seguida, carrega o único controlador permitido dentro do
snapshot; os demais imports do host resolvem dentro dessa cópia. Os descritores
dos originais e das cópias ficam retidos até a verificação final. O controlador
fecha os descritores e remove esse snapshot temporário antes de publicar. A
allowlist fixa de builtins integra o perfil; nenhum JSON escolhe um módulo novo.

Os testes de regressão também executam o controlador copiado contra o transporte
simulado. Alterações físicas que impedem um inventário coerente deixam evidência
parcial com erro e sem relatório final publicado. Essa ausência é incompletude,
sem crédito para o catálogo.

SIGINT/SIGTERM são tratados desde a entrada do bootstrap, incluindo o intervalo
em que o controlador copiado é importado. A entrada só libera seus handlers
quando o controlador confirma que instalou os próprios. Os testes usam sinais
reais em subprocessos com grafos e controladores sintéticos; nenhum alvo real
é iniciado por esses controles. Relatórios de falha revalidam cada PASS com as
provas da etapa atingida, preservando os controles que de fato foram executados.
