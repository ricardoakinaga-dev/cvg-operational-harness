# Scout evidence — package boundary scan

Source: independent read-only scout `Beauvoir`, completed 2026-09-13. No
mutations or test execution.

The scan found no strongly connected component in the package graph, but it did
find incorrect architectural direction: persistence and runtime concerns cross
each other, `platform` is a large mixed package, `shared` is not fully neutral,
and policy/tool ontology remains Secretary-shaped. The current repository has
two runtime paths and no public neutral composition root.

The scout's recommendation was contract-first extraction with the existing
runtime preserved as compatibility, which is the basis for the new contracts,
orchestrator seam, and harness factory. The classification matrix remains
honest about mixed packages and does not claim a complete migration.
