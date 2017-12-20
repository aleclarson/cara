// @flow

// TODO: Support packages not inside the `node_modules` directory?
// TODO: Support namespaced packages (eg: @aleclarson/fsx)

import globRegex from 'glob-regex'
import path from 'path'
import fs from 'fsx'

import type Bundle, {Module} from '../Bundle'
import type Package from '../Package'

const matchAll = /.*/
const matchNone = /^$/
const blacklistRE = globRegex(['**/.git', '**/node_modules'])

export type CrawlOptions = {
  root?: string,
  exclude?: ?RegExp,
  fileTypes?: ?RegExp,
}

export function crawlPackage(pkg: Package, config: CrawlOptions = {}): void {
  const {bundler, crawled} = pkg

  const excludeRE = config.exclude || matchNone
  const fileTypesRE = config.fileTypes || matchAll

  // Create a hash suffix for tracking crawled directories.
  const suffix = [
    '', fileTypesRE.source, excludeRE.source
  ].join(':')

  // Start at package root, or the given sub-directory.
  deeper(path.join(pkg.path, config.root || ''))

  // Load plugins for this package.
  setImmediate(() => {
    pkg.fileTypes.forEach(fileType => pkg._loadPlugins(fileType))
  })

  // Crawl a directory recursively.
  function deeper(dir: string): void {
    const hash = path.relative(pkg.path, dir) + suffix
    if (crawled.has(hash)) return
    crawled.add(hash)

    const names = fs.readDir(fs.readLinks(dir))
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      if (!blacklistRE.test(name) && !excludeRE.test(name)) {
        let isDir = null
        let filePath = path.join(dir, name)
        filePath = resolveLinks(filePath, (destPath) => {
          // Keep paths within the root package.
          const relPath = path.relative(pkg.path, destPath)
          if (relPath[0] != '.') return false

          // Check if the real path is a directory.
          isDir = fs.isDir(fs.readLinks(destPath))
          return true
        })

        // For non-symlinks, we check for directory here.
        if (isDir == null) {
          isDir = fs.isDir(filePath)
        }

        if (isDir) {
          deeper(filePath)
        } else {
          const fileType = path.extname(name)
          if (fileTypesRE.test(fileType)) {
            pkg.fileTypes.add(fileType)
            bundler.addFile(filePath, fileType, pkg)
          }
        }
      }
    }
  }
}

function resolveLinks(
  linkPath: string,
  shouldStop: (destPath: string) => boolean
): string {
  while (true) {
    const destPath = path.resolve(path.dirname(linkPath), fs.readLink(linkPath))
    if (destPath == linkPath || shouldStop(destPath)) break
    linkPath = destPath
  }
  return linkPath
}