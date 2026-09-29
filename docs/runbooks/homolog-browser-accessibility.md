# Runbook — browser e acessibilidade da homologação (REM21-014)

Escopo: ambiente local/sintético/descartável. Produção: `NO_GO`.

## Preparação do checkout

Execute em Node 22, com dependências instaladas e claim próprio para os
artefatos que serão escritos. Um snapshot feito apenas dos arquivos
versionados não inclui necessariamente os `dist/` dos workspaces. O export
de `@cvg/shared` aponta para `packages/shared/dist/index.js`; o Vite precisa
desse arquivo para carregar o console.

No checkout sintético isolado, compile e confira esse pré-requisito:

```bash
node_modules/.bin/tsc -b packages/shared/tsconfig.json --pretty false
node --input-type=module -e "import { redactSensitiveText } from '@cvg/shared'; console.log('shared_export', typeof redactSensitiveText)"
```

O segundo comando deve imprimir `shared_export function`. Isso verifica
resolução do pacote; não substitui a matriz de navegadores nem autoriza
atualizar o lockfile. Reserve portas e diretórios de saída exclusivos e
confira o bind dos servidores: os entrypoints atuais usam `0.0.0.0`. Um
ensaio restrito a loopback precisa de configuração/fixture explícita para
API e Vite, com esse desvio registrado na evidência. Essa fixture não é
prova do entrypoint publicado.

## Gate qualificado

O proof trusted é separado da suíte histórica de simulação:

```text
npm run test:e2e:rem21-014
```

Ele usa `playwright.rem21-014.config.ts` e declara exatamente:

| Projeto  | Perfil          | Estado exigido   |
| -------- | --------------- | ---------------- |
| chromium | Desktop Chrome  | executado e PASS |
| firefox  | Desktop Firefox | executado e PASS |
| webkit   | Desktop Safari  | executado e PASS |

O CI instala os três browsers. Falha de instalação, browser ausente, `skip`,
`todo`, `flaky` ou resultado parcial bloqueia o gate. Nunca converter uma
limitação de ambiente em exclusão silenciosa.

## Autoridade e sessão

O API E2E roda com `CVG_IDENTITY_MODE=trusted` e key ring sintético local. A
spec assina um bootstrap fictício, troca-o por sessão opaca e então usa cookie
HttpOnly. O browser qualificado não envia `x-operator-id`, `x-operator-role`,
`x-tenant-id` ou token bruto nos requests protegidos. Campos de operador/papel/
tenant não são usados para adquirir autoridade.

O store da sessão é em memória e descartável. O fixture não representa IdP,
SSO, MFA, rotação produtiva ou multi-instância.

## Barra de UX/a11y

O report `certification/rem21-014-browser-proof.json` deve mostrar:

- `identityMode=trusted`, `production=false` e `realData=false`;
- cinco specs por browser, 15 resultados no total, todos PASS;
- `axe.blockingViolations=0` para WCAG 2A/2AA;
- nenhum impacto `moderate`, `serious` ou `critical`; impactos `minor` são
  registrados para revisão;
- bootstrap, expiração, foco de reautenticação, logout, recovery, role
  authorization e rotação de tenant cobertos;
- teclado/skip link, foco visível, contraste, reduced motion e overflow
  horizontal verificados em 375, 768 e 1440 pixels.

## Falhas comuns

### Tela branca ou heading ausente

Preserve o primeiro trace, screenshot, console, rede, relatório bruto e
identidade do snapshot. Um timeout no heading só informa que o console não
ficou visível dentro do prazo; não identifica sozinho uma falha de sessão,
contraste ou permissão.

Se o Vite reportar import de `@cvg/shared` não resolvido, confira o export
e o `dist/` antes de alterar o aplicativo. Se o trace registrar
`ERR_NETWORK_CHANGED` em módulos JavaScript, registre caminhos e horários
das requisições interrompidas; esse registro não identifica qual mudança
de rede ou processo do host causou a interrupção.

Depois de resolver um pré-requisito ou diagnosticar uma causa, repita a
matriz inteira com saídas novas, mantendo a falha inicial. Não acrescente
retries ou aumente timeouts somente para obter verde. O
[diagnóstico F07](../04_audit/evidence/AUD0590-EXEC-20260928/F07-browser/proof.json)
preserva uma falha de preparação por `dist/` ausente e um ensaio posterior
de 15/15; não constitui as duas execuções qualificadas exigidas abaixo.

### Browser não executado

Confirme as instalações locais:

```text
npx playwright install chromium firefox webkit
```

Se o CI falhar ao instalar um browser, corrija a imagem/dependências ou
registre uma decisão explícita de suporte antes de alterar a matriz. O contrato
`rem21-014-v1` rejeita `executed` diferente de
`[chromium, firefox, webkit]`.

### Axe bloqueante

Reproduza um único projeto:

```text
npx playwright test --config=playwright.rem21-014.config.ts --project=chromium
```

Corrija o componente/estilo responsável e repita nos três browsers. Não reduza
a severidade aceita nem adicione exclusão sem decisão documentada; contraste
faz parte da barra.

### Sessão expirada ou autoridade indevida

Verifique que a aplicação está em `trusted`, que o bootstrap é consumido uma
vez e que a recuperação injeta um novo token sintético. Nunca substitua a
sessão por headers autoafirmados para fazer o teste passar. Logout deve remover
o snapshot e devolver foco a `Reautenticar`.

## Evidência e limites

Para qualificação candidate-bound, use o gate `browser-proof` da barra CI; o
report deve carregar o mesmo `runId`/`candidateId` do estado da barra. Dois
runs do mesmo candidate são necessários para `VERIFIED_LOCAL`.

O proof não cobre leitor de tela completo, dispositivo físico, IdP real,
provider, canal, dados reais, produção ou ações clínicas/financeiras. Esses
claims continuam fora do escopo e não autorizam confirmação, cancelamento ou
reagendamento de consultas.
