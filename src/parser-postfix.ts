import type { ChainSegment, Expression } from './ast'
import { limit } from './limits'
import { ExpressionSyntaxError, type Token } from './tokenizer'

export type ParserPostfixContext = {
  readonly current: () => Token
  readonly advance: () => void
  readonly consume: (value: string) => Token
  readonly expectSymbol: (value: string) => void
  readonly expression: (minimum: number) => Expression
  readonly node: <T extends Expression>(expression: T) => T
  readonly identifier: (token: Token) => string
}

export function parsePostfix(
  context: ParserPostfixContext,
  initial: Expression,
): Expression {
  let base = initial
  let segments: ChainSegment[] = []
  let chaining = false
  let chainOffset = 0

  while (true) {
    const token = context.current()
    if (token.kind !== 'symbol')
      return chaining ? chainNode(context, base, segments, chainOffset) : base
    if (token.value === '.') {
      context.advance()
      const key = context.current()
      if (key.kind !== 'identifier')
        throw new ExpressionSyntaxError('Expected member name', key.offset)
      context.advance()
      const name = context.identifier(key)
      if (chaining) {
        segments.push({ access: 'member', key: name, optional: false })
      } else {
        base = context.node({
          kind: 'member',
          target: base,
          key: name,
          offset: token.offset,
          height: base.height + 1,
        })
      }
      continue
    }
    if (token.value === '?.') {
      context.advance()
      if (!chaining) {
        chaining = true
        chainOffset = token.offset
      }
      const key = context.current()
      if (key.kind === 'symbol' && key.value === '[') {
        context.advance()
        const computedKey = context.expression(0)
        context.expectSymbol(']')
        segments.push({ access: 'computed', key: computedKey, optional: true })
      } else {
        if (key.kind !== 'identifier')
          throw new ExpressionSyntaxError(
            'Expected optional member name',
            key.offset,
          )
        context.advance()
        segments.push({
          access: 'member',
          key: context.identifier(key),
          optional: true,
        })
      }
      continue
    }
    if (token.value === '[') {
      context.advance()
      const key = context.expression(0)
      context.expectSymbol(']')
      if (chaining) {
        segments.push({ access: 'computed', key, optional: false })
      } else {
        base = context.node({
          kind: 'computed-member',
          target: base,
          key,
          offset: token.offset,
          height: Math.max(base.height, key.height) + 1,
        })
      }
      continue
    }
    if (token.value === '(') {
      const call = parseCallArguments(context)
      if (chaining) {
        const last = segments[segments.length - 1]
        if (last.access !== 'member' || last.optional)
          throw new ExpressionSyntaxError(
            'Member and result calls are denied',
            token.offset,
          )
        const remaining = segments.slice(0, -1)
        const receiver =
          remaining.length === 0
            ? base
            : chainNode(context, base, remaining, chainOffset)
        base = context.node({
          kind: 'method-call',
          target: receiver,
          name: last.key,
          args: call.args,
          offset: call.offset,
          height: Math.max(receiver.height, call.height) + 1,
          optional: true,
        })
        segments = []
        chaining = false
        continue
      }
      if (base.kind === 'member') {
        base = context.node({
          kind: 'method-call',
          target: base.target,
          name: base.key,
          args: call.args,
          offset: call.offset,
          height: Math.max(base.height, call.height) + 1,
        })
        continue
      }
      if (base.kind !== 'identifier')
        throw new ExpressionSyntaxError(
          'Member and result calls are denied',
          token.offset,
        )
      base = context.node({
        kind: 'call',
        name: base.name,
        args: call.args,
        offset: call.offset,
        height: Math.max(base.height, call.height) + 1,
      })
      continue
    }
    return chaining ? chainNode(context, base, segments, chainOffset) : base
  }
}

function chainNode(
  context: ParserPostfixContext,
  base: Expression,
  segments: readonly ChainSegment[],
  offset: number,
): Expression {
  const keys = segments.map((segment) =>
    segment.access === 'computed' ? segment.key.height : 0,
  )
  return context.node({
    kind: 'optional-chain',
    base,
    segments,
    offset,
    height: Math.max(base.height, ...keys) + segments.length,
  })
}

export function parseArrayLiteral(context: ParserPostfixContext): Expression {
  const start = context.consume('[')
  const elements: Expression[] = []
  while (
    !(context.current().kind === 'symbol' && context.current().value === ']')
  ) {
    if (elements.length > 0) context.expectSymbol(',')
    elements.push(context.expression(0))
    limit('array', elements.length)
  }
  context.expectSymbol(']')
  return context.node({
    kind: 'array',
    elements,
    offset: start.offset,
    height: Math.max(0, ...elements.map((element) => element.height)) + 1,
  })
}

function parseCallArguments(context: ParserPostfixContext): {
  readonly args: Expression[]
  readonly offset: number
  readonly height: number
} {
  const start = context.consume('(')
  const args: Expression[] = []
  while (
    !(context.current().kind === 'symbol' && context.current().value === ')')
  ) {
    if (args.length > 0) context.expectSymbol(',')
    args.push(context.expression(0))
    limit('args', args.length)
  }
  context.expectSymbol(')')
  return {
    args,
    offset: start.offset,
    height: Math.max(0, ...args.map((argument) => argument.height)) + 1,
  }
}
