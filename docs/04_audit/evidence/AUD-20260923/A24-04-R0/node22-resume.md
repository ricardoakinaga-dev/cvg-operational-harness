# Retomada ambiental do gate M07-S1-R1

O Node `v22.23.2` já está instalado em `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`. O shell padrão desta estação seleciona Node `v24.20.0` porque `nvm alias default` aponta para 24.20.0. O projeto fixa 22.23.2 em `.nvmrc` e `package.json` aceita somente Node 22. O gate R1 aprovado determina parar se sua primeira linha não retornar `v22.23.2`.

Para **iniciar um novo processo** no ambiente correto, sem alterar o default global ou instalar nada:

```bash
cd '/home/ricardo/Área de trabalho/cvg-operational-harness'
env PATH="/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH" bash --noprofile --norc
```

Dentro desse shell, a primeira linha da retomada do gate deve ser exatamente:

```bash
node --version
```

Continuar só se retornar `v22.23.2`; depois seguir, em ordem, [o pedido R1 aprovado](r1-gate-request.md). Um shell que começou em Node 24 e falhou a primeira linha não deve ser usado para continuar a mesma tentativa. O ambiente selecionado via `PATH` existe apenas nesse novo processo e seus filhos; não altera `.nvmrc`, o NVM default, arquivos do repositório ou o processo Codex já em execução. Em verificação local separada, esse novo shell retornou `v22.23.2` e `codex --version` retornou `codex-cli 0.156.1`.

Se for necessário iniciar outra sessão Codex nesse shell, o comando instalado é `codex`. A [documentação oficial da OpenAI](https://developers.openai.com/learn/developers-codex-plugin) também mostra o início do Codex CLI com `codex`. O novo agente deve recuperar o estado CVG e o SHA do pedido antes de executar o gate; não atribuir PASS aos preflights apenas porque este runbook foi escrito.

## Observação desta rodada

Um shell novo com esse `PATH` foi aberto sem alterar o alias NVM. Nele, `node --version` retornou `v22.23.2` e `node -p "require('typescript').version"` retornou `6.0.3`. O preflight read-only do passo 2 imprimiu `baseline_manifest_match=true`, `prior_candidate_manifest_match=true`, `baseline_count=973`, listas vazias de divergências, `historical_additions_match=true`, `new_test_absent=true` e `r1_output_directory_absent=true`. O shell foi encerrado; nenhum diretório R1, código, teste ou serviço foi criado/executado. Como a retomada operacional ocorrerá em novo processo, repetir os passos 1 e 2 nesse novo shell e registrar os exit codes antes do passo 3. O próximo passo mutável é criar o diretório de evidência e os snapshots de rollback exatamente como o pedido R1 determina.
