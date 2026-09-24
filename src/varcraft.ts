import { registerBuiltins } from './builtins'
import { type DiagnosticLogger, Diagnostics, sourceOffset } from './diagnostics'
import {
  type BindingLayer,
  type Environment,
  INHERITED_DATA,
  interpret,
} from './interpreter'
import { limit, spendWork, withBudget } from './limits'
import { defaultToString, type MemberMethod } from './member-methods'
import { parse } from './parser'
import { RESERVED } from './parser-support'
import { DeniedOperationError, MissingNameError, safeKey } from './values'

export type Value = import('./values').Value

export type VarCraftOptions = { readonly builtins?: boolean }

type Snapshot = Record<string, unknown>

// Registration names must be resolvable as expression identifiers. RESERVED
// (keywords + literals) is the parser's own policy; RESERVED_API_NAMES are the
// callable method-layer names, which would be shadowed and unreachable.
const RESERVED_API_NAMES = new Set(['set', 'get', 'clear'])

function assertRegistrableName(name: string): void {
  safeKey(name)
  if (RESERVED.has(name) || RESERVED_API_NAMES.has(name))
    throw new DeniedOperationError(name)
}

function snapshot(value: unknown): Snapshot {
  const result: Snapshot = {}
  if (value === null || value === undefined) return result
  const keys = Object.keys(Object(value))
  limit('keys', keys.length)
  spendWork(keys.length + 1)
  for (const key of keys) {
    safeKey(key)
    result[key] = Reflect.get(Object(value), key)
  }
  return result
}

function merge(layers: readonly BindingLayer[]): Snapshot {
  const result: Snapshot = {}
  let count = 0
  for (const layer of layers)
    for (const key of Object.keys(layer)) {
      result[key] = layer[key]
      count += 1
    }
  spendWork(count)
  return result
}

export class VarCraft {
  private variables: Record<string, Value> = Object.create(null)
  private predefinedVariables: Record<string, Value> = Object.create(null)
  private readonly withBuiltins: boolean
  private readonly diagnostics = new Diagnostics()
  private readonly dataOrigins = new WeakSet<object>()
  private memberMethods = new Map<string, MemberMethod>([
    ['toString', defaultToString],
  ])

  constructor(options: VarCraftOptions = {}) {
    this.withBuiltins = options.builtins === true
    if (this.withBuiltins) registerBuiltins(this)
  }

  setEnableLogging(enableLogging: boolean): void {
    this.diagnostics.setEnabled(enableLogging)
  }

  setLogger(logger: DiagnosticLogger | undefined): void {
    this.diagnostics.setLogger(logger)
  }

  parseExpression(expression: string, data?: unknown): Value {
    this.diagnostics.emit(() => ({
      code: 'parse-expression',
      sourceLength: expression.length,
    }))
    const result = this.evaluate(expression, data)
    this.diagnostics.emit(() => ({
      code: 'expression-result',
      resultType: typeof result,
    }))
    return result
  }

  evaluate(expression: string, data?: unknown): Value {
    try {
      return withBudget((budget) => {
        const program = parse(expression)
        const dataLayer = snapshot(data)
        const stored = snapshot(this.variables)
        const predefined = snapshot(this.predefinedVariables)
        const methods: Snapshot = {
          set: this.store.bind(this),
          get: this.get.bind(this),
          clear: this.clear.bind(this),
        }
        // Legacy receiver (M1): callbacks run with the merged context as `this`,
        // so a trusted callback can read bindings and call set/get/clear. This is
        // documented compatibility behavior, not a sandbox; receiver semantics
        // are deliberately unchanged.
        const context = merge([dataLayer, stored, predefined, methods])
        // Task 9 (M4): carry the outer data layer on the merged receiver so
        // nested helper expressions can inherit it explicitly. Non-enumerable,
        // so the merged-receiver surface (set/get/clear) is unchanged.
        Object.defineProperty(context, INHERITED_DATA, { value: dataLayer })
        const environment: Environment = {
          methods,
          predefined,
          stored,
          data: dataLayer,
          context,
          memberMethods: this.memberMethods,
          dataOrigins: this.dataOrigins,
        }
        if (program.kind !== 'assignment')
          return interpret(program, environment, budget)
        safeKey(program.name)
        const result = interpret(program.value, environment, budget)
        this.diagnostics.emit(() => ({
          code: 'assignment',
          nameLength: program.name.length,
        }))
        this.variables[program.name] = result
        return result
      })
    } catch (error) {
      this.diagnostics.emit(() => ({
        code: 'evaluate-error',
        errorName: error instanceof Error ? error.name : typeof error,
        sourceLength: expression.length,
        offset: sourceOffset(error),
      }))
      throw error
    }
  }

  set(name: string, value: Value): void {
    assertRegistrableName(name)
    this.markTrusted(value)
    this.variables[name] = value
  }

  setPredefinedVar(name: string, value: Value): void {
    assertRegistrableName(name)
    this.markTrusted(value)
    this.predefinedVariables[name] = value
  }

  setMemberMethod(name: string, method: MemberMethod): void {
    assertRegistrableName(name)
    this.markTrusted(method)
    this.memberMethods.set(name, method)
  }

  get(name: string): Value {
    safeKey(name)
    if (Object.prototype.hasOwnProperty.call(this.variables, name))
      return this.variables[name]
    if (Object.prototype.hasOwnProperty.call(this.predefinedVariables, name))
      return this.predefinedVariables[name]
    throw new MissingNameError(name)
  }

  clear(): void {
    this.variables = Object.create(null)
    this.diagnostics.emit(() => ({ code: 'clear' }))
  }

  reset(): void {
    this.variables = Object.create(null)
    this.predefinedVariables = Object.create(null)
    this.memberMethods = new Map<string, MemberMethod>([
      ['toString', defaultToString],
    ])
    if (this.withBuiltins) registerBuiltins(this)
    this.diagnostics.emit(() => ({ code: 'reset' }))
  }

  // Expression-level `set` (the callable method layer) never clears provenance,
  // so storing a data-origin function cannot promote it into a trusted callback.
  // Only the public host APIs are explicit grants.
  private store(name: string, value: Value): void {
    safeKey(name)
    this.variables[name] = value
  }

  private markTrusted(value: Value): void {
    if (typeof value === 'function') this.dataOrigins.delete(value)
  }
}
