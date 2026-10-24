# 0405 — Atualização de segurança do Zod no lockfile

Task `CLOSE-CI-LOCAL-20261023:ZOD-AUDIT-HIGH`, baseline `a6a6bcc10e1032f7aa8691441e6b6764aeed554f` do PR28.

## Problema e contrato

O check `supply-chain` do run40026150697 falhou no auditor de dependências, job120662743099. O lockfile resolve Zod4.3.6; o auditor reportou HIGH para `GHSA-mrhx-c7xc-m3w5`. O [aviso oficial](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), atualizado em23/10/2026, identifica versões anteriores a4.6.6 e aponta4.6.6 como corrigida. A biblioteca pode consumir memória excessiva ao validar coleções grandes. A validação vulnerável não será executada como prova de exploração.

Corrigir a dependência preservando o auditor e a política de rejeição de HIGH. Não é uma falha dos quatro arquivos do reparo0404; estes continuam congelados e revisados, mas a composição com a nova biblioteca precisa ser qualificada novamente.

## HOW e limites

1. Capturar o audit original e a metadata pública do registry, incluindo versão, tarball e integridade. Confirmar a versão alvo4.6.7 antes de instalar. O registry e a release oficial consultados nesta preparação apontam4.6.7 como estável atual; ela é posterior ao mínimo corrigido4.6.6. A decisão do alvo foi ajustada antes de qualquer mudança no lock, mantendo a mesma faixa declarada e o mesmo critério de ausência de HIGH.
2. Atualizar somente o registro instalado de Zod no `package-lock.json`, por ferramenta npm com `--package-lock-only --ignore-scripts`. Os16manifestos já permitem a versão por `^4.3.6`; não alterar ranges, schemas de aplicação, código do produto ou outra dependência. Se o npm modificar entradas adicionais, preservar o resultado para diagnóstico e não publicar esse delta implicitamente.
3. Conferir o diff semântico completo do lock e manter os quatro blobs0404 idênticos. Executar `npm ci --ignore-scripts` somente na candidata própria, usando cache privado. Confirmar a versão física e a integridade registrada.
4. Repetir o auditor original, tipos e regressões relevantes de schemas/CI; gerar SBOM e verificar licenças em outputs próprios. Arquivar os novos relatórios antes de repor os bytes dos dois outputs gerados originais da candidata, sem alterar histórico ou fontes de pares.
5. Crítico independente confere lock, origem/integridade, contratos, testes e composição. Atualizar o PR28 por commit adicional normal, sem force push e com descrição da mudança final. Exigir os cinco checks verdes no HEAD novo antes de merge. Não reaproveitar PASS do HEAD anterior.

Mudanças de fonte previstas: somente `package-lock.json` e este documento, além dos quatro arquivos0404 já revisados. Claims de install, lock, SBOM e licenças são exclusivos da candidata privada e estão registrados. Sem produção, dados reais, PG, E2E, fullcert local ou alteração de workflows/pisos/allowlists.

## Aceites e gate

- Audit antes: HIGH/Zod4.3.6 identificado pelo mesmo comando do CI; audit depois: nenhuma vulnerabilidade HIGH/CRITICAL. Não suprimir o aviso.
- Lock: somente `packages['node_modules/zod']` muda; nenhuma dependência transitiva nova, range ou manifesto alterado. Tarball/integridade correspondem à metadata pública4.6.7.
- Versão instalada4.6.7; tipos, schemas/regressões, formato, scanner e licenças verdes; SBOM contém4.6.7. Os quatro hashes0404 permanecem os aprovados.
- Crítica independente sem obrigatórios e CI integral no HEAD composto. Runtime do produto e produção não são aprovados por um audit verde.

T2 de atualização corretiva dentro da faixa declarada da dependência, sem novo contrato público, schema, trust root ou política. Task e claim antes de código; gate `IMPLEMENTATION_READY_T2` para este recorte somente. Se a atualização exigir mudança semântica de schema ou outra dependência, parar e reclassificar antes de implementar esse delta. SPEC0261 permanece sem aprovação T3 nem BUILD.
