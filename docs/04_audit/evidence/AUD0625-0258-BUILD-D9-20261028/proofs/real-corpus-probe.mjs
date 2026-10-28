import { createResolutionSession } from '<worktree>/scripts/boundary-semantic-resolution.mjs'
const root = '<corpus>'
const s = createResolutionSession({ root })
try {
  const r = s.resolve({ from: 'packages/agent-core/x.js', specifier: '@cvg/platform', mode: 'import' })
  console.log('RESOLVED', r.file, r.owner.workspace, 'workspaces', s.usage.workspaces, 'metadataEntries', s.usage.metadataEntries, 'revalidate', s.revalidate())
} catch (e) { console.log('THREW', e.message) } finally { s.close() }
