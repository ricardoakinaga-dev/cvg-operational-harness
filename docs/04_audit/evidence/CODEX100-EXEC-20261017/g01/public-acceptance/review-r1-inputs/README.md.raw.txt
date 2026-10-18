# Aceites por comportamento público

Unidade T1 `DX100-G01:CONCRETIZE-PUBLIC-VARIANT-ACCEPTANCE`.
[Contrato](contract.json), [recuperação](recovery.json),
[validador](validate.py) e [índice integrado](integration.json).

O recorte transforma os 179 requisitos genéricos das 22 famílias em propostas
documentais de baseline e edge. Cada proposta tem estado/entrada/falha sintéticos,
estímulo, observáveis/asserts, fonte com digest/bytes, falsificação conhecida,
comparação e dependências. Os requisitos protocolares específicos e os 22
controles CVG continuam no catálogo canônico; os 179 não substituem os 487.

- [Core](core/README.md): CDX-01 a CDX-07, execução, estado, contexto, modelos,
  arquivos, processos e segurança; 58 requisitos.
- [Interfaces](interfaces/README.md): CDX-08 a CDX-14, protocolo, SDK/headless,
  CLI/config, extensões, hooks, MCP e subagentes; 56 requisitos.
- [Operations](operations/README.md): CDX-15 a CDX-22, autonomia, workspace,
  TUI, remoto, mídia, identidade, observabilidade e distribuição; 65 requisitos.

Contagens atuais e eixos sem cobertura estão na [integração](integration.json).
Geração de cenários não executa a referência ou o harness. As fixtures e os
drivers aqui são contratos propostos, sem alegação de que já sejam executáveis.
G02 precisa transformar cada estímulo em operação real e mapear os observáveis
às capturas autenticadas. Um campo de projeção proposto não é um campo inventado
da API Codex. Notificações não devem ser enviadas como ClientRequest.

## Expectativa, oráculo e governança

Uma expectativa de fonte é declarada como não observada. Quando o resultado
literal ainda depende do runtime, o caso aponta para a captura autenticada G02
da mesma fixture e define o que comparar. A regra de comparação deve rejeitar
mudança de estado, resposta, erro, ordem, identidade relacional ou efeito extra.
Normalizações só podem ser as declaradas; não apagam diferença de comportamento.
Os known-bads são propostas de falsificação para o futuro comparador, não testes
de runtime já aprovados.

CVG mantém seus próprios contratos de policy, approval, identidade, orçamento,
contenção e evidência. Bypass, revisor automático ou acesso de uma conta na
referência não concedem autoridade ao candidato. Uma equivalência governada
pendente não recebe crédito de igualdade literal. Provider sintético controla
entradas/falhas; o motor real da referência produz sua saída e o motor nativo
CVG produz a saída candidata. Encaminhar para Codex instalado não é esse motor.

Cada eixo histórico recebe IDs de casos ou uma lacuna nomeada com dono,
evidência e gate. Um eixo associado a uma proposta não está qualificado. Fonte
de contexto e selector declarado também não provam a semântica completa.
Onze pacotes anteriores, 488 payloads e onze manifestos, são preservados;
nenhum dono ou objeto normativo do catálogo487+22 muda nesta unidade.

## Verificação

Cada lane tem manifesto exato e comandos observados. Na raiz, por exemplo:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/public-acceptance/validate.py --lane core --check
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/public-acceptance/validate.py --lane interfaces --check
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/public-acceptance/validate.py --lane operations --check
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/public-acceptance/integrate.py --check
```

Onze controles do validador se aplicam a cada lane. Isso não representa 33
classes independentes de falha. Os oito controles do índice são desigualdades
de regeneração, não oito provas semânticas independentes. Links/formatação em
Node22 e crítica independente completam o aceite documental.

Fechamento G01 continua uma auditoria separada de cobertura/classificação
pública. G02 autentica fonte/executável/oráculos; G03 aceita reuso e G04 prepara
a SPEC concreta antes do BUILD. As seis lacunas SDK, cinco limites externos,
291 correlações TUI, todos os cartões e todas as funções continuam obrigatórios.
Nenhum caso recebe PASS funcional, recibo, aprovação futura ou release aqui.
