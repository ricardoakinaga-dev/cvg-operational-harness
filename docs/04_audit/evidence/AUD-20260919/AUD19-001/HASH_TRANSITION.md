# Supersessão de hashes — AUD19-001 (formatação mecânica, 2026-09-19/20)

Prettier travado `3.8.3`. Conteúdo semanticamente idêntico (JSON
parse-equal; markdown com render equivalente). Os hashes antigos permanecem
válidos como "hash na época do fechamento"; os novos valem daqui em diante.

| Arquivo                                               | SHA-256 antes (HEAD)                                               | SHA-256 depois                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `docs/AAA-41-CRITIC-CLOSURE.md`                       | `f6496cbc9762ac2d65c84b68e0bbee433be8f6bcd7d785ca6ec29442094c5262` | `84c5ad1f4536757adec23116ab46f40101d2f3eaa68f5e331d16bc0be5a4449a` |
| `docs/phase4/evidence/CRITIC_ONLY_ATTEMPTS.md`        | `3a357b1969aea09808be7604da486401e9dfb2ef961fe69423de7f49655fa16d` | `6bcb4c14b8a643d094563d4b7aaf8d53f2e50eec2d5a532e9b4ffeeaf15c8cd6` |
| `docs/phase4/evidence/CRITIC_ONLY_CANDIDATE.json`     | `ad7891988a9e33d92d9abc65d1fc5378ad8691e5c51f332c41b91bb9bba41f57` | `6b4c25ae8af06d6a890d8ddac8fe6b21c926cc33585778568ef8d6c561ca94c4` |
| `docs/phase4/evidence/CRITIC_ONLY_CLOSURE_CHAIN.json` | `6df5793579e868fb16f005d13e951298ba2505613443ff151ab0cce4b267f9d8` | `5a9932fc0c263b2158a661f60640e07d66f6048a60153576093890bb27d45c88` |
| `docs/phase4/evidence/CRITIC_ONLY_RESULT.json`        | `963a744db186d4ea8ac09579288a4317368b0a48ba80090478fe12e91dbffc34` | `422c56be00040f32189f616b22478cda2b6b954e87a9ae2c775c4b3c4d911693` |
| `docs/phase4/evidence/CRITIC_ONLY_SENTINEL.json`      | `d642560cdfc12647085be8423f469899914b988104ca3b637959655c7c853edc` | `b7a162b079bf742d9f054c16c5984cbd10ca7c821fc1735f6312fe08a9a96d94` |
| `docs/phase4/evidence/critic-only/attempt-01-raw.md`  | `59dde900b37501b7b838aa5f06926d3bd7efffc3865a5f288710210b489cb454` | `d92f69f098d89b5c9f6b44d2b33046fed8ca321fd8d74078d60ac8b44a8fea25` |
| `docs/phase4a/evidence/EVIDENCE_GRAPH.json`           | `9cbe1e2d41840c30ef591ee7671817b9f8313398823b1e05958484a8fdb35f13` | `4daacaf04c793428e2bd5a4e8ad591ba9f68672bc3b9845fbe53e0ee828abaa4` |
| `docs/phase4a/GATE_VALIDATION.md`                     | `d5baebf7110c7e2ea1e617c3fe3997853df42141b74aadf9d78cb8e014c2b6b4` | `9bd678c7ac1b20549b1242ddee9118b4b72def6e3e762f9b29671a9d1d498f1b` |

Nota de rastreabilidade: citações históricas a `59dde900…` (raw do crítico
P4-CRITIC-ATTEMPT-01) referem-se ao bytes na época do fechamento de 2026-09-16;
o conteúdo é idêntico ao de `d92f69f0…`. Reconciliação narrativa em `AUD19-012`.
