#!/usr/bin/env node
// Publish-safety gate (finding M10).
//
// Packs the package, asserts the tarball ships only the intended files, extracts
// it into a throwaway consumer, and exercises both the CommonJS entry point and
// ESM named imports against the packed artifact. Exits non-zero on any mismatch.
//
// No network access and no package manager install: the tarball is extracted
// directly into the consumer's node_modules, so this works on any Node that can
// run the dev toolchain. `pnpm pack` triggers `prepack` (verify + build), so a
// clean checkout packs a fresh dist.
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_NAME = '@zakyyudha/varcraft'

// A tarball may ship only these entries. npm always adds package.json plus any
// README/LICENCE it finds; everything else must live under dist/ (files: ["dist"]).
const ALLOWED_ENTRY =
  /^package\/(dist\/.*|package\.json|readme\.md|readme|license|license\.md|licence|licence\.md)$/i
// Entries that must never leak into the published tarball.
const FORBIDDEN_ENTRY =
  /^package\/(src|test|scripts|\.github|\.omo|tsconfig.*|biome\.json|.*\.test\.ts)/

const CJS_SMOKE = `'use strict'
const assert = require('node:assert')
const root = require('${PACKAGE_NAME}')

assert.ok(root && typeof root === 'object', 'namespace')
assert.strictEqual(typeof root.default, 'object', 'default singleton')
assert.strictEqual(typeof root.VarCraft, 'function', 'named VarCraft class')
assert.strictEqual(typeof root.LIMITS, 'object', 'LIMITS export')
for (const name of ['LimitError', 'MissingNameError', 'DeniedOperationError'])
  assert.strictEqual(typeof root[name], 'function', name + ' export')

root.default.set('price', 100)
root.default.set('quantity', 3)
assert.strictEqual(root.default.parseExpression('price * quantity'), 300)

const engine = new root.VarCraft({ builtins: true })
assert.strictEqual(engine.parseExpression('_sum([1, 2, 3])'), 6)
assert.strictEqual(
  engine.evaluate('score >= 90 ? "approved" : "review"', { score: 95 }),
  'approved',
)
assert.strictEqual(engine.parseExpression('"ari".toString()'), 'ari')
assert.throws(() => engine.evaluate('missingName'), root.MissingNameError)
assert.strictEqual(typeof root.LIMITS.source, 'number')

console.log('CJS_SMOKE_OK')
`

const ESM_SMOKE = `import assert from 'node:assert'
import root, {
  VarCraft,
  LIMITS,
  LimitError,
  MissingNameError,
  DeniedOperationError,
} from '${PACKAGE_NAME}'

assert.ok(root && typeof root.default === 'object', 'default import namespace')
assert.strictEqual(typeof VarCraft, 'function', 'named VarCraft class')
assert.strictEqual(typeof LIMITS, 'object', 'named LIMITS')
assert.strictEqual(typeof LimitError, 'function', 'named LimitError')
assert.strictEqual(typeof MissingNameError, 'function', 'named MissingNameError')
assert.strictEqual(typeof DeniedOperationError, 'function', 'named DeniedOperationError')

const engine = new VarCraft({ builtins: true })
assert.deepStrictEqual(engine.evaluate('_map([1, 2, 3], "_item_ * 2")'), [2, 4, 6])
assert.strictEqual(root.default.parseExpression('1 + 1'), 2)

console.log('ESM_SMOKE_OK')
`

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options })
}

function fail(message) {
  console.error(`PACKAGE_SMOKE_FAIL: ${message}`)
  process.exit(1)
}

const tarballFlag = process.argv.indexOf('--tarball')
const providedTarball =
  tarballFlag === -1 ? undefined : resolve(process.argv[tarballFlag + 1])
const keep = process.argv.includes('--keep')

const rootManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const expectedTarball = `${PACKAGE_NAME.replace(/^@/, '').replace('/', '-')}-${rootManifest.version}.tgz`

const workspace = mkdtempSync(join(tmpdir(), 'varcraft-pack-smoke-'))
const packDir = join(workspace, 'pack')
const consumerDir = join(workspace, 'consumer')
mkdirSync(packDir, { recursive: true })
mkdirSync(consumerDir, { recursive: true })

try {
  let tarball = providedTarball
  if (!tarball) {
    console.log('> pnpm pack (runs prepack: verify + build)')
    run('pnpm', ['pack', '--pack-destination', packDir], { cwd: ROOT })
    const packed = readdirSync(packDir).filter((name) => name.endsWith('.tgz'))
    if (packed.length !== 1)
      fail(`expected exactly one tarball, found: ${packed.join(', ') || 'none'}`)
    tarball = join(packDir, packed[0])
  }

  const tarballName = tarball.slice(tarball.lastIndexOf('/') + 1)
  if (tarballName !== expectedTarball)
    fail(`tarball name ${tarballName} != expected ${expectedTarball}`)

  // 1. Tarball file allowlist.
  const entries = run('tar', ['-tzf', tarball])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  for (const entry of entries) {
    if (entry === 'package/') continue // bare root dir entry; harmless
    if (FORBIDDEN_ENTRY.test(entry))
      fail(`forbidden entry in tarball: ${entry}`)
    if (!ALLOWED_ENTRY.test(entry))
      fail(`unexpected entry in tarball: ${entry}`)
  }
  const requiredEntries = [
    'package/package.json',
    'package/dist/index.js',
    'package/dist/index.d.ts',
  ]
  for (const entry of requiredEntries)
    if (!entries.includes(entry)) fail(`missing required entry: ${entry}`)
  console.log(`> tarball contents OK (${entries.length} entries, dist-only)`)

  // 2. Tarball manifest agrees with the source manifest.
  const tarballManifest = JSON.parse(
    run('tar', ['-xzf', tarball, '-O', 'package/package.json']),
  )
  if (tarballManifest.version !== rootManifest.version)
    fail(`tarball version ${tarballManifest.version} != ${rootManifest.version}`)
  if (
    JSON.stringify(tarballManifest.engines) !==
    JSON.stringify(rootManifest.engines)
  )
    fail('tarball engines disagree with package.json')

  // 3. Extract into a throwaway consumer (no network, no install step needed).
  const installDir = join(consumerDir, 'node_modules', ...PACKAGE_NAME.split('/'))
  mkdirSync(installDir, { recursive: true })
  run('tar', ['-xzf', tarball, '-C', installDir, '--strip-components=1'])
  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify(
      { name: 'varcraft-pack-smoke-consumer', version: '0.0.0', private: true },
      null,
      2,
    )}\n`,
  )

  // 4. CommonJS + ESM named-import consumer smoke.
  writeFileSync(join(consumerDir, 'smoke.cjs'), CJS_SMOKE)
  writeFileSync(join(consumerDir, 'smoke.mjs'), ESM_SMOKE)
  for (const file of ['smoke.cjs', 'smoke.mjs']) {
    const output = run(process.execPath, [file], { cwd: consumerDir })
    const marker = file.endsWith('.cjs') ? 'CJS_SMOKE_OK' : 'ESM_SMOKE_OK'
    if (!output.includes(marker))
      fail(`${file} did not print ${marker}; got: ${output.trim()}`)
    console.log(`> ${file} ${output.trim()}`)
  }

  console.log(`PACKAGE_SMOKE_OK ${tarballName}`)
} finally {
  if (!keep) rmSync(workspace, { recursive: true, force: true })
  else console.log(`(kept workspace: ${workspace})`)
}
