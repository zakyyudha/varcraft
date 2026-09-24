# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 2.0.x | Yes |
| 1.x | No — VarCraft 1.x evaluated expressions as arbitrary JavaScript and is superseded by 2.0.0 |

## Reporting a vulnerability

Report security issues through GitHub's private vulnerability reporting on the
repository (Security → Report a vulnerability), or open a minimal issue that
describes the impact without public reproduction details if private reporting is
unavailable.

Please include:

- the VarCraft version and the Node.js version;
- the expression text, `data`, and registered callbacks involved;
- the observed result versus the expected result;
- whether the issue requires a *trusted* host callback to be involved.

We aim to acknowledge reports within a few business days.

## Threat model

VarCraft evaluates **expression text that may be untrusted** against values and
helpers supplied by a **trusted host application**. The security boundary is the
expression language.

### In scope

- Arbitrary JavaScript execution through expression text.
- Reaching ambient globals, constructors, or prototype chains from an
  expression.
- Calling a function that arrived through untrusted evaluation `data`.
- Prototype-pollution-style access via dangerous keys.
- Denial of service through oversized or deeply nested expressions.
- Leaking secrets through diagnostic output.

### Out of scope

- Code inside a callback you register with `set`, `setPredefinedVar`, or
  `setMemberMethod`. Those callbacks are **trusted host code**.
- Getters, proxies, `Symbol.toPrimitive`, and other host objects you store or
  pass through `data`. Their bodies are not sandboxed.
- CPU or memory consumed *inside* a trusted callback's own body.
- Any guarantee of process isolation. VarCraft is an expression-language
  boundary, not an operating-system or VM sandbox.

## What VarCraft enforces

VarCraft 2.0 parses and interprets expressions; it never compiles or runs them
as JavaScript.

- **No dynamic execution.** The evaluator uses no `eval`, `Function` /
  `new Function`, `with`, or Node `vm`, and has no raw-source fallback.
- **No ambient or inherited lookup.** Unresolved names never reach the global
  scope, lexical scope, or prototype chains. Lookup is limited to
  `set/get/clear > predefined > stored > data`.
- **Own-property member reads.** Dot and computed reads use own properties only.
- **Dangerous keys denied.** `constructor`, `prototype`, and `__proto__` are
  rejected in lookup and in every registration API.
- **Callback provenance.** A function supplied through evaluation `data` can be
  read as a value but cannot be invoked, and cannot be promoted to callable via
  expression-level `set` or top-level assignment. Only the host grant APIs
  (`set`, `setPredefinedVar`, `setMemberMethod`) make a function callable.
- **Allowlisted member methods.** `target.name(args)` dispatches only through the
  member-method registry. Unregistered names throw `DeniedOperationError`.
- **Restricted `toString()`.** Zero arguments only; object targets and custom
  conversion hooks are denied and never invoked.
- **Resource limits.** A shared per-evaluation budget caps source length, token
  count, parser depth, AST nodes, call arguments, array/string size, object
  keys, evaluation count, nesting, and interpreter work. Exceeding a limit
  throws `LimitError`.
- **Diagnostics redaction.** Diagnostic events carry metadata only (event code,
  source length, error name, numeric offset, result type) — never expression
  source text or evaluated values. No console output is produced.

## Trusted capabilities — your responsibility

The limits above constrain VarCraft's own interpreter and helper work. They do
not constrain a trusted callback's body, and callbacks invoked directly through
`get()` outside a VarCraft evaluation run unbudgeted.

Do not expose secrets, filesystem access, network access, or other sensitive
operations to untrusted expression authors through registered callbacks or
stored host objects.

## Related documents

- [readme.md](./readme.md) — API, expression language, and the security model in context.
- [NODE_SUPPORT.md](./NODE_SUPPORT.md) — supported Node.js contracts.
