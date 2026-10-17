# Análise de lacunas CVG × DeepSeek Harness — instruções comuns

Objetivo: o usuário pediu um roadmap e um backlog para o CVG Operational Harness
alcançar 100% de pareamento funcional com o DeepSeek Harness. A sessão principal
(cvg-operational-harness-f5) escreve os documentos finais; você entrega a análise de
lacunas de um grupo de famílias de capacidades.

## Alvos

- Referência DeepSeek (somente leitura): `/home/ricardo/deepseek-harness-session-fixes`,
  commit `768fb1f3`, versão `0.2.0-rc.1`. Pacotes em `packages/<família>/<pacote>`,
  apps em `apps/`, Python em `python/`, nativo em `native/system`.
  Ignore `node_modules`, `lib/`, `dist/`, `coverage/`, `tmp/`, arquivos `.zh.md`/`.i18n.yaml`.
  Docs úteis: `docs/architecture.md`, `docs/capability-seams.md`, `docs/tool-catalog.md`,
  `docs/config-catalog.md`, `docs/persistence-catalog.md`, `docs/subsystems/`,
  `docs/agent-lifecycle.md`, `docs/api-gateway.md` e o `README.md` de cada pacote.
- CVG (somente leitura): `/home/ricardo/Área de trabalho/cvg-operational-harness`,
  código em `packages/*`, `apps/*`, `products/shift-assistant`.
  Docs úteis: `docs/architecture/TOOL_CATALOG.md`, `docs/architecture/PUBLIC_API.md`,
  `docs/04_audit/0611_harness_deepseek_pairing_2026-10-14.md` (rubrica atual, ~70% do motor),
  `docs/architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md`
  (diferenças deliberadas: controles obrigatórios, loop do kernel, PostgreSQL/RLS),
  `docs/03_build/0378_backlog_paridade_integral.md` a partir da linha 440 (cartões P100-xxx).

## Regras (obrigatórias)

1. Somente leitura nos dois repositórios. Não edite, formate, instale, compile, rode
   testes, inicie processos/containers nem faça operações git que mudem estado.
2. Não leia `~/.dsh`, `~/Documentos/deepseek-harness`, `.env`, credenciais ou sessões reais.
3. Não copie código do DeepSeek. Descreva capacidades e comportamento observável.
4. Sem rede.
5. Priorize amplitude: todas as famílias do seu grupo cobertas com qualidade razoável
   valem mais do que metade perfeita. Leia README, entrypoints/index, tipos públicos e
   grep; não leia tudo.
6. Escreva o resultado num único arquivo Markdown no caminho indicado na sua tarefa
   (só esse arquivo). Português, frases curtas.

## Formato do arquivo

Comece com uma tabela-resumo:

| Família | Cartão P100 | Capacidades | Presente | Parcial | Ausente | Esforço estimado |

Depois, uma seção por família:

```
## <família> (cartão P100-xxx)
- Referência: pacotes; arquivos-chave (paths relativos ao repo DeepSeek).
- Capacidades da referência (3–12, observáveis, cada uma com id curto <FAM>-NN):
  - <FAM>-01 — descrição em uma linha — `path/evidência`
- CVG hoje (uma linha por capacidade): <FAM>-01: PRESENTE | PARCIAL | AUSENTE |
  DIVERGENTE_INTENCIONAL — `path no CVG` — o que existe/falta.
- Lacunas (numeradas): o que falta construir; tamanho P (≤3 dias), M (≤2 semanas),
  G (≤6 semanas), GG (>6 semanas); dependências (outras famílias); risco
  (autorização, efeito duplicado, isolamento, dados); relevância hospitalar
  (alta/média/baixa/nenhuma) com uma frase.
- Critério de aceite sugerido para fechar a família (1–3 linhas, testável).
- Fora de escopo razoável (ex.: branding DeepSeek, distribuição macOS) e dúvidas.
```

Termine com "Riscos transversais" (até 5 linhas) e "Ordem sugerida" (até 5 linhas).

Relevância hospitalar: o harness será o motor de agentes semiautônomos de um hospital
veterinário (conversar com equipe e tutores, passagem de plantão, agenda, exames),
nunca diagnóstico ou prescrição. Toda ação sensível exige aprovação ou handoff.
