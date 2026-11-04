import fs from 'node:fs'
import path from 'node:path'

class NativeAssetError extends Error {
  constructor(code, relative) {
    super(`runtime_build_failed:native_asset_${code}:${relative}`)
  }
}

function unchanged(actual, expected) {
  return ['dev', 'ino', 'size', 'mode', 'mtimeNs', 'ctimeNs'].every(
    (key) => actual[key] === expected[key]
  )
}

function copyAsset(root, contextDir, asset) {
  let input
  let output
  let failure
  try {
    input = fs.openSync(
      path.join(root, asset.relative),
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
    )
    const opened = fs.fstatSync(input, { bigint: true })
    if (!opened.isFile() || !unchanged(opened, asset.stat))
      throw new NativeAssetError('changed', asset.relative)
    output = fs.openSync(
      path.join(contextDir, asset.relative),
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW ?? 0),
      Number(opened.mode & 0o777n)
    )
    const buffer = Buffer.alloc(64 * 1024)
    let remaining = Number(opened.size)
    while (remaining > 0) {
      const read = fs.readSync(
        input,
        buffer,
        0,
        Math.min(buffer.length, remaining)
      )
      if (read === 0) throw new NativeAssetError('changed', asset.relative)
      let written = 0
      while (written < read) {
        const count = fs.writeSync(output, buffer, written, read - written)
        if (count === 0)
          throw new NativeAssetError('write_failed', asset.relative)
        written += count
      }
      remaining -= read
    }
    if (!unchanged(fs.fstatSync(input, { bigint: true }), asset.stat))
      throw new NativeAssetError('changed', asset.relative)
    fs.fchmodSync(output, Number(opened.mode & 0o777n))
  } catch (error) {
    failure =
      error instanceof NativeAssetError
        ? error
        : new NativeAssetError('copy_failed', asset.relative)
  } finally {
    for (const fd of [output, input]) {
      if (fd === undefined) continue
      try {
        fs.closeSync(fd)
      } catch {
        failure ??= new NativeAssetError('close_failed', asset.relative)
      }
    }
  }
  if (failure) throw failure
}

/** Internal transport for a fresh context and the builder's fixed workspaces. */
export function copyRuntimeNativeAssets(root, contextDir, workspaces) {
  const directories = []
  const assets = []
  function visit(relative, stat) {
    if (stat.isSymbolicLink()) throw new NativeAssetError('symlink', relative)
    if (stat.isDirectory()) {
      directories.push({ relative, stat })
      for (const entry of fs.readdirSync(path.join(root, relative)).sort()) {
        const child = path.join(relative, entry)
        visit(child, fs.lstatSync(path.join(root, child), { bigint: true }))
      }
      return
    }
    if (!stat.isFile()) throw new NativeAssetError('not_regular', relative)
    if (!['.node', '.json'].includes(path.extname(relative)))
      throw new NativeAssetError('unsupported_file', relative)
    if (stat.size > BigInt(Number.MAX_SAFE_INTEGER))
      throw new NativeAssetError('too_large', relative)
    assets.push({ relative, stat })
  }
  // Inventory all trees before copying an asset, including dangling root links.
  for (const workspace of workspaces) {
    const nativeRoot = path.join(workspace, 'native')
    let nativeStat
    try {
      nativeStat = fs.lstatSync(path.join(root, nativeRoot), { bigint: true })
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw new NativeAssetError('stat_failed', nativeRoot)
    }
    if (nativeStat.isSymbolicLink())
      throw new NativeAssetError('symlink', nativeRoot)
    if (!nativeStat.isDirectory())
      throw new NativeAssetError('not_directory', nativeRoot)
    // native/ may contain compiler sources, such as the Landlock helper.
    // Only the explicit runtime/ subtree is a runtime artifact input.
    const relative = path.join(nativeRoot, 'runtime')
    let stat
    try {
      stat = fs.lstatSync(path.join(root, relative), { bigint: true })
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw new NativeAssetError('stat_failed', relative)
    }
    if (!stat.isDirectory() && !stat.isSymbolicLink())
      throw new NativeAssetError('not_directory', relative)
    directories.push({ relative: nativeRoot, stat: nativeStat })
    try {
      visit(relative, stat)
    } catch (error) {
      if (error instanceof NativeAssetError) throw error
      throw new NativeAssetError('inventory_failed', relative)
    }
  }
  for (const directory of directories)
    fs.mkdirSync(path.join(contextDir, directory.relative), { recursive: true })
  for (const asset of assets) copyAsset(root, contextDir, asset)
  // Set restrictive directory modes only after writing their children.
  for (const directory of directories.toReversed())
    fs.chmodSync(
      path.join(contextDir, directory.relative),
      Number(directory.stat.mode & 0o777n)
    )
  return assets.map((asset) => asset.relative)
}
