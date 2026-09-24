import { assertNever, type Expression } from './ast'
import type { Budget } from './limits'
import type { MemberMethod } from './member-methods'
import { binary } from './operators'
import {
  type Callback,
  DeniedOperationError,
  MissingNameError,
  ownRead,
  primitive,
  safeKey,
  type Value,
  valueFromHost,
} from './values'

export type BindingLayer = Readonly<Record<string, unknown>>

export type Environment = {
  readonly methods: BindingLayer
  readonly predefined: BindingLayer
  readonly stored: BindingLayer
  readonly data: BindingLayer
  readonly context: object
  readonly memberMethods: ReadonlyMap<string, MemberMethod>
  // Function references that arrived through evaluation `data`. Side-table, not
  // part of the public `Value` union. Host registration clears membership.
  readonly dataOrigins: WeakSet<object>
}

// Task 9 (M4): the inherited `data` layer of the evaluation that is currently
// invoking a callback travels on the merged receiver (`environment.context`)
// under this non-enumerable symbol. It lives on the per-evaluation context
// object and is set once at environment construction, so there is no
// module-global "active data" state. Arbitrary callbacks registered by a host
// never see this key (it is a symbol, not an own string key), so the documented
// merged-receiver surface is unchanged.
export const INHERITED_DATA: unique symbol = Symbol('varcraft.inheritedData')

/** Reads the outer data layer stashed on a callback receiver, or `{}` if none. */
export function inheritedData(receiver: unknown): BindingLayer {
  if (receiver === null || receiver === undefined) return {}
  const layer = Reflect.get(Object(receiver), INHERITED_DATA)
  return layer === undefined ? {} : (layer as BindingLayer)
}

// Task 10 (M5): a trusted registry callback marked with this symbol receives its
// call arguments as unevaluated thunks (`LazyArgument`) instead of values, so a
// conditional/switch helper can evaluate only the branch it selects. The marker
// is checked on the resolved callback; data-origin functions are never callable,
// so only an explicitly opted-in registry callback can be lazy.
export const LAZY_ARGS: unique symbol = Symbol('varcraft.lazyArgs')

export type LazyArgument = { readonly evaluate: () => Value }

function lazyArgument(
  expression: Expression,
  environment: Environment,
  budget: Budget,
): LazyArgument {
  return { evaluate: () => interpret(expression, environment, budget) }
}

function own(layer: BindingLayer, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(layer, name)
}

function isObjectLike(value: Value): value is object {
  return (
    value !== null && (typeof value === 'object' || typeof value === 'function')
  )
}

function resolve(environment: Environment, name: string): Value {
  safeKey(name)
  for (const layer of [
    environment.methods,
    environment.predefined,
    environment.stored,
    environment.data,
  ]) {
    if (!own(layer, name)) continue
    const value = valueFromHost(Reflect.get(layer, name))
    // SEC-1: tag any container or function that arrived through evaluation
    // `data`, so provenance survives member/computed/optional reads of it.
    if (layer === environment.data && isObjectLike(value))
      environment.dataOrigins.add(value)
    return value
  }
  throw new MissingNameError(name)
}

// SEC-1: a value reached from a data-origin container is itself data-origin.
// The read returns the value unchanged; provenance is a side-table entry, so
// no public `Value` is mutated and no dispatch is granted.
function readMember(
  environment: Environment,
  target: Value,
  key: string,
): Value {
  const fromData = isObjectLike(target) && environment.dataOrigins.has(target)
  const value = ownRead(target, key)
  if (fromData && isObjectLike(value)) environment.dataOrigins.add(value)
  return value
}

function isCallback(value: unknown): value is Callback {
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
    if (!isCallback(callback))
      throw new DeniedOperationError(`call non-function ${name}`)
    if (environment.dataOrigins.has(callback))
      throw new DeniedOperationError(`call data-origin ${name}`)
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
      return readMember(
        environment,
        interpret(expression.target, environment, budget),
        expression.key,
      )
    case 'computed-member': {
      const target = interpret(expression.target, environment, budget)
      const key = primitive(interpret(expression.key, environment, budget))
      if (typeof key !== 'string' && typeof key !== 'number')
        throw new DeniedOperationError('computed member key')
      return readMember(environment, target, String(key))
    }
    case 'optional-chain': {
      let current = interpret(expression.base, environment, budget)
      for (const segment of expression.segments) {
        const absent = current === null || current === undefined
        if (absent && segment.optional) return undefined
        if (segment.access === 'member') {
          current = readMember(environment, current, segment.key)
        } else {
          const key = primitive(interpret(segment.key, environment, budget))
          if (typeof key !== 'string' && typeof key !== 'number')
            throw new DeniedOperationError('computed member key')
          current = readMember(environment, current, String(key))
        }
      }
      return current
    }
    case 'unary': {
      const value = interpret(expression.operand, environment, budget)
      switch (expression.operator) {
        case '!':
          return !value
        case '+': {
          const primitiveValue = primitive(value)
          return Number(primitiveValue)
        }
        case '-': {
          const primitiveValue = primitive(value)
          return -Number(primitiveValue)
        }
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
      if (Reflect.get(Object(callback), LAZY_ARGS) === true) {
        const args = expression.args.map((argument) =>
          lazyArgument(argument, environment, budget),
        )
        return valueFromHost(Reflect.apply(callback, environment.context, args))
      }
      const args = expression.args.map((argument) =>
        interpret(argument, environment, budget),
      )
      return valueFromHost(Reflect.apply(callback, environment.context, args))
    }
    case 'method-call': {
      const target = interpret(expression.target, environment, budget)
      if (
        expression.optional === true &&
        (target === null || target === undefined)
      )
        return undefined
      const method = environment.memberMethods.get(expression.name)
      if (method === undefined)
        throw new DeniedOperationError(`member method ${expression.name}`)
      const args = expression.args.map((argument) =>
        interpret(argument, environment, budget),
      )
      return valueFromHost(method(target, args))
    }
    default:
      return assertNever(expression)
  }
}
