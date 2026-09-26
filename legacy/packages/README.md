# legacy/packages/

Isolated legacy packages, named `@cvg/legacy-<name>` and registered as npm
workspaces (`legacy/packages/*`, reviewed workspace-dependency policy
`PROD26-L05-1`).

| Package                         | Content                                                                 | Composed by                          |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `@cvg/legacy-secretary-profile` | Secretary policy profile (21 capabilities, 5 agent profiles) and preset | `apps/api/src/legacy-composition.ts` |
