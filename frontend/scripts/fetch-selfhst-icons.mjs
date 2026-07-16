#!/usr/bin/env node
/**
 * Fetches the selfh.st/icons slug list and writes it to
 * src/data/selfhstIcons.json. Run from the frontend/ directory:
 *
 *   node scripts/fetch-selfhst-icons.mjs
 *
 * Uses the official selfhst/icons index.json manifest (served via raw.githubusercontent.com)
 * which contains every icon entry with its slug (Reference field). Falls back to the
 * GitHub tree API if the manifest fetch fails.
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Primary: official icon manifest published in the repo
const INDEX_URL = 'https://raw.githubusercontent.com/selfhst/icons/refs/heads/main/index.json'

let slugs

const indexRes = await fetch(INDEX_URL, { headers: { 'User-Agent': 'homelable/1.0' } })
if (indexRes.ok) {
  const entries = await indexRes.json()
  slugs = entries
    .map((e) => e.Reference)
    .filter(Boolean)
    .sort()
  console.log(`✓ Fetched ${slugs.length} slugs from index.json`)
} else {
  // Fallback: GitHub tree API (single request, no pagination needed for <100k files)
  console.warn(`index.json unavailable (${indexRes.status}), trying GitHub tree API...`)
  const treeRes = await fetch(
    'https://api.github.com/repos/selfhst/icons/git/trees/main?recursive=1',
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'homelable/1.0' } },
  )
  if (!treeRes.ok) {
    console.error(`GitHub tree API failed (${treeRes.status}). Keeping existing selfhstIcons.json.`)
    process.exit(0)
  }
  const tree = await treeRes.json()
  slugs = (tree.tree ?? [])
    .filter((x) => x.path?.startsWith('svg/') && x.path.endsWith('.svg'))
    .map((x) => x.path.slice(4, -4))
    .sort()
  console.log(`✓ Fetched ${slugs.length} slugs from GitHub tree API`)
}

const outPath = join(__dirname, '../src/data/selfhstIcons.json')
writeFileSync(outPath, JSON.stringify(slugs, null, 2) + '\n')
console.log(`✓ Wrote ${slugs.length} selfh.st icon slugs to ${outPath}`)
