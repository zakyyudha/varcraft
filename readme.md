# VarCraft 2.0

VarCraft is a dependency-free TypeScript expression engine for evaluating
controlled business rules over variables, arrays, objects, and registered
helper functions.

Version 2.0 replaces dynamic JavaScript execution with a hand-written
tokenizer, Pratt parser, and explicit interpreter. Expressions are parsed into
an AST and evaluated by allowlisted rules — they are no longer compiled or run
as JavaScript. See [Migrating from VarCraft 1.x](#migrating-from-varcraft-1x)
before upgrading.

- **Current version:** 2.0.0
- **Runtime:** Node.js `>=12.22.12` (packed `dist`, CommonJS / ES2019)
- **Development / build:** Node.js `>=18` — see [NODE_SUPPORT.md](./NODE_SUPPORT.md)
- **Runtime dependencies:** none

## Installation

```bash
pnpm add @zakyyudha/varcraft
```

## Quick start

The package root default-exports a shared engine instance. The named `VarCraft`
class, the error types, `LIMITS`, and the public types are exported from the same
entry point.

```typescript
import VarCraft, {
  VarCraft as VarCraftClass,
  DeniedOperationError,
  MissinkgNameError,
  LimitError,
  LIMITS,
  type VarCraftOptions,
  type Value,
  type MemberMethod,
} from '@zakyyudha/varcraft'
```

```typescript
import VarCraft from '@zakyyudha/varcraft'

VarCraft.set('price', 100)
VarCraft.set('quantity', 3)

const total = VarCraft.parseExpression('price * quantity')
console.log(total) // 300
```

## Isolated instances

Create a separate engine when state must not be shared with the default
singleton. Built-in helpers are **opt-in** on a new instance: pass
`{ builtins: true }` to install the same ten helpers the singleton has.

```typescript
import { VarCraft } from '@zakyyudha/varcraft'

const engine = new VarCraft({ builtins: true })
engine.set('name', 'VarCraft')

console.log(engine.evaluate('name')) // VarCraft
```

A `new VarCraft()` with no options has **no** built-in helpers; `_sum`, `_map`,
and the rest throw `MissingNameError` until registered.

### `reset()` vs `clear()`

| Method | Effect |
| --- | --- |
| `clear()` | Legacy behavior. Removes **stored** variables only. Predefined variables, member methods, and built-ins are preserved. |
| `reset()` | Restores the engine to its configured baseline: clears stored variables, predefined variables, and member methods, then reinstalls built-ins **only if the instance was constructed with `{ builtins: true }`**. |

```typescript
const engine = new VarCraft({ builtins: true })

engine.setPredefinedVar('custom', () => 7)
engine.setMemberMethod('custom', () => 'custom')

engine.reset()

engine.evaluate('_sum([1, 2, 3])') // 6 — built-ins restored
engine.evaluate('"seed".custom()') // throws DeniedOperationError
```

## API

### `set(name, value)`

Stores a value for later expressions. Registering a function is an explicit
host grant that makes it callable from expressions.

```typescript
VarCraft.set('customer', { name: 'Ari', active: true })
VarCraft.parseExpression('customer.active') // true
```

### `setPredefinedVar(name, value)`

Registers a predefined value or callable helper. Registered callbacks run as
**trusted host code** (see [Security model](#security-model)).

```typescript
VarCraft.setPredefinedVar('_discount', (price: number) => price * 0.9)
VarCraft.parseExpression('_discount(100)') // 90
```

### `setMemberMethod(name, method)`

Registers an allowlisted implementation for controlled member-call syntax
`target.name(...)`. The interpreter never dispatches arbitrary object methods.

```typescript
VarCraft.setMemberMethod('upper', (target, args) => {
  if (args.length !== 0 || typeof target !== 'string') {
    throw new TypeError('upper expects string target')
  }
  return target.toUpperCase()
})

VarCraft.parseExpression('"ari".upper()') // ARI
```

Unregistered member methods are rejected (`DeniedOperationError`). The only
method registered by default is the restricted zero-argument `toString()`
described under [Member calls](#member-calls-tostring).

### `get(name)`

Reads stored variables first, then predefined variables. Missing names throw
`MissingNameError`.

```typescript
VarCraft.get('customer')
```

### `setEnableLogging(enableLogging)` and `setLogger(logger)`

Diagnostics are **off by default** and never write to the console. Events are
emitted only when logging is enabled *and* a logger is registered. Events carry
metadata (event code, source length, error name, numeric offset, result type) —
never expression source text or evaluated values.

```typescript
import { VarCraft } from '@zakyyudha/varcraft'

const engine = new VarCraft()
const events: { code: string }[] = []

engine.setEnableLogging(true)
engine.setLogger((event) => events.push(event))

engine.parseExpression('1 + 2')
events.map((event) => event.code) // ['parse-expression', 'expression-result']
```

Pass `setLogger(undefined)` to remove the sink.

### `parseExpression(expression, data?)` and `evaluate(expression, data?)`

Both evaluate a restricted expression and share the same evaluation path;
`parseExpression` additionally emits diagnostic events around it. The optional
`data` object supplies temporary top-level bindings for that single evaluation.

```typescript
VarCraft.parseExpression('amount * (100 + taxPercent) / 100', {
  amount: 100,
  taxPercent: 10,
}) // 110
```

## Expression language

Supported syntax:

- Number, string, boolean, `null`, and `undefined` literals
- Array literals: `[1, 2, 3]`
- Identifiers
- Dot member reads on own properties: `customer.profile.name`
- Bracket member reads: `items[0]`, `items[index]`
- Optional member reads: `customer?.profile?.name`, `items?.[0]?.name`
- Unary operators: `!`, `+`, `-`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparisons: `<`, `<=`, `>`, `>=`
- Equality: `==`, `!=`, `===`, `!==`
- Logical operators: `&&`, `||` (short-circuit)
- Ternary conditionals: `condition ? whenTrue : whenFalse`
- Calls to registered helpers
- Member calls to registered member methods
- Top-level identifier assignment: `total = price * quantity`

```typescript
VarCraft.parseExpression('items[0].price')
VarCraft.parseExpression('quantity > 0 && active')
VarCraft.parseExpression('score >= 90 ? "approved" : "review"')
VarCraft.parseExpression('total = price * quantity')
```

Assignment returns its value and persists it as a stored variable. Assignment is
limited to a single top-level identifier; member, compound, chained, and nested
assignments are rejected.

### Optional chaining is continuous

An optional access guards the rest of its unbroken dot/bracket chain. A chain
that hits a nullish value short-circuits to `undefined`; a non-optional access
inside the chain throws if it meets a nullish value.

```typescript
engine.evaluate('customer?.profile.name', { customer: null }) // undefined
engine.evaluate('(customer?.profile).name', { customer: null }) // throws
```

Grouping with parentheses ends the guard, so `(customer?.profile).name`
performs an ordinary access on the grouped result and throws when it is nullish.

### Member calls (`toString`)

A `target.name(args)` call is allowed only when `name` was registered with
`setMemberMethod`. The default registry contains a single restricted method:

- `toString()` — zero arguments only.
- Primitive targets (`string`, `number`, `boolean`, `null`, `undefined`) convert
  with `String(target)`.
- Array targets are serialized from own-index **primitive or nullish** elements
  only, joining with `,` (nullish slots become empty segments, matching
  `Array.prototype.join(',')`). Nested objects/arrays are denied.
- Object targets, custom `toString`/`Symbol.toPrimitive` hooks, and arguments
  are all rejected — no host conversion hook is invoked.

```typescript
engine.evaluate('"ari".toString()') // 'ari'
engine.evaluate('n.toString()') // '42'
engine.evaluate('parts.toString()') // 'Ari,Bima,' for ['Ari','Bima',undefined]
engine.evaluate('obj.toString()') // throws DeniedOperationError
```

## Built-in helpers

The default singleton — and any instance created with `{ builtins: true }` —
registers these helpers:

| Helper | Purpose |
| --- | --- |
| `_sum(array)` | Adds numeric array values |
| `_map(array, expression)` | Evaluates `expression` for every item |
| `_filter(array, expression)` | Keeps items whose `expression` is truthy |
| `_reduce(array, expression, initial)` | Reduces array with an accumulator expression |
| `_chunk(array, size)` | Splits array into positive-integer-sized chunks |
| `_includes(array, value)` | Checks array membership |
| `_when(condition, whenTrue, whenFalse)` | Lazy conditional (recommended) |
| `_case(subject, case, result, ..., default)` | Lazy switch (recommended) |
| `_if(condition, whenTrue, whenFalse)` | Deprecated string-based conditional |
| `_switch(value, case, result, ..., default)` | Deprecated string-based switch |

`_map`, `_filter`, and `_reduce` take their per-item expression as a **string**
that is parsed for each item:

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

### Nested scope inheritance

A nested helper expression runs in a scope derived from the **outer**
evaluation. It inherits the outer `data`, stored variables, and predefined
variables, and overlays the reserved names:

- `_item_` — current array item
- `_index_` — current item index
- `_accumulator_` — current reduce accumulator

The reserved names win over an inherited data binding of the same name.
Inheritance is **shallow**: inherited objects and arrays are shared by
reference, not deep-cloned. Lookup precedence is
`set/get/clear > predefined > stored > data`.

```typescript
engine.evaluate('_map(items, "_item_.price * rate")', {
  items: [{ price: 2 }, { price: 3 }],
  rate: 10,
}) // [20, 30]
```

### Lazy conditionals: `_when` and `_case`

`_when`/`_case` take **ordinary expressions** as arguments, evaluated on demand
in argument order. The selected branch runs once; the unselected branch never
runs; a `_case` default runs only when no case matches.

```typescript
engine.evaluate('_when(score >= 90, "approved", "review")', { score: 95 })
// 'approved'

engine.evaluate('_case(status, "approved", "A", "pending", "P", "other")', {
  status: 'approved',
}) // 'A'
```

`_case` matches **raw values** (no string escaping). The final argument is the
default; the argument count must be odd.

### Deprecated: `_if` and `_switch`

`_if`/`_switch` are retained through 2.x for compatibility and are **eager and
stringly**: their branch/case arguments are evaluated eagerly as values, converted
to text, and reparsed, so a string literal inside a branch is written with the
historic double-quote convention (`'"two"'`). Prefer `_when`/`_case` for new
expressions.

```typescript
engine.evaluate(
  `_switch('"approved"', '"approved"', 'project.approvals[0].members[0].name', '"other"')`,
) // 'Ari'
```

## Security model

VarCraft 2.0 parses and interprets expressions; it never evaluates them as
JavaScript. It does not use `eval`, `Function`/`new Function`, `with`, or Node
`vm`, and it has no raw-source fallback. Expression lookup is limited to
registered/stored/predefined/data layers and never reaches ambient globals:
`process`, `globalThis`, constructors, and prototype chains are unreachable.

Member reads use **own** properties only, and dangerous keys (`constructor`,
`prototype`, `__proto__`) are denied in lookup and in every registration API.

**Callback provenance.** A function supplied through evaluation `data` is not
callable from expressions. Expression-level `set` and top-level assignment store
it as a value but do **not** grant callability — only the host APIs (`set`,
`setPredefinedVar`, `setMemberMethod`) grant it. This prevents an untrusted data
payload from being promoted into a trusted callback.

```typescript
const engine = new VarCraft()
const callback = () => 'called'

engine.evaluate('callback()', { callback }) // throws DeniedOperationError
engine.evaluate('saved = callback', { callback }) // stores the value
engine.evaluate('saved()') // still throws — not promoted
engine.set('granted', callback)
engine.evaluate('granted()') // 'called' — explicit host grant
```

This is an **expression-language boundary, not process isolation**. Registered
callbacks, getters, proxies, and host objects can still execute application
code. Treat registered callbacks and object values as trusted capabilities, and
do not expose secrets, filesystem, or network access to untrusted expression
authors.

See [SECURITY.md](./SECURITY.md) for the full threat model.

## Evaluation limits

Every evaluation runs under a shared resource budget. Exceeding any limit throws
`LimitError` (a `RangeError` subclass) carrying the offending `resource`. The
`LIMITS` object is exported from the package root.

| Resource | Limit |
| --- | ---: |
| `source` | 16,384 characters |
| `tokens` | 4,096 |
| `depth` (parser nesting) | 64 |
| `nodes` (AST nodes) | 2,048 |
| `args` (call arguments) | 64 |
| `array` (array elements) | 1,024 |
| `string` | 16,384 characters |
| `keys` (object keys snapshotted) | 1,024 |
| `evaluations` | 2,048 |
| `nesting` | 32 |
| `work` (interpreter work units) | 100,000 |

```typescript
import { LIMITS, LimitError } from '@zakyyudha/varcraft'

LIMITS.keys // 1024
```

All nested evaluations — helper re-entry, array-spread scope construction, and
object snapshots — debit the **same** shared counters for the whole synchronous
call tree, and the budget is discarded when the outermost call returns.

The budget bounds VarCraft's own interpreter and helper work. It does **not**
bound the CPU a trusted host callback burns inside its own body — a registered
callback can loop or allocate arbitrarily. Treat registered callbacks as trusted
capabilities, not as sandboxed work.

## Migrating from VarCraft 1.x

VarCraft 1.x compiled expression text with `new Function` and executed it inside
`with (this)`. Expressions were therefore arbitrary JavaScript: they reached
ambient globals and prototype chains, and could build constructors and run
statements. VarCraft 2.0 is a breaking evaluator release. It keeps the public
state-management API shape but evaluates only the documented expression grammar.

What 1.x allowed and 2.0 rejects:

- Object literals and object spread
- Function and arrow expressions
- Member and member-call optional chaining forms
- **Arbitrary member method calls.** A `target.method()` call now requires an
  explicit `setMemberMethod` registration; the only built-in method is the
  restricted zero-argument `toString()` described above.
- Computed property syntax beyond primitive string/number keys
- `new`, `delete`, statements, declarations, and imports
- Ambient globals such as `process` and `globalThis`
- Compound, chained, member, and nested assignments

Other behavior changes to account for:

- **Exports.** The named `VarCraft` class, `DeniedOperationError`,
  `MissingNameError`, `LimitError`, and `LIMITS` are now available from the
  package root (1.x exposed only the default singleton at the root).
- **Built-ins are opt-in** on isolated instances: `new VarCraft({ builtins: true })`.
- **`clear()` is variables-only**; `reset()` restores the full configured baseline.
- **Logging** no longer writes to the console or recurses. Use `setEnableLogging`
  plus `setLogger`; nothing is emitted without a registered logger.
- **`_when`/`_case`** are the lazy, AST-native conditionals. `_if`/`_switch`
  remain as deprecated string-based shims.

Replace application-specific behavior with registered helpers via
`setPredefinedVar` or `setMemberMethod`. Add compatibility tests before expanding
the grammar.

See [CHANGELOG.md](./CHANGELOG.md) for the release summary.

## Development

```bash
pnpm install
pnpm run verify          # biome check, build, test typecheck, jest
pnpm run check           # biome: format + lint + import organization (read-only)
pnpm run check:write     # apply formatting and organize imports
pnpm run format
pnpm run lint-check
pnpm exec jest --runInBand
pnpm run pack:smoke      # pack + consumer smoke against the tarball
```

- Node support matrix: [NODE_SUPPORT.md](./NODE_SUPPORT.md)
- Performance measurements and decisions: [PERFORMANCE.md](./PERFORMANCE.md)
- Release history: [CHANGELOG.md](./CHANGELOG.md)
- Security policy: [SECURITY.md](./SECURITY.md)
- License: [LICENSE](./LICENSE)

## License

MIT — see [LICENSE](./LICENSE).
