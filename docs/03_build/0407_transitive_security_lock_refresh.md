# 0407 — Correção compatível de dependências transitivas

Task `CLOSE-CI-LOCAL-20261023:TRANSITIVE-SECURITY-LOCK`, baseline `cfb954b48ada1861354a03e084b50f1c237b12a9` do PR28. Trilha T2; gate `IMPLEMENTATION_READY_T2` para o recorte descrito abaixo, antes de modificar o lockfile.

## Recon e resultado esperado

A Verify40029064396 terminou com falha no verificador da certificação. Os16gates internos do certificador passaram, mas `npm audit --audit-level=high` permite avisos moderados, enquanto o verificador independente exige `found 0 vulnerabilities`. O relatório interno contém dois pacotes afetados: `fast-uri` e `undici`. A reconstrução explicitamente identificada do log, usando o cabeçalho conhecido e uma nova observação do npm, corresponde aos2.050bytes e ao SHA-256 `f6489da303882d049736d269c5b61221313fcfda6fa967709ae79f32127b6ca4` dos registros originais de gate e manifesto. Não se trata de nova execução daquele CI.

Atualizar as dependências dentro das faixas já declaradas e obter zero vulnerabilidades no auditor atual. Manter o verificador e a política existentes. A execução anterior e seu resultado permanecem evidência histórica.

## HOW, dependências e limites

1. Preservar o ZIP original, os relatórios e o lock anterior. Consultar a metadata oficial do registry e os avisos dos mantenedores antes de instalar. As versões escolhidas são as correções compatíveis publicadas: [fast-uri3.1.9 e4.2.3](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) e [undici7.30.1](https://github.com/advisories/GHSA-4qv8-2p9j-2685), que também corrige o [aviso de integridade de resposta](https://github.com/advisories/GHSA-f72v-6w45-q472). Não migrar para undici8.
2. Na candidata privada, executar `npm update fast-uri undici --package-lock-only --ignore-scripts` com Node22 e cache próprio. Aceitar exclusivamente os registros instalados `node_modules/fast-uri`3.1.8→3.1.9, `node_modules/fastify/node_modules/fast-json-stringify/node_modules/fast-uri`4.2.1→4.2.3 e `node_modules/undici`7.30.0→7.30.1, com versão, URL e integridade correspondentes. Qualquer delta adicional exige diagnóstico e reconciliação prospectiva antes de publicação.
3. Conferir o diff semântico completo. Todos os manifestos e ranges, os quatro blobs0404, o Zod4.6.7 e o documento0405 devem permanecer idênticos. Executar `npm ci --ignore-scripts` e conferir versões físicas, tarballs e integridades oficiais dos três registros.
4. Executar o auditor original e sua projeção JSON, tipos, lint, build e regressões de HTTP, schemas, instrumentação e certificação em Node22, com logs e limites próprios. Nenhum PG, E2E ou certify local será iniciado enquanto o claim exclusivo da qualificação comum estiver ativo. A barra hospedada completa continua obrigatória no novo HEAD.
5. Gerar SBOM e verificar licenças somente na candidata própria; arquivar os relatórios novos e repor exatamente os bytes dos outputs gerados anteriores. Scanner com política original e revisão independente fresca, máximo duas rodadas deste recorte. Preservar os resultados de todas as tentativas.
6. Após conferência do Lead, publicar commit adicional normal no PR28 e repetir integralmente o CI. Exigir os cinco checks verdes no HEAD exato, artefatos válidos e reconciliação atual da main antes de merge protegido. Nenhum PASS do HEAD anterior qualifica esta composição.

## Aceites e fronteira de autorização

- Apenas os três registros previstos mudam no lock; nenhuma dependência nova, mudança de range, manifesto ou código da aplicação.
- Auditor original exit0 e JSON com zero vulnerabilidades em todos os níveis; versões físicas e integridades correspondentes ao registry. SBOM e licenças coerentes.
- Tipos, lint, build, regressões relevantes, formato, scanner e revisão independente sem obrigatórios. Gates globais de PG, E2E e certificação continuam exigidos na nova Verify.
- Nenhuma alteração em contrato público do projeto, schema, identidade, trust root, policy, approval, pisos, caps, catálogo ou workflow. Se surgir necessidade de alterar uma dessas fronteiras, interromper esse delta e reclassificar antes de BUILD.
- Sem alteração em recursos de pares, dados reais, providers, produção ou implementação da SPEC0261. A aprovação T3 da SPEC0255 permanece restrita ao seu hash e às suas dependências próprias.

Evidências e deltas para os ledgers compartilhados em `docs/04_audit/evidence/CLOSE-CI-LOCAL-20261023/transitive-security-lock/`; os ledgers ocupados por pares não serão sobrescritos.
