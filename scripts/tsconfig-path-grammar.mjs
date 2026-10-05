// Accepted TypeScript path grammar: nonempty target arrays and at most one star.
// Returns only the pattern identity, never target values or config secrets.
export function invalidTsconfigPathPatterns(paths) {
  if (paths === undefined) return []
  if (paths === null || typeof paths !== 'object' || Array.isArray(paths))
    return [null]
  const validString = (value) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.indexOf('*') === value.lastIndexOf('*')
  return Object.entries(paths)
    .filter(
      ([pattern, targets]) =>
        !validString(pattern) ||
        !Array.isArray(targets) ||
        targets.length === 0 ||
        !targets.every(validString)
    )
    .map(([pattern]) => pattern)
}

export function expandSingleWildcard(target, captured) {
  const index = target.indexOf('*')
  return index < 0
    ? target
    : target.slice(0, index) + captured + target.slice(index + 1)
}
