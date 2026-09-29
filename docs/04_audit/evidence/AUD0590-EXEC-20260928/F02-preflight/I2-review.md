# F02 I2 — crítica independente do commit isolado `b73fc47`

**Crítico:** Volta (`01a0eb34-b16e-74e3-a52c-bd05093d8836`), contexto novo,
somente leitura. **Veredito:** `ACCEPT_LOCAL`, sem P0/P1/P2 identificados.
Fonte: SPEC 0158 SHA-256 `4d4ac269a0843a668e8db21d34f4d8dd7604a5d4d262dc222169756016650380`.

O crítico verificou o diff `3aa5330..b73fc47`, o preflight em
`tenant-preflight.ts`, os testes reais e os logs preservados na
[revisão](revision/.evidence/i1-proof.json). A checagem vincula tabela,
colunas, constraints e índices por OID, compara as definições de `CHECK`
esperadas no PostgreSQL 16, exige os campos booleanos do catálogo e recusa
triggers, rules e FKs inesperados. A matriz negativa usa
`buildServerFromEnv` com role de serving e RLS ativo; trigger, rule e FK têm
efeito operacional observado antes da recusa no boot. Ela está no arquivo
selecionado pelo `test:postgres` padrão.

Gates conferidos pelo crítico no checkout isolado: PostgreSQL 284/284 e suíte
completa 2.467/2.467; hashes da SPEC e das três fontes do manifesto I1
coincidiram. O parecer aceita **somente a fatia local**: integração, gates no
root, certificação, CI, staging e produção não foram avaliados por I2. Não
houve edição de arquivos nem execução de testes pelo crítico.
