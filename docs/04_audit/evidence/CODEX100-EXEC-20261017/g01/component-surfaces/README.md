# G01 — componentes e interfaces de pacotes

Unidade T1 `DX100-G01:CLASSIFY-COMPONENT-SURFACES`, fonte openai/codex
`8d9f6466ff0294785d56f55b1fe363d132fe4133`. Este pacote classifica fontes;
G01 e a incorporação nativa integral continuam em andamento. Nenhum recibo
funcional foi emitido; o catálogo permanece em 487 obrigações funcionais e
22 controles, todos pendentes de qualificação.

O censo encontra **164 manifests Cargo, 163 pacotes e um manifest virtual**.
Há duas tabelas workspace, incluindo o pacote independente
`tools/argument-comment-lint`, ausente do inventário histórico de 162 pacotes
sob codex-rs. Cada pacote recebe propósito, papel, dono e consumidores declarados;
papel de teste/desenvolvimento ou `publish = false` não exclui capacidade.

Os 527 registros de candidatos a target preservam declarações e descobertas de
diretório, inclusive sobreposições e autodiscovery desabilitado. Não representam
527 targets compilados. As 1.070 declarações de dependência local distinguem
normal/dev/build, cfg, opcionalidade e herança do workspace. Features, scripts de
build, aliases e APIs Rust transitivas continuam sujeitos a resolução semântica
e futura qualificação. [Método e limites Rust](rust/README.md).

Os [oito manifests não Cargo](non-rust/README.md) incluem os SDKs TypeScript e
Python, o runtime Python, wrappers e ferramentas de empacotamento. O leitor
preserva 34 exports TypeScript e 37 exports raiz Python; indexa declarações
privadas/geradas separadamente e 21 vínculos RPC diretos. Esses números não são
contagem de funções públicas equivalentes. Não houve importação ou execução do
código alvo.

As seis lacunas abaixo são **variantes obrigatórias abertas** ligadas aos donos
e IDs existentes em [integration.json](integration.json), sem editar o catálogo
normativo aceito anteriormente:

| Lacuna                 | Dono      | Aceite ainda necessário                                                        |
| ---------------------- | --------- | ------------------------------------------------------------------------------ |
| GAP-PY-API             | DX100-D01 | API síncrona/assíncrona, contexto, handles, erros e retries Python             |
| GAP-PY-RPC             | DX100-A01 | RPC genérico/transitivo, approvals, goals, cancelamento, overload e transporte |
| GAP-GENERATED          | DX100-A01 | Semântica Pydantic, herança, aliases, defaults e geração de schemas            |
| GAP-PROVENANCE         | DX100-Z02 | Autenticar separadamente Git, SDK, runtime, wheel e binário                    |
| GAP-TS-LANGUAGE        | DX100-D01 | Tipos, Abort, JSONL e limpeza de processos TypeScript                          |
| GAP-PLATFORM-PACKAGING | DX100-Z02 | OS/arquitetura, pacote/wheel, fallback, instalação e proxy                     |

Versões SDK `0.0.0-dev`, dependência de runtime `0.153.4`, mínimo `0.151.0` e
pin Git são identidades distintas. A presença em manifest não autentica o
artefato distribuído. O contrato Python não pode ser aceito apenas pelos exports
TypeScript.

Reprodução somente de metadados, a partir da raiz:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/rust/generate.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/non-rust/reader.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/non-rust/verify.py
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/integrate.py --check
```

Os leitores usam stdlib e Git; os checks conferem inventários determinísticos,
objetos, spans UTF-8 e preservação dos pacotes anteriores. Controles negativos
comparam adulterações contra uma nova extração; não testam o runtime Codex ou
CVG. Consulta somente de documentação pública Cargo orientou o método; nenhum
alvo, provider, modelo, instalação, compilador ou recurso de aplicação foi acionado.

Próxima ação: `DX100-G01:RESOLVE-EXEC-TRANSITIVE-TYPES`, para as 20 referências
restantes do exec-server. Parsers escalares/cfg/TUI, plataformas, efeitos e as
seis lacunas continuam obrigatórios. G02 autentica a referência, G03 aceita
reuso e G04 materializa a primeira SPEC; o BUILD segue os gates aplicáveis.
