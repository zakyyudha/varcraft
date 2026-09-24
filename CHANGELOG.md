# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-09-24

VarCraft 2.0.0 is a **breaking evaluator release**. It replaces the VarCraft 1.x
dynamic JavaScript evaluator (which compiled expression text with
`new Function` and ran it inside `with`) with a hand-written tokenizer, Pratt
parser, and explicit interpreter. All state-management method names are
preserved; arbitrary-JavaScript expression compatibility is removed. See
[readme.md § Migrating from VarCraft 1.x](./readme.md#migrating-from-varcraft-1x)
for the full upgrade guide.

### Added

- **New evaluator pipeline.** Tokenizer → Pratt parser → typed AST → interpreter,
  with no `eval`, `Function`/`new Function`, `with`, Node `vm`, or raw-source
  fallback. Parser consumes the whole input and rejects trailing tokens.
- **Package-root exports.** The named `VarCraft` class, `DeniedOperationError`,
  `MissingNameError`, `LimitError`, and `LIMITS`, plus the `VarCraftOptions`,
  `Value`, and `MemberMethod` types, are now exported from the package root
  alongside the default singleton.
- **Opt-in isolated built-ins.** `new VarCraft({ builtins: true })` installs the
  built-in helpers on a non-singleton engine; a plain `new VarCraft()` has none.
- **`reset()`** lifecycle method: restores the configured baseline (stored
  variables, predefined variables, member methods) and reinstalls built-ins only
  for instances constructed with `{ builtins: true }`.
- **Lazy conditionals `_when` and `_case`.** AST-native helpers whose arguments
  are ordinary expressions evaluated on demand; the selected branch runs once,
  the unselected branch never runs, and a `_case` default runs only when no case
  matches. `_case` matches raw values (no string escaping).
- **Diagnostics boundary.** `setLogger(logger)` plus `setEnableLogging(true)`
  emit metadata-only events (event code, source length, error name, numeric
  offset, result type). No console output is produced, with or without a logger.
- **Resource limits.** A shared per-evaluation budget across `source`, `tokens`,
  `depth`, `nodes`, `args`, `array`, `string`, `keys`, `evaluations`, `nesting`,
  and `work`, throwing `LimitError` (a `RangeError` subclass) that names the
  exceeded resource.
- **Continuous optional chaining.** `customer?.profile.name` short-circuits the
  whole unbroken chain to `undefined`; grouped `(customer?.profile).name` ends
  the guard and performs an ordinary access.
- **Callback provenance.** A function supplied through evaluation `data` cannot
  be invoked, nor promoted to callable via expression-level `set` or top-level
  assignment. Only the host APIs (`set`, `setPredefinedVar`, `setMemberMethod`)
  grant callability.
- **Restricted default `toString()` member method.** Zero-argument only;
  primitives convert via `String`, plain primitive/nullish arrays serialize
  joined by `,`, and object targets or custom conversion hooks are denied.
- **Nested helper scope inheritance.** `_map`/`_filter`/`_reduce` bodies inherit
  the outer `data`, stored, and predefined bindings and overlay `_item_`,
  `_index_`, and `_accumulator_`.
- **Node support contract** ([NODE_SUPPORT.md](./NODE_SUPPORT.md)), **pack and
  consumer smoke gate** (`pnpm run pack:smoke`), and **CI** (`.github/workflows/ci.yml`).

### Changed

- **`clear()` is variables-only.** It removes stored variables and preserves
  predefined variables, member methods, and built-ins. Use `reset()` to restore
  the full baseline.
- **Expression lookup** is limited to `set/get/clear > predefined > stored >
  data`; ambient globals, lexical scope, and prototype chains are never
  consulted.
- **Member reads** use own properties only; dangerous keys (`constructor`,
  `prototype`, `__proto__`) are denied in lookup and in every registration API.
- **Stringly conditionals are deprecated.** `_if` and `_switch` remain through
  2.x and keep the double-quote convention for nested literals, but `_when` and
  `_case` are recommended.
- **Documentation** rewritten as release truth: [readme.md](./readme.md),
  [PERFORMANCE.md](./PERFORMANCE.md), and [SECURITY.md](./SECURITY.md).

### Removed

Removed from the expression language (accepted only by the 1.x JavaScript
evaluator):

- Object literals and object spread
- Function and arrow expressions
- `new`, `delete`, statements, declarations, and imports
- Ambient globals (`process`, `globalThis`) and constructor/prototype access
- Arbitrary member method calls without an explicit `setMemberMethod` registration
- Member and member-call optional-chaining forms
- Computed property syntax beyond primitive string/number keys
- Compound, chained, member, and nested assignments
- Unconditional console logging and the recursive logging path

### Fixed

- Ambient and inherited-value reachability in expression lookup.
- Regex-based assignment misclassification (`==`, `>=`, and similar forms).
- `_chunk` acceptance of zero/negative/non-integer sizes.
- The `_switch` default-slot edge where the default could be evaluated before a
  matching case.
- Unbounded nested helper re-entry, now charged to the shared budget.

### Security

- Expressions are parsed and interpreted, never executed as JavaScript; the
  evaluator uses no `eval`, `Function`/`new Function`, `with`, or `vm`.
- The expression-language boundary is explicitly **not** process isolation.
  Registered callbacks, getters, proxies, and host objects remain trusted
  capabilities. See [SECURITY.md](./SECURITY.md).

## 1.0.1 and earlier

VarCraft 1.x evaluated expressions as arbitrary JavaScript via
`new Function` inside `with (this)`. It exposed only the default singleton at the
package root and shared one process-wide instance's stored state across imports.
These releases predate this changelog; they are recorded here only as the
baseline that 2.0.0 replaces.

[Unreleased]: https://github.com/zakyyudha/varcraft/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/zakyyudha/varcraft/releases/tag/v2.0.0
