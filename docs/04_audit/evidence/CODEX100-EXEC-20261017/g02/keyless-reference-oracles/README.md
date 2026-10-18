# Oráculos brutos da referência keyless aceita

Recorte T1 `DX100-G02:EXTRACT-ACCEPTED-KEYLESS-REFERENCE-ORACLES`.
[Contrato](contract.json), [inputs congelados](input-bindings.json),
[corpus extraído](oracles.json), [reconciliação de projeções](projection-overlay.json)
e [extrator de dados](extract.py). O extrator lê arquivos já capturados; não
inicia Codex, harness, provider ou ferramenta.

Os nove registros derivam da execução aceita `keyless-b9ab371c1b`: três comandos
de identidade/help e seis requests na mesma conexão stdio. Cada resposta tem
ID com tipo preservado, posição no stream, intervalo de bytes e frame bruto.
A notificação espontânea fica separada das seis respostas. stdout e stderr dos
comandos permanecem integrais, incluindo os avisos; nenhum stream foi omitido.
Os 28 inputs são vinculados por tamanho e SHA-256 antes da extração.

A inicialização retornou `userAgent`, `codexHome`, `platformFamily` e
`platformOs`; não retornou `result.capabilities`, que constava de uma projeção
documental anterior. Capabilities são declarações na entrada desse contrato.
O complemento preserva o pacote anterior e registra a mudança necessária para
um futuro contrato de comparação. Não altera a SPEC 0231 congelada nem aprova
uma nova regra de projeção.

O nome inválido não impediu a inicialização válida posterior na mesma conexão;
isso demonstra a admissão observada, sem provar atomicidade de todos os efeitos
globais ou duráveis. A repetição válida retornou `Already initialized`. Nome
inválido e método desconhecido retornaram `-32600` nesta fixture; outros ramos
de parâmetros inválidos continuam sem prova. Nenhuma notificação cliente
`initialized` foi enviada; sua necessidade ou efeito em outros transportes
continua aberto.

O erro de método desconhecido anuncia 175 discriminantes, na mesma ordem do
inventário pinado de `ClientRequest`. Isso vincula o conjunto anunciado pelo
parser compilado à fonte; não executa os 175 handlers. O ID numérico 7 também
não prova os limites i64. A lista vazia preserva `readStates: {}` e os dois
cursores `null`, sem converter ausência, objeto vazio e null entre si.

Nenhuma normalização foi aplicada. Host, UUID de instalação, relógio, home,
plataforma e user agent são os valores da captura. Sua equivalência em outro
ambiente depende de regra futura explícita, não de remoção silenciosa desses
campos. A versão observada `codex-cli 0.0.0` identifica o build de fonte; não
autentica uma distribuição assinada ou a equivalência com o Codex instalado.

Para reconferir a derivação sem executar os alvos:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/keyless-reference-oracles/extract.py
```

O corpus é evidência de referência. CVG não foi executado nesta unidade; todos
os requisitos continuam sem recibos funcionais. A jornada CQ01–14, os 54 eixos
históricos, as demais variantes, plataformas e gates continuam obrigatórios.
