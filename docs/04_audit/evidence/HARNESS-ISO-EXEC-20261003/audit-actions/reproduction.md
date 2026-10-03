# A4 — reconstrução e captura independentes de /tmp

Os scripts deste diretório recebem paths explícitos e usam somente arquivos do repositório para reconstruir as fontes. Dependências são instaladas pelo lock preservado; Python 3, Git, Node 22/npm, cache npm ou registry, Docker/PostgreSQL e browsers Playwright são pré-requisitos de ferramentas. Não se promete executar npm sem os packages do cache, nem reconstruir binários externos a partir de documentos.

Execute a partir da raiz do repositório. Escolha um diretório novo, durável e exclusivo fora do checkout; registre claim para ele e os recursos de teste. Nunca reutilize o snapshot histórico em /tmp como única fonte. O destino e a captura não podem existir; o script recusa sobrescrita e candidato dentro do source. Não copiar .env, volumes, configurações reais ou diretórios node_modules. A seleção usa Git tracked/untracked não ignorados, respeita as remoções atuais e recusa symlinks não qualificados. Git metadata do candidato é um clone local independente.

```bash
AUDIT_ROOT="$PWD/docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions"
AUDIT_WORK="$HOME/.cache/cvg-harness-audit-actions-20261003"
NODE22_BIN_DIR="/home/ricardo/.nvm/versions/node/v22.23.2/bin"
python3 "$AUDIT_ROOT/rebuild-candidate.py" --source-root "$PWD" --candidate "$AUDIT_WORK/candidate" --receipt "$AUDIT_ROOT/candidate-reconstruction.json"
python3 "$AUDIT_ROOT/run-candidate-check.py" --candidate "$AUDIT_WORK/candidate" --evidence-dir "$AUDIT_ROOT" --node-bin-dir "$NODE22_BIN_DIR" --name npm-ci -- "$NODE22_BIN_DIR/node" "$NODE22_BIN_DIR/../lib/node_modules/npm/bin/npm-cli.js" ci --offline --ignore-scripts
python3 "$AUDIT_ROOT/run-candidate-check.py" --candidate "$AUDIT_WORK/candidate" --evidence-dir "$AUDIT_ROOT" --node-bin-dir "$NODE22_BIN_DIR" --name boundary-cli -- "$NODE22_BIN_DIR/node" scripts/check-product-boundary.mjs
```

NODE22_BIN_DIR é exemplo da estação atual: em outra estação selecionar o Node 22 instalado. Não redefinir HOME. Se cache offline faltar, preservar a falha e escolher conscientemente instalação pelo registry em candidato próprio; isso não valida provider clínico. O runner herda somente variáveis de ferramenta explicitamente enumeradas, e adicionais por `--env`, evitando chaves de provider reais do shell. Não passar segredo real nessas flags.

Cada capture inclui comando, cwd, datas UTC, exitCode real, hash do log bruto, manifests de inputs antes/depois e MATCH/DRIFT. Não há retry automático. Os diretórios de dependências e outputs documentados de build/test/certificação, tsbuildinfo e XML gerado não fazem parte do sentinel de fontes. DRIFT reprova mesmo quando o comando retorna zero. Manifest/lock e arquivos de código/config/documentação permanecem cobertos.

Checks T2 adicionais são executados no mesmo candidato: typecheck, lint, suíte completa, test:postgres e E2E. Antes dos testes PostgreSQL, criar container sintético exclusivo e configurar TEST_DATABASE_URL para o admin sintético de migrations/criação de roles; os testes de runtime criam e qualificam seus próprios usuários sem bypass RLS. Nesta execução os recursos reservados são PG55595, API3255/web4255; não usar sandbox3400/3401. A documentação e os registros finais devem incluir comandos realmente executados, versões, resultados e encerramento dos recursos.

As fixtures antigas estão no zip versionado do diretório pai. Extraí-las somente em scratch/candidato exclusivo após validar paths; não inseri-las como packages/docs vigentes. Os resultados anteriores não são atribuídos ao candidato novo. A [barra atual](quality-bar.json), [baseline](baseline.json), [commit de preservação](a1-commit.json) e [controles da reconstrução/captura](portable-controls.json) permitem retomar sem depender de contexto de conversa. Os seis controles verificaram reconstrução boa, recusa de destino existente/dentro do source, capture readonly, DRIFT provocado e recusa de sobrescrever logs.

Estado corrente e hashes das SPECs ficam no packet humano do diretório pai; antes de BUILD T3 exigir sua aprovação separada. Uma captura verde não aprova contrato público, mudança de política ou dado real.

## C1 após a única revisão posterior

A correção reproduz os17casos arquivados, mas a revisão posterior REJECT encontrou sete falsos PASS novos; C1 não está aceito. O [encaminhamento](c1-weekly-handoff.md) e [fixture ZIP completa](c1-posterior-fixtures.zip) são duráveis. Extraia o ZIP somente em diretório novo e privado; os arquivos dentro de node_modules são pacotes controlados sintéticos, nunca dependências vigentes. O checker e seus testes ficaram no checkpoint de tentativa rejeitada, não release.

## Fundação PISO004 ainda não integrada

[source ZIP](piso004-foundation-source.zip) preserva cinco arquivos pelo [manifesto](piso004-builder/source-freeze.json); [isolamento](piso004-isolation.json) registra a devolução somente dos próprios arquivos à baseline. Extraia a fundação sobre um candidato privado novo reconstruído pelo procedimento acima, verifique cada SHA e instale pelo lock imutável. Sua execução própria40PASS não aceita o fluxo antigo:27PASS/10FAIL, com integração restante. A primeira fatia vertical do produto está em BUILD separado; patch congelado/resultados futuros devem ser vinculados a esse candidato antes da promoção.
