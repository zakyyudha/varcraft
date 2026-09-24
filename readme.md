# VarCraft 2.0

VarCraft is a TypeScript expression engine for evaluating controlled business
rules over variables, arrays, objects, and registered helper functions.

Version 2.0 replaces dynamic JavaScript execution with a dependency-free
tokenizer, Pratt parser, and explicit interpreter.

## Installation

```bash
pnpm add @zakyyudha/varcraft
```

VarCraft 2.0 development uses pnpm, TypeScript 7, Biome, Jest, and SWC.

## Basic Usage

The package default export is a shared VarCraft instance:

```typescript
import VarCraft from '@zakyyudha/varcraft'

VarCraft.set('price', 100)
VarCraft.set('quantity', 3)

const total = VarCraft.parseExpression('price * quantity')
console.log(total) // 300
```

Create an isolated instance when state must not be shared:

```typescript
import { VarCraft } from './src/varcraft'

const engine = new VarCraft()
engine.set('name', 'VarCraft')

console.log(engine.evaluate('name')) // VarCraft
```

The package root currently default-exports the singleton. The named class is
available from the source module and remains the reusable implementation.

## API

### `set(name, value)`

Stores a value for later expressions.

```typescript
VarCraft.set('customer', {
  name: 'Ari',
  active: true,
})

VarCraft.parseExpression('customer.active') // true
```

### `setPredefinedVar(name, value)`

Registers a predefined value or callable helper.

```typescript
VarCraft.setPredefinedVar('_discount', (price: number) => price * 0.9)

VarCraft.parseExpression('_discount(100)') // 90
```

Registered functions are application capabilities. Do not register callbacks
that expose secrets, filesystem access, network access, or other sensitive
operations to untrusted expression authors.

### `setMemberMethod(name, method)`

Registers an audited method implementation for controlled member-call syntax.
The interpreter never dispatches arbitrary object methods dynamically.

```typescript
VarCraft.setMemberMethod('upper', (target, args) => {
  if (args.length !== 0 || typeof target !== 'string') {
    throw new TypeError('upper expects string target')
  }
  return target.toUpperCase()
})

VarCraft.parseExpression('"ari".upper()') // ARI
```

Unregistered member methods are rejected. The default registry includes only
the restricted zero-argument `toString()` conversion used by compatible buying
expressions.

### `get(name)`

Reads stored variables first, then predefined variables.

```typescript
VarCraft.get('customer')
```

Missing values throw `Variable or function <name> not found`.

### `clear()`

Clears stored variables while preserving predefined variables and built-in
helpers.

### `parseExpression(expression, data?)` and `evaluate(expression, data?)`

Both methods evaluate a restricted expression. `data` supplies temporary
top-level bindings for that evaluation.

```typescript
VarCraft.parseExpression('amount * taxRate', {
  amount: 100,
  taxRate: 1.1,
}) // 110
```

`parseExpression` and `evaluate` currently expose the same evaluation path.

## Supported Expressions

Supported syntax includes:

- Number, string, boolean, `null`, and `undefined` literals
- Array literals
- Identifiers
- Parentheses
- Dot member reads: `customer.profile.name`
- Bracket member reads: `items[0]`, `items[index]`
- Optional member reads: `customer?.profile?.name`, `items?.[0]?.name`
- Unary operators: `!`, `+`, `-`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparisons: `<`, `<=`, `>`, `>=`
- Equality: `==`, `!=`, `===`, `!==`
- Logical operators: `&&`, `||`
- Ternary conditionals: `condition ? whenTrue : whenFalse`
- Calls to registered helpers
- Zero-argument `.toString()` on primitive/array results
- Top-level identifier assignment: `total = price * quantity`

Examples:

```typescript
VarCraft.parseExpression('items[0].price')
VarCraft.parseExpression('quantity > 0 && active')
VarCraft.parseExpression('score >= 90 ? "approved" : "review"')
VarCraft.parseExpression('total = price * quantity')
```

Assignment returns its value and persists it as a stored variable. Assignment
is limited to one top-level identifier. Member, compound, chained, and nested
assignments are not supported.

## Built-in Helpers

The default singleton registers these helpers:

| Helper | Purpose |
| --- | --- |
| `_sum(array)` | Adds numeric array values |
| `_map(array, expression)` | Evaluates expression for every item |
| `_filter(array, expression)` | Keeps items whose expression is truthy |
| `_reduce(array, expression, initial)` | Reduces array with accumulator expression |
| `_chunk(array, size)` | Splits array into positive-sized chunks |
| `_includes(array, value)` | Checks array membership |
| `_if(condition, whenTrue, whenFalse)` | Evaluates selected expression branch |
| `_switch(value, case, result, ..., default)` | Selects result by strict match |

Nested helper expressions are strings:

```typescript
const products = [
  { active: true, quantity: 2, unitPrice: 100 },
  { active: true, quantity: 3, unitPrice: 250 },
  { active: false, quantity: 5, unitPrice: 50 },
]

VarCraft.set('products', products)

const activeTotal = VarCraft.parseExpression(
  '_reduce(_filter(products, "_item_.active"), "_accumulator_ + (_item_.quantity * _item_.unitPrice)", 0)',
)

console.log(activeTotal) // 950
```

Nested helper context provides:

- `_item_`: current array item
- `_index_`: current item index
- `_accumulator_`: current reduce accumulator

## Security Model

VarCraft 2.0 does not execute expression source as JavaScript. It does not use:

- `eval`
- `Function` or `new Function`
- `with`
- Node `vm` as a pretend sandbox
- Raw-source fallback
- Ambient global lookup

Expressions cannot directly access `process`, `globalThis`, constructors, or
prototype chains. Member reads use own properties. Dangerous keys such as
`constructor`, `prototype`, and `__proto__` are denied. Input-data callbacks
cannot be called as expression functions.

This is an expression-language boundary, not process isolation. Registered
callbacks, getters, proxies, and host objects can still execute application
code. Treat those values as trusted capabilities.

## Evaluation Limits

Each evaluation has resource limits to prevent oversized or deeply recursive
expressions:

| Resource | Limit |
| --- | ---: |
| Source length | 16,384 characters |
| Tokens | 4,096 |
| Parser depth | 64 |
| AST nodes | 2,048 |
| Call arguments | 64 |
| Array elements | 1,024 |
| String length | 16,384 characters |
| Nested evaluations | 32 |
| Evaluation entries | 2,048 |
| Interpreter work units | 100,000 |

Limits are safety budgets, not a guarantee that every workload fits. Increase
them only after measuring real expressions and adding boundary tests.

## Version 2.0 Migration

Version 2.0 is a breaking evaluator release. Public state-management methods
remain available, but arbitrary JavaScript expression compatibility is removed.

Expressions that may require migration:

- Object literals and object spread
- Function and member-call optional chaining forms
- Arbitrary member methods; only the restricted `.toString()` conversion is allowed
- Computed property syntax beyond controlled primitive keys
- Member method calls
- Function or arrow expressions
- `new`, `delete`, statements, declarations, and imports
- Ambient globals such as `process` and `globalThis`
- Compound, chained, member, or nested assignments

Replace application-specific behavior with registered helpers through
`setPredefinedVar`. Add compatibility tests before expanding the grammar.

## Development

```bash
pnpm install
pnpm run build
pnpm run format
pnpm run format-check
pnpm run lint-check
pnpm exec jest --runInBand
```

Current project tests cover core expressions, security boundaries, array access,
buying-style helpers, pricing pipelines, nested reductions, assignments, and
short-circuit behavior.

## Design Analysis

See [`TOKENIZER_REFACTOR.md`](./TOKENIZER_REFACTOR.md) for the full architecture,
compatibility analysis, grammar decisions, migration plan, and security review.
