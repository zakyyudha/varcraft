import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type PackageRoot = {
  readonly default: {
    readonly parseExpression: (expression: string) => unknown
  }
  readonly VarCraft?: new () => {
    readonly parseExpression: (expression: string) => unknown
    readonly set: (name: string, value: unknown) => void
    readonly setMemberMethod: (name: string, method: unknown) => void
  }
  readonly DeniedOperationError?: new (operation: string) => Error
  readonly MissingNameError?: new (variable: string) => Error
  readonly LimitError?: new (resource: string) => Error
  readonly LIMITS?: { readonly source: number }
}

const packageRoot = require('../dist/index.js') as PackageRoot

function createConsumerDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'varcraft-package-contract-'))
  mkdirSync(join(directory, 'node_modules', '@zakyyudha'), { recursive: true })
  symlinkSync(
    process.cwd(),
    join(directory, 'node_modules', '@zakyyudha', 'varcraft'),
  )
  return directory
}

function runNodeConsumer(directory: string, source: string) {
  const file = join(directory, 'consumer.cjs')
  writeFileSync(file, source)
  return spawnSync(process.execPath, [file], {
    cwd: directory,
    encoding: 'utf8',
  })
}

function expectCommandSuccess(result: ReturnType<typeof spawnSync>): void {
  if (result.status !== 0) {
    throw new Error(
      [result.error?.message, result.stdout, result.stderr]
        .filter((part): part is string => Boolean(part))
        .join('\n'),
    )
  }
}

describe('package root contract', () => {
  // Task 13 intentionally changed the root contract from a default-only export
  // to a default singleton plus named class/errors/limits, so the former
  // baseline expectation (`['default']`) is obsolete. Pin the new stable shape.
  it('exposes the stable CommonJS root shape after package export changes', () => {
    expect(Object.keys(packageRoot).sort()).toEqual(
      [
        'DeniedOperationError',
        'LIMITS',
        'LimitError',
        'MissingNameError',
        'VarCraft',
        'default',
      ].sort(),
    )
    expect(typeof packageRoot.default.parseExpression).toBe('function')
  })

  it('exposes default singleton, named class, errors, and public limits at package root', () => {
    expect(typeof packageRoot.default.parseExpression).toBe('function')
    expect(typeof packageRoot.VarCraft).toBe('function')
    expect(typeof packageRoot.DeniedOperationError).toBe('function')
    expect(typeof packageRoot.MissingNameError).toBe('function')
    expect(typeof packageRoot.LimitError).toBe('function')
    expect(packageRoot.LIMITS).toBeDefined()
  })

  it('supports CommonJS consumers through the installed package entry', () => {
    const directory = createConsumerDirectory()
    try {
      const result = runNodeConsumer(
        directory,
        `const pkg = require('@zakyyudha/varcraft')
if (typeof pkg.default?.parseExpression !== 'function') process.exit(1)
if (typeof pkg.VarCraft !== 'function') process.exit(2)
const engine = new pkg.VarCraft()
engine.set('answer', 42)
if (engine.parseExpression('answer') !== 42) process.exit(3)
if (typeof pkg.MissingNameError !== 'function') process.exit(4)
`,
      )

      expectCommandSuccess(result)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('type-checks every documented package-root declaration', () => {
    const directory = createConsumerDirectory()
    try {
      const file = join(directory, 'consumer.ts')
      writeFileSync(
        file,
        `import VarCraft, {
  VarCraft as VarCraftClass,
  DeniedOperationError,
  LimitError,
  MissingNameError,
  LIMITS,
  type MemberMethod,
  type Value,
} from '@zakyyudha/varcraft'

const engine = new VarCraftClass()
const method: MemberMethod = (target, args) => args.length === 0 ? target : target
      const value: Value = engine.evaluate('undefined')
      engine.set('answer', value)
      engine.setPredefinedVar('_identity', (...args: unknown[]) => args[0])
      engine.setMemberMethod('identity', method)
      engine.setEnableLogging(false)
      engine.get('answer')
      engine.clear()
      new DeniedOperationError('member method')
      new MissingNameError('answer')
      new LimitError('source')
      const sourceLimit: number = LIMITS.source
      const singletonResult: Value = VarCraft.evaluate('undefined')
      void [method, sourceLimit, singletonResult]

`,
      )

      const tsc = join(
        process.cwd(),
        'node_modules',
        'typescript',
        'bin',
        'tsc',
      )
      const result = spawnSync(
        process.execPath,
        [
          tsc,
          '--noEmit',
          '--strict',
          '--skipLibCheck',
          '--target',
          'ES2019',
          '--module',
          'node16',
          '--moduleResolution',
          'node16',
          file,
        ],
        { cwd: directory, encoding: 'utf8' },
      )

      expectCommandSuccess(result)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
