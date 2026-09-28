# Reprodução sintética AUD-0586

Use Node 22.23.2 da toolchain do projeto. As sondas não acessam rede, banco ou dados reais. A medição de tempo abaixo é exploratória; compare a tendência dentro da mesma máquina, não os milissegundos absolutos.

## Regex de URLs e de instrução

Entradas usadas em `regex-probe.json`:

- URL: `https://example.test/` + `/` repetido `n` vezes + `x` (não termina em `/`).
- Instrução: `execute ` + espaço repetido `n` vezes + `X` (não termina em `tool`).
- `n = 2000, 4000, 8000, 16000`; três medições por tamanho; mediana.

As quatro ocorrências de `.replace(/\/+$/, '')` compartilham a expressão da primeira sonda. A segunda sonda chama a função exportada real. Com Node 22 selecionado, execute da raiz do repositório:

```bash
node --import tsx --input-type=module <<'JS'
import { performance } from 'node:perf_hooks'
import { hasUntrustedInstructionContent } from './packages/conversation/src/state.ts'
const cases = [
  ['url', n => 'https://example.test/' + '/'.repeat(n) + 'x', value => value.replace(/\/+$/, '')],
  ['instruction', n => 'execute ' + ' '.repeat(n) + 'X', hasUntrustedInstructionContent]
]
for (const [name, input, run] of cases) {
  for (const n of [2000, 4000, 8000, 16000]) {
    const ms = []
    for (let i = 0; i < 3; i++) {
      const value = input(n)
      const start = performance.now()
      run(value)
      ms.push(performance.now() - start)
    }
    console.log(name, n, ms.sort((a, b) => a - b)[1].toFixed(3))
  }
}
JS
```

O JSON contém os três tempos brutos por tamanho, além da mediana. Não execute strings maiores em serviço de produção.

## Alias TypeScript

Crie em diretório temporário `index.ts` importando `alias/x` e `src/x.ts` exportando um valor. Em `tsconfig.json`, use `paths: { "alias/*": ["src/*"] }` e rode `tsc -p <diretório> --pretty false`: exit 0. Repita com `paths: { "alias/*": ["src/*/more/*"] }`: exit 2 e `TS5062`. `ts-alias-probe.json` registra os códigos e mensagens sem o caminho temporário.

A sonda `alias-audit-probe.json` chama `createReport` com dois workspaces sintéticos e policy com baseline sintética desabilitada, primeiro com target `apps/beta/src/*` e depois `apps/beta/src/*/more/*`. Em ambos os casos houve `PASS`/exit 0; o segundo ficou `MISSING_ALIAS_TARGET`. Não há arquivo residual do workspace temporário.

## Rate limit

`rate-limit-probe.json` registra `buildServer()` em memória, `app.inject()` com 301 POSTs separados para cada rota `publish`/`rollback` e `app.close()` em `finally`. Payload é `{}` e parâmetros são sintéticos. Os primeiros 300 retornam 503 pelo perfil sem sessão/configuração funcional; o 301º retorna 429, `rate_limited`, `retry-after: 60` e `cache-control: no-store`. Essa sonda verifica o hook global no path, não o handler autenticado nem PostgreSQL.
