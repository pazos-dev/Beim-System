const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const repositoryRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the whole monorepo so workspace packages (e.g. @beim/contracts)
// resolve through the pnpm symlinked node_modules.
config.watchFolders = [repositoryRoot]

// SDK 54 has first-class pnpm support: Metro resolves workspace packages
// through the root node_modules symlinks. Only list real node_modules dirs.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repositoryRoot, 'node_modules'),
]

config.resolver.unstable_enableSymlinks = true

module.exports = config
