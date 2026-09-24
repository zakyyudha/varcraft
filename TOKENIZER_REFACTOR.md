# VarCraft Tokenizer Refactor Analysis

## Purpose and evidence labels

This document captures current VarCraft behavior and proposes a tokenizer, Pratt parser, and allowlisted interpreter. It is analysis only. Source refactor stays out of scope until review.

Primary goal: preserve documented and tested calls, especially nested quoted expression conventions. Removing ambient JavaScript access is an intentional security boundary change, not a claim of strict compatibility with every historical JavaScript expression.

| Label | Meaning |
| --- | --- |
| **Test-asserted, not run** | Encoded by repository tests. Dependencies are absent, so tests were not executed. |
| **Runtime-probed** | Observed in the supplied harmless Node probe. No malicious arbitrary JavaScript samples ran. |
| **Source-inferred** | Directly supported by current TypeScript and language semantics. |
| **Proposed** | Recommended future behavior. |
| **Unknown** | Not established by source, tests, or probe. |

## Executive findings

1. `evaluate` compiles expression text with `new Function` and executes `with(this) { return ${expression}; }`. Current expressions are arbitrary JavaScript, not a sandboxed language.
2. Default export is one process-wide singleton from `src/index.ts`. `src/varcraft.ts` exports reusable class `VarCraft`.
3. Eight predefined helpers are registered. `_map`, `_filter`, `_reduce`, `_if`, and `_switch` re-enter `parseExpression` directly or indirectly.
4. Expression lookup is predefined > stored > input data, then bound `set`, `get`, and `clear` override all three. Direct `get` is stored > predefined.
5. Assignment is detected after evaluation with `/^\s*([^=]+)\s*=\s*([^;]+)\s*$/`. Refactoring should preserve intended top-level `identifier = expression` persistence with an AST assignment node, while rejecting compound, member, chained, and nested assignments unless approved. Regex misclassification and generated-JavaScript global leakage are defects, not behavior to preserve.
6. `log` calls itself recursively when enabled. `_chunk` accepts zero or negative sizes that can fail to terminate; `NaN` performs at most one iteration, then makes `i` `NaN` and the loop condition fails.
7. Tokenization alone does not eliminate code execution. Safety requires full AST validation and an explicit interpreter with no `eval`, `Function`, `with`, or arbitrary member dispatch.
8. Preserve public function and object values for `set` and `setPredefinedVar`. Use strict internal types instead of narrowing public `Value` now.
9. Approval remains needed for syntax beyond the corpus, functions and member methods, assignment, coercion, limits, reserved keys, and release policy.

## 1. Current architecture

### Package and build facts

| Fact | Evidence |
| --- | --- |
| Package | `@zakyyudha/varcraft` |
| Version | `1.0.1`, `package.json:3` |
| Lock root | `1.0.0`, supplied project evidence; lockfile was not otherwise inspected |
| Runtime dependencies | None. `package.json:35-40` contains development dependencies only. |
| Build and tests | `tsc`, `jest`, `package.json:7-18` |
| Target and module | ES2019 and CommonJS, `tsconfig.json:3-4` |
| Declarations | Enabled, `tsconfig.json:12` |
| Node support | `>=10.0.0`, `package.json:45-47` |
| Source | `src/**/*.ts`, `tsconfig.json:14` |

Node >=10 means internal code cannot assume `Object.hasOwn`. Use `Object.prototype.hasOwnProperty.call(value, key)` or an equivalent compatible helper.

README calls the package “A versatile variable handling library for JavaScript and TypeScript” and documents singleton `set` and `get` usage. No persistence or serialized format was found. State is in memory only. Downstream usage is unknown.

### Exports and singleton

`src/varcraft.ts` exports named class `VarCraft`. `src/index.ts` imports it as `Parser`, constructs one instance at module load, registers eight helpers, and default-exports that instance.

```typescript
import VarCraft from '@zakyyudha/varcraft'

VarCraft.set('x', 42)
VarCraft.get('x')
```

A separate instance is possible through the named class source export:

```typescript
import { VarCraft } from './varcraft'

const instance = new VarCraft()
```

The current package root does not expose the named class: `src/index.ts` only default-exports the singleton, while `package.json` points `main` and `types` to `dist/index` and publishes only `dist`. A direct source import can access `VarCraft`, but that is outside the documented package-root contract, and the dist-only published package likely prevents installed consumers from using a `src` subpath. Preserve class identity and singleton identity. Do not replace either with a per-call factory.

### Public methods and value types

Current public methods:

| Method | Current behavior | Refactor target |
| --- | --- | --- |
| `setEnableLogging(boolean)` | Stores flag; enabled path recurses through `log`. | Preserve method. Fix output only after decision. |
| `parseExpression(expression, data?)` | Logs, calls `evaluate`, logs result. | Route to tokenizer, parser, interpreter. |
| `evaluate(expression, data?)` | Builds context, executes dynamic JS, then assignment post-pass. | Preserve method name; define assignment grammar. |
| `set(name, value)` | Stores value. | Preserve. |
| `setPredefinedVar(name, value)` | Stores predefined value or callback. | Preserve public acceptance. |
| `get(name)` | Stored first, predefined second; exact not-found error. | Preserve order and error. |
| `clear()` | Replaces stored map; predefined values remain. | Preserve. |

Current internal `Value` accepts `number`, `string`, `boolean`, `object`, `any[]`, and recursive callbacks `(data: any, ...args: any[]) => Value`. Public setters therefore accept function and object values at runtime and in source types. Tightening them is a breaking change. Keep public `Value` compatibility and define strict internal token, AST, and runtime unions.

### Context and precedence

`createContext(data)` builds a fresh shallow object in this order:

1. `...data || {}`
2. `...this.variables`
3. `...this.predefinedVariables`
4. bound `set`, `get`, and `clear`

Source-inferred expression lookup is:

```text
set/get/clear > predefined > stored > data > ambient JavaScript
```

Direct `get` is different:

```text
stored > predefined > throw
```

`data` is not automatically bound as a `data` property. A caller can supply one, as the `_switch` test does. Do not silently fix this interface mismatch.

Spreads copy top-level bindings only. Arrays and objects remain aliases. Getters and proxies can run during spread or property access. Custom `valueOf`, `toString`, `Symbol.toPrimitive`, and callbacks can execute host code. A restricted expression grammar cannot sandbox those host values.

### State lifecycle

The default singleton shares stored state across imports. Tests call `clear` after each case. `clear` removes variables but leaves predefined helpers. Independent class instances have separate maps. Preserve all of this initially.

## 2. Eight helpers and nested flows

All helpers are ordinary host callbacks. The current JavaScript evaluator eagerly evaluates every outer call argument before entering a helper. Nested string expressions then call the singleton's `parseExpression`, rebuilding context and executing another dynamic expression.

### `_sum`

Source: `src/index.ts:4-8`.

Flow: outer expression resolves `_sum`, evaluates `arr`, callback calls `arr.reduce`, each step uses JavaScript `+`. Empty arrays return `0`; mixed values follow native coercion, including string concatenation. Non-array behavior is not fully test-asserted.

Proposed initial behavior: preserve native addition for supported arrays, reject non-arrays, and make numeric versus string coercion an approval decision.

### `_map`

Source: `src/index.ts:10-18`.

Flow:

1. Outer call eagerly evaluates `arr` and expression string.
2. `arr.map` invokes each item callback.
3. Each iteration creates `{ ...arr, _item_: item, _index_: index }`.
4. It calls singleton `parseExpression(expression, context)`.
5. Nested parse rebuilds context again.

The spread is array spread, not caller data and not the original array object. It creates numeric properties plus `_item_` and `_index_`. Preserve this exact behavior initially. Tested call: `_map([1, 2, 3], "_item_ + 1")` returns `[2, 3, 4]`.

### `_filter`

Source: `src/index.ts:20-28`.

Flow matches `_map`: eager outer arguments, `arr.filter`, array spread context per item, `_item_` and `_index_`, nested `parseExpression`, then native filter truthiness. Tested call `_filter([1, 2, 3], "_item_ > 1")` returns `[2, 3]`. Preserve array spread and rebuild timing.

### `_reduce`

Source: `src/index.ts:30-39`.

Flow:

1. Outer call evaluates all arguments.
2. Before reduction, `initialValue` is reparsed with `parseExpression(initialValue)`.
3. Each iteration rebuilds `{ ...arr, _item_: currentValue, _index_: index, _accumulator_: accumulator }`.
4. Reduction expression is reparsed each iteration.
5. Native reduce receives the returned accumulator.

Numeric initial `0` is reparsed as expression text. This is tested and must not become direct value use without approval. Helper always supplies an initial value and does not use native no-initial-value behavior.

### `_chunk`

Source: `src/index.ts:41-47`.

Flow: eager `arr` and `size`, loop from zero, push `arr.slice(i, i + size)`, increment by `size`. Positive integer behavior is tested: `_chunk([1, 2, 3, 4, 5], 2)` returns `[[1, 2], [3, 4], [5]]`.

Defect: zero does not advance and negative values move away from termination for non-empty arrays. With `NaN`, the first iteration may run, then `i` becomes `NaN` and `i < arr.length` fails, so it is not non-terminating. Zero and negative sizes are a denial of service risk for untrusted values. Future code should require finite positive integers and a bound, but exact limits need approval.

### `_includes`

Source: `src/index.ts:49-51`.

Flow: eager arguments, then native `arr.includes(value)`. Equality is SameValueZero. Tested `_includes(arr, 2)` with `[1, 2, 3]` returns `true`. Preserve unless an approved interpreter comparison policy changes it.

### `_if`

Source: `src/index.ts:53-60`.

Outer call evaluates condition, true argument, and false argument before helper entry. Helper then reparses condition, reparses only selected branch, and returns it. This is not a truly lazy function call. Direct branch expressions can execute during outer argument evaluation; quoted branch strings are reparsed only when selected.

Tested call `_if(x > y, true, false)` returns `true`. Preserve eager outer evaluation and selected branch reparse initially. Making `_if` a lazy special form is a behavior change.

### `_switch`

Source: `src/index.ts:62-77`.

The last `cases` item is always `defaultCase`. An even `cases.length` throws exactly `switch case should have default case`. For odd case lists:

1. Outer JavaScript eagerly evaluates `value` and every case argument.
2. Helper reparses default first, even if an earlier case later matches.
3. Helper reparses `value`.
4. It reparses even indexes as case expressions.
5. First strict equality match reparses and returns the following result.
6. If no ordinary pair matches, the loop still tests the final default slot because its condition is `i < cases.length`. If `valueExpression === parsed default`, it parses `cases[i + 1]` (which is `undefined`) and returns that result instead of `defaultCaseValue`.
7. Otherwise, it returns already-reparsed default.

Known test:

```text
_switch(x, 1, data.y, 2, '"two"' , '"other"')
```

With `x: 1` and `data: { y: 1 }`, result is `1`. The single-quoted outer strings contain double-quoted nested expression literals. Preserve this quoted convention and default-first behavior.

## 3. Test inventory

`test/varcraft.test.ts` has 13 cases. They use default singleton and `clear` after each test. All are **test-asserted, not run**.

| # | Case | Asserted result |
| --- | --- | --- |
| 1 | String literal | `parseExpression('"hello"')` equals `'hello'` |
| 2 | Set/get | `set('x', 42)`, then `get('x')` equals `42` |
| 3 | Clear | Missing `y` throws `Variable or function y not found` |
| 4 | Arithmetic | Stored `a=10`, `b=20`; `a + b` equals `30` |
| 5 | `_sum` | `[1,2,3]` equals `6` |
| 6 | `_map` | `_item_ + 1` equals `[2,3,4]` |
| 7 | `_filter` | `_item_ > 1` equals `[2,3]` |
| 8 | `_reduce` | accumulator plus item, initial `0`, equals `6` |
| 9 | `_chunk` | five values, size `2`, equals `[[1,2],[3,4],[5]]` |
| 10 | `_includes` | array includes `2`, equals `true` |
| 11 | Ternary | `(x > y) ? true : false` equals `true` |
| 12 | `_if` | `_if(x > y, true, false)` equals `true` |
| 13 | `_switch` | exact nested quoted expression returns `1` |

Missing coverage: invalid types, missing expression names, collisions, assignments, all operators, escapes, nested parentheses and helpers, custom callbacks, objects, member access, logging, parser errors, limits, and singleton isolation. Gaps do not prove behavior is unused.

## 4. Defects and evidence

### Dynamic code execution

`src/varcraft.ts:54-62` constructs function source from input and calls it. `with` changes lookup but does not sandbox. The harmless Node v22.22.0 probe returned:

```text
2 + 3 * 4       => 14
typeof process  => object
({}).constructor === Object => true
```

This is **runtime-probed** evidence of ambient global and constructor reachability. No malicious samples or secrets were read.

### Ambient and inherited lookup

`with(this)` allows unresolved names to reach outer scope, including globals. Object values expose inherited properties. `get` uses `name in this.variables` and `name in this.predefinedVariables`, so prototypes participate. A future interpreter must use explicit own-property lookup and never consult global scope.

### Assignment regex

The expression is evaluated before the regex at `src/varcraft.ts:63-69` runs. The pattern is not a grammar and can misclassify `a == b`, `a >= b`, `a += b`, quoted `=`, or nested syntax. Intended top-level `identifier = expression` persistence should be preserved through an explicit AST assignment node, not this regex. Compound, member, chained, and nested assignments should be rejected unless approved. Storing under a textual left-hand side and allowing generated JavaScript to create or modify ambient globals are defects, not compatibility requirements. Add characterization tests before migration decisions.

### Recursive logging

`src/varcraft.ts:27-31` calls `this.log(message)` from inside `log` whenever logging is enabled. It therefore recurses until stack overflow. Logging output, sink, and privacy behavior need a decision. Do not silently introduce output while refactoring the parser.

### `_chunk` denial of service

`src/index.ts:41-45` lacks size validation. Zero and negative sizes can fail to terminate for non-empty arrays; `NaN` is different: after at most one iteration, `i` becomes `NaN` and the loop condition fails. Reject invalid size and apply iteration and output bounds in future code. Exact bound is open.

### `_switch` default-slot edge defect

Source-inferred from `src/index.ts:71-75`: the loop condition is `i < cases.length`, so an odd list's final default slot is tested as a case candidate after ordinary pairs fail. When `valueExpression === VarCraft.parseExpression(defaultCase)`, the helper evaluates `cases[i + 1]`, which is `undefined`, and returns that result instead of the previously computed `defaultCaseValue`. This edge is not covered by current tests and must not be described as runtime-verified.

### Re-entry and host execution

Nested helper reparsing is unbounded today. Getters, proxies, aliases, callbacks, and custom coercion hooks remain executable host behavior even after syntax restriction. A parser controls expression text, not arbitrary values or callback bodies.

## 5. Compatibility matrix

| Surface | Current | Recommended initial target | Status |
| --- | --- | --- | --- |
| Default import | Module singleton | Preserve singleton and helper registration | Proposed |
| `new VarCraft()` | Independent maps | Preserve | Proposed |
| `set/get/clear` | In-memory API | Preserve names and tested error | Proposed |
| `setPredefinedVar` | Objects and callbacks accepted | Preserve public types; apply call policy | Proposed |
| `parseExpression/evaluate` | Arbitrary JavaScript | Approved AST subset only | Intentional change |
| Expression precedence | predefined > stored > data; API methods highest | Preserve initially | Proposed |
| Direct `get` | stored > predefined | Preserve | Proposed |
| Context | shallow top-level snapshot, live aliases | Preserve initially | Approval needed for alternatives |
| Nested strings | JavaScript string contains expression text | Preserve quote and escape conventions | Required |
| `_map`, `_filter` | array spread and rebuilt context | Preserve exactly | Required |
| `_reduce` | reparses numeric initial | Preserve initially | Required |
| `_if` | eager outer, selected branch reparse | Preserve initially | Required |
| `_switch` | odd list, default last, default parsed first, strict match | Preserve exactly initially | Required |
| Assignment | permissive regex after evaluation; intended top-level persistence exists | Preserve top-level `identifier = expression` via AST node; reject compound/member/chained/nested forms unless approved | Exact grammar approval needed |
| Ambient globals | Reachable | Remove | Intentional security break |
| Inherited access | Reachable | Remove from lookup | Intentional security break |
| Member methods | Arbitrary JavaScript | Reject or explicit allowlist | Approval needed |
| Persistence | None found | Add none | Preserve absence |
| AST cache | None | Defer until measured | Proposed |

The recommendation is API-compatible for class and singleton methods, not compatible with all prior JavaScript behavior.

## 6. Alternatives

### Hand-written tokenizer, Pratt parser, interpreter

Best fit. No runtime dependency, small auditable boundary, exact syntax and limit control, full validation before effects, and explicit nested expression handling. Cost is implementing token rules, diagnostics, precedence, coercion, and tests. **Recommended.**

### jsep

jsep is an expression parser with operator extension points. It could reduce parser work, but adds a runtime dependency and still needs a strict validator and interpreter. Its AST and accepted syntax become migration surface. It does not sandbox execution.

Source: <https://github.com/EricSmekens/jsep>

### Acorn

Acorn provides mature full JavaScript parsing and diagnostics. Its grammar is much wider than the desired subset. A validator would still reject most nodes, and a separate interpreter remains required. It adds dependency and upgrade surface. Useful for deliberate JavaScript tooling, not first secure interpreter.

Source: <https://github.com/acornjs/acorn>

### Babel parser

Babel parser supports broad JavaScript and extensions. That scope invites accidental language expansion and adds dependency complexity. It is suitable only if a future requirement explicitly needs Babel syntax plus a separate allowlist. It does not make execution safe.

Source: <https://babeljs.io/docs/babel-parser>

### Node `vm`

`vm` is not a safe replacement for `new Function` or a hostile-code sandbox. It retains arbitrary JavaScript and version-dependent escape concerns. Do not use it as interpreter or security claim.

Source: <https://nodejs.org/api/vm.html>

## 7. Recommended tokenizer and Pratt parser

### Pipeline

```text
expression text -> tokenizer -> token stream -> Pratt parser
  -> full AST validation -> explicit interpreter -> Value
```

No stage may use `eval`, `Function`, `new Function`, `with`, or raw-source fallback. Parser must consume EOF and reject trailing input.

### Token rules

Initial proposed tokens:

| Token | Proposed rule |
| --- | --- |
| number | Decimal finite numbers; exponent, leading dot, and other forms require approval |
| string | Single or double quote, explicit escapes, decoded string value |
| identifier | Documented identifier grammar, resolved later |
| `true`, `false`, `null` | Literal keywords |
| punctuation | `(`, `)`, `[`, `]`, `,`, `.`, `?`, `:` |
| unary operators | `!`, unary `+`, unary `-` |
| binary operators | `+`, `-`, `*`, `/`, `%`, approved comparisons, equality, logical operators |
| assignment | `=` only for approved top-level `identifier = expression` form |
| EOF | Required end marker |

Reject initially: semicolons, blocks, declarations, function and arrow expressions, `new`, `delete`, optional chaining, computed members, compound/member/chained/nested assignment, update operators, templates, regex literals, tagged templates, `await`, `yield`, and statements. Preserve top-level `identifier = expression` through an explicit assignment token and AST node, subject to exact grammar approval.

String decoding is required for nested helper calls. Unterminated strings and invalid escapes must become bounded parser errors. Numeric policy for `NaN`, `Infinity`, hexadecimal, separators, and exponents is open. Tokenizer must not perform name lookup.

### Precedence

A Pratt parser handles prefix, infix, postfix, calls, member access, assignment, and ternary through binding powers. Member access and calls form a postfix chain parsed left-to-right: `f().x` calls `f` then reads `x`, while `obj.f()` reads `f` then calls it. They are not separate simplistic priorities. Proposed precedence, highest first:

1. Literals, identifiers, arrays, and parentheses.
2. Postfix member and call chains, parsed left-to-right.
3. Exponentiation, if approved, above unary on the right-hand side and right-associative.
4. Prefix `!`, unary `+`, unary `-`, subject to the JavaScript restriction that an unparenthesized unary left operand such as `-2 ** 2` is rejected.
5. `*`, `/`, `%`, left-associative.
6. `+`, `-`, left-associative.
7. `<`, `<=`, `>`, `>=`, left-associative for the approved grammar.
8. `==`, `!=`, `===`, `!==`, subject to coercion policy and left-associative parsing.
9. `&&`, left-associative.
10. `||` and `??`, sharing JavaScript precedence and each left-associative; unparenthesized mixing of `??` with `&&` or `||` is rejected.
11. Conditional `? :`, right-associative.
12. Top-level `identifier = expression`, if approved, with no compound, member, chained, or nested assignment.

Arithmetic operators are left-associative except exponentiation. Binding precedence does not change left-to-right evaluation of operands and call arguments. The tested ternary requires conditional parsing. Do not copy the entire JavaScript precedence table without approval. Reference: <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence>.

### AST and full validation

Minimal nodes: `Literal`, `Identifier`, `ArrayLiteral`, `Unary`, `Binary`, `Conditional`, `Call`, `Member`, and an approved top-level `Assignment` node. The assignment node persists only a validated identifier result; it cannot represent compound, member, chained, or nested assignment. No generic raw-JavaScript node.

Attach source offsets for diagnostics. Bound token count, source length, nesting, AST nodes, array elements, call arguments, and string length before interpretation.

Parse and validate the complete AST before effects. Unsupported syntax in a skipped branch must still reject. After validation, valid logical and conditional branches may short-circuit. A missing name in a skipped valid branch need not throw; a missing name in an evaluated branch throws at runtime.

## 8. Lookup, state, calls, and coercion

### Lookup

Use explicit layers:

```text
predefined -> stored -> input data -> missing
```

Bind `set`, `get`, and `clear` explicitly at highest expression precedence if preserving collisions. Never inspect `globalThis`, lexical scope, prototypes, or inherited properties. Direct API `get` remains stored then predefined and never reads input data.

Use null-prototype records or `Map`, and compatible own checks:

```typescript
Object.prototype.hasOwnProperty.call(record, name)
```

### Snapshot and aliases

Current parse starts with shallow top-level snapshot. Referenced objects and arrays remain aliases. Proposed initial interpreter snapshots binding references at entry while preserving aliases. Live binding changes during evaluation would be a behavior change. Do not deep clone silently.

Nested `_map` and `_filter` must rebuild context from array spread each iteration. A future parse-once nested string optimization may reuse AST, but not context timing, aliases, or lookup timing.

### Calls and receiver

Recommended call policy:

1. Resolve registered predefined functions, explicitly allowed stored functions, or internal helper entries only.
2. Never resolve global functions.
3. Reject arbitrary member method calls initially unless allowlisted.
4. Treat host callbacks as unsandboxed host code.
5. Keep positional arguments; do not inject `data` because callback type names its first parameter `data`.
6. Preserve bare-call receiver intent by testing whether callbacks receive current context as `this`; source suggests this through `with(this)`, but it is not yet runtime-verified.

Public callback signature does not prove an implicit data argument contract.

### Members and property safety

Dot member reads are required for zero-breakage support of the existing `data.y` expression in `_switch`; they are not optional for the current corpus. Recommended initial policy: allow own dot access only on approved values, reject `__proto__`, `prototype`, and `constructor`, reject computed access, reject arbitrary member calls, and decide whether arrays expose only indexes and `length`. Computed access and member-call expansions remain approval-dependent.

### Coercion

Current behavior inherits JavaScript coercion. `_sum` uses `+`, `_includes` uses SameValueZero, and `_switch` uses strict equality. Recommended interpreter behavior defines coercion per operator, limits values to primitives where possible, treats objects as opaque, and avoids implicit custom conversion. Full JavaScript coercion improves compatibility but can execute custom conversion hooks. Approval required.

### Assignment

Recommended initial policy: preserve intended top-level `identifier = expression` persistence through an explicit AST assignment node, replacing the regex post-pass. Evaluate and validate the right-hand expression, then persist the result under the identifier after successful evaluation. Reject compound, member, chained, and nested assignments unless approved. Exact identifier grammar, whether assignment may appear only as the complete top-level expression, and reserved-name checks remain approval decisions. Regex misclassification, textual left-hand-side keys, and ambient global leakage are defects, not compatibility requirements.

### Error compatibility

Preserve exact direct-API missing-name error `Variable or function ${name} not found`. Distinguish syntax errors, runtime name errors, denied operations, and resource-limit failures; throw errors rather than returning `null` as a fallback. Engine-specific `SyntaxError` messages are not stable compatibility strings. Current `console.error` is unconditional on evaluation failure, and interpolating results or errors in logging strings can invoke coercion even when the logging flag is false; output, coercion side effects, and diagnostic privacy require an explicit decision.

## 9. Security model

Expression text may be untrusted. Application authors control setters and callbacks. Data may contain objects, arrays, getters, proxies, or aliases.

Required prohibitions:

- `eval`, `Function`, and `new Function`.
- `with`.
- `vm` as claimed sandbox.
- Global or lexical fallback.
- Generic member method dispatch.
- Raw source fallback.

Host callbacks and values are not sandboxed. A getter, proxy trap, custom coercion hook, or registered callback can execute arbitrary host behavior. A stricter primitive-only API would be a separate breaking migration because current setters accept objects and functions.

Use null-prototype maps or `Map`; own-property checks only. Reserve `__proto__`, `prototype`, and `constructor` in lookup and, subject to approval, setter APIs. Preserve `set`, `get`, and `clear` reservation if preserving current precedence. Reference: <https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution>.

Resource limits are required for attacker-controlled expressions:

| Resource | Control |
| --- | --- |
| Source and token size | Reject oversized input before AST allocation |
| Nesting and AST nodes | Bound parse depth and visits |
| Calls and arrays | Bound arguments and literal elements |
| Helper re-entry | Bound nested expression depth and count |
| Iteration and result size | Bound `_map`, `_filter`, `_reduce`, `_chunk`, arrays, and strings |
| Chunk size | Require finite positive integer and cap output |

Exact values require workload evidence and approval. Limits must be shared across nested helper calls.

## 10. Migration and test plan

### Approval gate

Approve before source work:

1. Syntax beyond the 13 cases.
2. Computed access and member-call expansions beyond required dot reads.
3. Stored and predefined function calls.
4. Coercion and equality.
5. Assignment forms.
6. Snapshot versus live bindings.
7. Shallow aliases versus normalization.
8. Reserved names and prototype behavior.
9. Resource limits and error shapes.
10. Logging sink and privacy.
11. Release policy and major-version need.
12. Ordinary callbacks versus interpreter-native helper descriptors.

Oracle recommendation: use an API-compatible approved subset, remove ambient and inherited access as an intentional breaking boundary, and likely use a major release unless contract evidence supports narrower release.

### Characterization first

Before source changes, add tests for all 13 existing cases, exact missing-variable error, singleton persistence, independent instances, collision precedence, quote escapes, array-spread contexts, numeric `_reduce` initial reparse, `_switch` default-first behavior, default-slot equality edge defect, and exact missing-default error; `_if` eager outer evaluation; top-level assignment persistence and rejection of compound, member, chained, and nested assignments; logging defect; invalid `_chunk` sizes including zero, negative, and `NaN`; custom values, getters, proxies, coercion, and mutation.

Do not run malicious arbitrary JavaScript samples. New security tests should assert rejection of forbidden syntax without executing payloads.

### Implementation sequence

1. Implement tokenizer and parser in isolation, with no interpreter fallback.
2. Implement explicit environment, literals, arrays, operators, ternary, and approved calls with strict internal types.
3. Adapt eight helpers and preserve current defaults: array spread for `_map` and `_filter`, numeric `_reduce` reparse, eager `_if`, default-first `_switch`, and bounded `_chunk`.
4. Route `parseExpression` and `evaluate` through same pipeline while preserving public API and singleton construction.
5. Run parser, interpreter, helper, public API, security rejection, resource, build, and declaration tests.
6. Publish migration notes stating arbitrary JavaScript, ambient globals, inherited access, and fallback execution are no longer supported. State that callbacks remain unsandboxed.

### Test layers

| Layer | Required proof |
| --- | --- |
| Tokenizer | Boundaries, escapes, invalid input, limits |
| Parser | Precedence, associativity, grouping, ternary, calls, EOF |
| Interpreter | Lookup, operators, short-circuit, runtime missing names, aliases, limits |
| Helpers | All eight and nested re-entry |
| Public API | Singleton, class isolation, setters, getters, clear, exact errors |
| Security | Forbidden syntax rejected before host execution |
| Resources | Depth, size, iteration, invalid chunk size terminate |
| Integration | Build and declarations |

Required semantic cases include `2 + 3 * 4`, nested parentheses, literals and escapes, arrays, ternary, all eight helpers, exact `_switch`, collisions, skipped valid missing names, forbidden syntax in skipped branches, trailing input, callback argument and receiver policy, aliases, and approved assignment forms.

## 11. Deferred optimization

Defer global AST cache until measured. Cache adds memory, invalidation, and error-identity policy. Parse-once nested string expressions within one outer evaluation is reasonable later for `_map` and `_filter`, provided it preserves per-iteration context rebuild, array spread, aliases, budget accounting, and lookup timing. Add bounded cache only after profiling and choosing size and eviction policy.

## 12. Open decisions

1. Is language limited to corpus plus arithmetic, comparison, logical, ternary, arrays, and own dot lookup?
2. Are object literals allowed, and how are prototypes handled?
3. Are arbitrary stored and predefined functions callable?
4. Are member methods rejected or allowlisted?
5. Is `data.y` preserved?
6. Is computed access rejected?
7. Which exact top-level `identifier = expression` assignment grammar is retained, and which compound, member, chained, or nested forms are rejected?
8. What equality and coercion rules apply?
9. Are `undefined`, `NaN`, `Infinity`, exponents, and separators supported?
10. Is `_if` kept eager or changed to a lazy special form?
11. Which helper error strings must remain exact?
12. What are source, depth, AST, helper, array, string, and iteration limits?
13. Do `set`, `get`, and `clear` remain reserved in expression lookup?
14. Are dangerous keys rejected by setters, lookup, or both?
15. Is shallow aliasing retained?
16. Is bare-call `this` guaranteed to be current context?
17. What logging sink and privacy policy apply?
18. Is major release required?
19. Should the named `VarCraft` class be exported from the future package root, in addition to the default singleton?
20. Do downstream consumers rely on undocumented JavaScript behavior? Unknown.

## 13. Evidence and sources

### Repository evidence

- `src/varcraft.ts:1-16`, public `Value` and `Context`.
- `src/varcraft.ts:18-31`, state, logging, recursive defect.
- `src/varcraft.ts:33-41`, context spread and precedence.
- `src/varcraft.ts:44-49`, `parseExpression` flow.
- `src/varcraft.ts:51-77`, dynamic execution, assignment regex, errors.
- `src/varcraft.ts:79-100`, setter, predefined registration, getter, clear.
- `src/index.ts:1-3`, singleton construction.
- `src/index.ts:4-77`, eight helpers and nested evaluation.
- `test/varcraft.test.ts:1-104`, 13 tests and exact expressions.
- `package.json:1-47`, version, scripts, dependencies, Node engine.
- `tsconfig.json:1-16`, ES2019 CommonJS strict declarations.
- `readme.md:3-92`, package usage and singleton API.

### Runtime and baseline evidence

Harmless Node v22.22.0 probe used `node --experimental-strip-types --input-type=module -e` importing `./src/varcraft.ts`. It confirmed arithmetic `2+3*4=14`, `typeof process='object'`, and `({}).constructor===Object` true. No secrets were read and no malicious samples ran.

Baseline command supplied for this analysis:

```bash
pnpm exec jest --runInBand && pnpm exec tsc --noEmit
```

Result: `sh: jest: command not found`; `tsc` did not run because of `&&`. Dependencies were not installed. No test or compiler pass is claimed.

Baseline git status supplied: `?? .omo/`, pre-existing and untouched. This document is the only repository modification made for this task.

### External sources

- Function constructor: <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/Function>
- `with`: <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/with>
- Operator precedence: <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence>
- Prototype pollution: <https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution>
- ECMAScript expressions: <https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html>
- jsep: <https://github.com/EricSmekens/jsep>
- Acorn: <https://github.com/acornjs/acorn>
- Babel parser: <https://babeljs.io/docs/babel-parser>
- Node VM: <https://nodejs.org/api/vm.html>

## 14. Boundary and next action

Recommended design: zero runtime dependencies, hand-written tokenizer, Pratt parser, full AST validation, explicit allowlisted interpreter, preserved public API, and explicit compatibility tests for nested helpers.

Next action: review and approve syntax, members, calls, assignment, coercion, limits, reserved names, logging, and release policy. Only then begin source refactor.

Exact validation performed for this document:

- Read source through codegraph for `src/index.ts`, `src/varcraft.ts`, and `test/varcraft.test.ts`.
- Read `package.json`, `tsconfig.json`, and lowercase `readme.md`.
- Wrote only `TOKENIZER_REFACTOR.md`.
- Read the completed Markdown in two passes.
- Ran Markdown LSP diagnostics; no Markdown LSP server is configured, so no diagnostics were available.
- Ran read-only `git status --short -- TOKENIZER_REFACTOR.md src test package.json tsconfig.json readme.md`; result was only `?? TOKENIZER_REFACTOR.md` for selected paths.
- Did not install dependencies, modify source, modify tests, modify README, create plans, commit, or claim tests passed.
