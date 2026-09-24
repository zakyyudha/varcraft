import { assertNever, type Expression } from './ast'
import { binary } from './operators'
import type { MemberMethod } from './member-methods'
import type { Budget } from './limits'
import {
  DeniedOperationError,
  MissingNameError,
  ownRead,
  primitive,
  safeKey,
  valueFromHost,
  type Value,
  type Callback,
} from './values'

export type BindingLayer = Readonly<Record<string, unknown>>

export type Environment = {
  readonly methods: BindingLayer
  readonly predefined: BindingLayer
  readonly stored: BindingLayer
  readonly data: BindingLayer
  readonly context: object
  readonly memberMethods: ReadonlyMap<string, MemberMethod>
}

function own(layer: BindingLayer, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(layer, name)
}

function resolve(environment: Environment, name: string): Value {
  safeKey(name)
  for (const layer of [
    environment.methods,
    environment.predefined,
    environment.stored,
    environment.data,
  ]) {
    if (own(layer, name)) return valueFromHost(Reflect.get(layer, name))
  }
  throw new MissingNameError(name)
}

function isCallback(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

function callable(environment: Environment, name: string): Callback {
  safeKey(name)
  for (const layer of [
    environment.methods,
    environment.predefined,
    environment.stored,
  ]) {
    if (!own(layer, name)) continue
    const callback = Reflect.get(layer, name)
    if (typeof callback !== 'function')
      throw new DeniedOperationError(`call non-function ${name}`)
    if (!isCallback(callback))
      throw new DeniedOperationError(`call non-function ${name}`)
    return callback
  }
  throw new DeniedOperationError(`call ${name}`)
}

export function interpret(
  expression: Expression,
  environment: Environment,
  budget: Budget,
): Value {
  budget.spend()
  switch (expression.kind) {
    case 'literal':
      return expression.value
    case 'identifier':
      return resolve(environment, expression.name)
    case 'array':
      return expression.elements.map((element) =>
        interpret(element, environment, budget),
      )
    case 'member':
      return ownRead(
        interpret(expression.target, environment, budget),
        expression.key,
      )
    case 'computed-member': {
      const key = primitive(interpret(expression.key, environment, budget))
      if (typeof key !== 'string' && typeof key !== 'number')
        throw new DeniedOperationError('computed member key')
      return ownRead(
        interpret(expression.target, environment, budget),
        String(key),
      )
    }
    case 'optional-member': {
      const target = interpret(expression.target, environment, budget)
      if (target === null || target === undefined) return undefined
      const key = expression.computed
        ? primitive(
            interpret(expression.key as Expression, environment, budget),
          )
        : expression.key
      if (typeof key !== 'string' && typeof key !== 'number')
        throw new DeniedOperationError('optional member key')
      return ownRead(target, String(key))
    }
    case 'unary': {
      const value = primitive(
        interpret(expression.operand, environment, budget),
      )
      switch (expression.operator) {
        case '!':
          return !value
        case '+':
          return Number(value)
        case '-':
          return -Number(value)
        default:
          throw new TypeError('Unsupported unary operator')
      }
    }
    case 'binary': {
      const left = interpret(expression.left, environment, budget)
      if (expression.operator === '&&' && !left) return left
      if (expression.operator === '||' && left) return left
      const right = interpret(expression.right, environment, budget)
      return binary(expression.operator, left, right)
    }
    case 'conditional':
      return interpret(expression.condition, environment, budget)
        ? interpret(expression.consequent, environment, budget)
        : interpret(expression.alternate, environment, budget)
    case 'call': {
      budget.spend()
      const callback = callable(environment, expression.name)
      const args = expression.args.map((argument) =>
        interpret(argument, environment, budget),
      )
      return valueFromHost(Reflect.apply(callback, environment.context, args))
    }
    case 'method-call': {
      const target = interpret(expression.target, environment, budget)
      const method = environment.memberMethods.get(expression.name)
      if (method === undefined)
        throw new DeniedOperationError(`member method ${expression.name}`)
      const args = expression.args.map((argument) =>
        interpret(argument, environment, budget),
      )
      return method(target, args)
    }
    default:
      return assertNever(expression)
  }
}
