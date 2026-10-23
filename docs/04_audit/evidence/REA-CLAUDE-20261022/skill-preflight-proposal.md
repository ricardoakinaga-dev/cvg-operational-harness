# Proposta concreta — inspeção offline de skills e custo de contexto

Task de origem REA-CLAUDE-20261022. Estado **PROPOSED / NÃO IMPLEMENTADO**. Escopo parcial de C100-T01/C100-T02, com reusoPAR-T07/H04/K04/H02. Não altera o estado dos pais ou o pinClaude100. Documento pronto para reconciliação em SPEC pelo owner; não é um gate de BUILD.

## WHAT e valor

Antes de habilitar uma skill/plugin, apresentar inventário determinístico de origem, conteúdo identificado, requisitos, riscos declarados e estimativas separadas de custo permanente e de invocação. Distinguir validação de formato, completude da inspeção e autorização real. Inspecionar não instala, importa código, executa hook, conecta servidor ou concede capacidade.

Há prova local do valor do relatório no Claude308: corpo curto e corpo de6098bytes mantêm custo permanente aproximado17tokens; a estimativa de invocação cresce para1,5mil. No harness atual, o loader aceita seuJSON canônico e recusa fixture somenteMarkdown. O contrato proposto reutiliza esses fatos sem assumir consumo real de tokens ou compatibilidade integral de formatos.

## Contrato proposto

Entrada: root explícito já autorizado, formato explícito JSON-CVG ou Markdown-declarativo, perfil solicitado, limites finitos de entradas/bytes/profundidade e identidade esperada opcional. Não fazer autodiscovery no home, rede, `.env` ou diretórios de terceiros. O adapter de aquisição recusa symlink e travessia fora do root.

Saída sugerida, sujeita à SPEC:

```json
{
  "schemaVersion": 1,
  "kind": "cvg.skill.inspect",
  "inputDigest": "sha256:<digest>",
  "profile": "inventory",
  "coverage": "COMPLETE",
  "formatValidation": "VALID",
  "admission": "NOT_EVALUATED",
  "runtimeGrant": "NONE",
  "items": [
    {
      "id": "synthetic-summary",
      "version": "1.0.0",
      "origin": "relative/skill.json",
      "declaredRisk": "LOW",
      "requiredTools": [],
      "contextEstimate": {
        "estimatorVersion": "cvg-chars4-v1",
        "permanentTokens": 17,
        "onInvokeTokens": 1500,
        "measuredUsage": false
      }
    }
  ],
  "findings": []
}
```

Os números são ilustração do formato; não são medições do CVG. Reusar o estimador determinístico existente quando compatível e versioná-lo; custos estimados não entram como cobrança real no ledger. Markdown sem versão/origem/requisitos suficientes pode ser inventariado, mas não recebe admissão implícita. O mapeamento name→id e conflitos entreMarkdown/JSON precisam ser explícitos na SPEC.

Perfis: `inventory` descreve o que foi lido; `admission` verifica todo o conjunto de requisitos aprovado no CVG. O schema strict atual e os grants do kernel continuam obrigatórios. Campo desconhecido não é autorizado porque a referência tolera warning. Cobertura incompleta impede decisão positiva de admissão. O resultado não possui campo que ative o plugin ou emita approval.

## HOW e fronteiras sugeridas

- `packages/harness/src/skills/inspection.ts`: núcleo puro de inspeção e projeção, sem executar conteúdo. Path proposto; confirmar owner e contrato antes de criar.
- Adapter de leitura delimitada junto a `skills/loader.ts`, preservando seu contrato canônicoJSON e recusando limites/extravasamento. Não reutilizar leitura irrestrita para habilitar formatos novos silenciosamente.
- `packages/contracts/src/skill-inspection.ts`: tipos versionados somente se a revisão aprovar a superfície pública. Nada exportado por antecipação.
- HostCLI/console sobre exports suportados e artefatos construídos. Nome de comando a confirmar; não importar profundamente `src` para um consumidor.
- `packages/harness/src/__tests__/skill-inspection.test.ts` e teste de boundaryCLI: fixtures próprias, determinísticas e sem provider/rede. Paths propostos, não criados.

Não modificar PluginRegistry para auto-instalar componentes. Não ampliar capabilities ou policy. O adapter de Markdown apenas adquire dados; runtime continua passando pela composição, grant, policy/approval e journal existentes.

## Aceites congeláveis na futura SPEC

| ID | Aceite proposto | Evidência que rejeita uma implementação ruim |
| --- | --- | --- |
| SI01 | JSONCVG válido gera inventário com identidade/origem estáveis | Mesmo input/ordem lógica gera mesmo digest e inventário |
| SI02 | Markdown declarativo é distinguido do formato canônico e não executado | Corpo contendo texto de comando não cria arquivo/processo nem grant |
| SI03 | Erros de sintaxe e campos desconhecidos são reportados por escopo | Nunca vira admissãoVALID por omitir o campo inválido |
| SI04 | Ausência de versão/requisitos/proveniência impede admissão | Inventário parcial não recebe aprovação por default |
| SI05 | Root/symlink/traversal não permite leitura exterior | Marcador fora do root não aparece no resultado nem é aberto |
| SI06 | Limites de arquivo/bytes/profundidade são finitos | Cap excedido retorna INCOMPLETE, sem PASS de cobertura |
| SI07 | Drift de bytes entre aquisição e uso invalida a identidade | Troca de arquivo/hash não reutiliza relatório anterior como aceite |
| SI08 | Body maior não é anexado inteiro ao discovery | Contexto permanente deriva dos metadados; corpo só na seleção autorizada |
| SI09 | Estimativas de permanente/invocação são separadas e versionadas | Relatório não afirma custo faturado nem altera usage real |
| SI10 | Tool declarada não concede autoridade | Skill pedindo WRITE sem grant continua bloqueada no boundary público |
| SI11 | Diagnóstico não revela segredos nem carrega personalizações ocultas | Fixtures de segredo/config estrangeira não aparecem em output/log |
| SI12 | Validação e decisão de admissão são escopos explícitos | Formato válido com requisitos de admissão faltantes nunca é executável |

## Gate, dependências e pronto

Implementação alvo **T3**: novos contratos públicos, parsing de entrada e fronteira de autoridade. Conforme `docs/07_agents/AGENTS.md`, a trilha exige revisão explícita da SPEC pelo usuário antes do BUILD; esta investigação não substitui esse gate. Nenhuma aprovação anterior de SPEC0248/0249/0250/0251 é transferível a esta proposta.

C100-Q01 e reusos canônicos permanecem dependências. A preparação deste contrato não os fecha e não autoriza pular a sequência0382. A decomposição pode ser reduzida pelo owner, mantendo os controles. Pronto da implementação futura: aceitesSI01–SI12 executados, revisão independente do delta, gates pertinentes da candidata e documentação/ledgers atualizados; nenhuma alteração em produto ou release implícita.
