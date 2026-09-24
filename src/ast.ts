export type UnaryOperator = '!' | '+' | '-'
export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '<'
  | '<='
  | '>'
  | '>='
  | '=='
  | '!='
  | '==='
  | '!=='
  | '&&'
  | '||'

type ExpressionShape =
  | {
      readonly kind: 'literal'
      readonly value: number | string | boolean | null | undefined
    }
  | { readonly kind: 'identifier'; readonly name: string }
  | { readonly kind: 'array'; readonly elements: readonly Expression[] }
  | {
      readonly kind: 'unary'
      readonly operator: UnaryOperator
      readonly operand: Expression
    }
  | {
      readonly kind: 'binary'
      readonly operator: BinaryOperator
      readonly left: Expression
      readonly right: Expression
    }
  | {
      readonly kind: 'conditional'
      readonly condition: Expression
      readonly consequent: Expression
      readonly alternate: Expression
    }
  | {
      readonly kind: 'call'
      readonly name: string
      readonly args: readonly Expression[]
    }
  | {
      readonly kind: 'method-call'
      readonly target: Expression
      readonly name: string
      readonly args: readonly Expression[]
      // SEC-2: the receiver is a continuous optional chain, so a nullish
      // receiver short-circuits the call instead of dispatching on `undefined`.
      readonly optional?: boolean
    }
  | {
      readonly kind: 'member'
      readonly target: Expression
      readonly key: string
    }
  | {
      readonly kind: 'computed-member'
      readonly target: Expression
      readonly key: Expression
    }
  | {
      readonly kind: 'optional-chain'
      readonly base: Expression
      readonly segments: readonly ChainSegment[]
    }

export type Expression = ExpressionShape & {
  readonly offset: number
  readonly height: number
}
export type ChainSegment =
  | {
      readonly access: 'member'
      readonly key: string
      readonly optional: boolean
    }
  | {
      readonly access: 'computed'
      readonly key: Expression
      readonly optional: boolean
    }
export type Assignment = {
  readonly kind: 'assignment'
  readonly name: string
  readonly value: Expression
  readonly offset: number
}
export type Program = Expression | Assignment
export type { ExpressionShape }

export function assertNever(value: never): never {
  throw new TypeError(`Unexpected variant: ${String(value)}`)
}
