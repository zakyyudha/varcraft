import { interpret, type BindingLayer, type Environment } from './interpreter'
import { withBudget } from './limits'
import { parse } from './parser'
import { defaultToString, type MemberMethod } from './member-methods'
import { MissingNameError, safeKey } from './values'

export type Value = import('./values').Value

type Snapshot = Record<string, unknown>

function snapshot(value: unknown): Snapshot {
  const result: Snapshot = {}
  if (value === null || value === undefined) return result
  for (const key of Object.keys(Object(value))) {
    safeKey(key)
    result[key] = Reflect.get(Object(value), key)
  }
  return result
}

function merge(layers: readonly BindingLayer[]): Snapshot {
  const result: Snapshot = {}
  for (const layer of layers)
    for (const key of Object.keys(layer)) result[key] = layer[key]
  return result
}

export class VarCraft {
  private variables: Record<string, Value> = Object.create(null)
  private predefinedVariables: Record<string, Value> = Object.create(null)
  private enableLogging = false
  private memberMethods = new Map<string, MemberMethod>([
    ['toString', defaultToString],
  ])

  setEnableLogging(enableLogging: boolean): void {
    this.enableLogging = enableLogging
  }

  private log(message: string): void {
    if (this.enableLogging) this.log(message)
  }

  parseExpression(expression: string, data?: unknown): Value {
    this.log(`Parsing expression: ${expression}`)
    const result = this.evaluate(expression, data)
    this.log(`Result of expression: ${expression} is: ${String(result)}`)
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
          set: this.set.bind(this),
          get: this.get.bind(this),
          clear: this.clear.bind(this),
        }
        const environment: Environment = {
          methods,
          predefined,
          stored,
          data: dataLayer,
          context: merge([dataLayer, stored, predefined, methods]),
          memberMethods: this.memberMethods,
        }
        if (program.kind !== 'assignment')
          return interpret(program, environment, budget)
        safeKey(program.name)
        const result = interpret(program.value, environment, budget)
        this.variables[program.name] = result
        this.log(
          `Defined variable ${program.name} with value: ${String(result)}`,
        )
        return result
      })
    } catch (error) {
      console.error(`Error while evaluating expression: ${expression}`)
      throw error
    }
  }

  set(name: string, value: Value): void {
    safeKey(name)
    this.variables[name] = value
  }

  setPredefinedVar(name: string, value: Value): void {
    safeKey(name)
    this.predefinedVariables[name] = value
  }

  setMemberMethod(name: string, method: MemberMethod): void {
    safeKey(name)
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
    this.variables = {}
    this.log('Cleared defined functions and variables')
  }
}
