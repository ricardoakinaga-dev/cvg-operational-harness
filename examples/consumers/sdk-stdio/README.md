# SDK stdio sintético

`child.mts` compõe `createSdk` com sessão em memória, kernel real e modelo
determinístico sem chave. O tenant vem do host. stdout contém apenas JSON-RPC
delimitado por LF; mensagens fixas ficam em stderr.

`runSdkStdioExample` abre o child conhecido, negocia v1, abre sessão, envia um
turno e lê os eventos. O child usa ambiente mínimo, HOME temporário próprio e
diretório explícito; opções de inicialização Node do pai não são herdadas. O owner fecha o transporte e espera no máximo 1000 ms,
envia SIGTERM, espera 500 ms e usa SIGKILL com espera final de 250 ms. O retorno
ocorre após o fechamento, incluindo o diagnóstico final. O diretório temporário
só é removido quando a saída é confirmada. Esse exemplo pressupõe Node, loader
e dependências locais confiáveis; ele não estabelece isolamento de sistema
operacional para programas arbitrários.

Para executar a fonte, use Node 22 e o `tsx` já instalado no workspace:

```sh
node --import tsx --input-type=module -e "const { runSdkStdioExample } = await import('./examples/consumers/sdk-stdio/index.mts'); await runSdkStdioExample()"
```

Para validar os exports compilados, o Lead deve executar o builder existente
`node scripts/build-public-workspace.mjs packages/sdk`, compilar este exemplo
com os exports dos pacotes sem aliases de fonte e executar o mesmo percurso
com `child.mjs`. Builds dos pacotes dependentes e pins públicos são do Lead.

`SdkWireError.outcome === 'unknown'` exige consulta à sessão/journal ou handoff.
Não há retry, provider, HTTP, ACP ou efeito clínico nesta demonstração.
