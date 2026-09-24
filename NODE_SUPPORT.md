# Node support

VarCraft declares two separate Node.js contracts. They are deliberately not the
same number: the runtime contract covers consumers of the packed `dist`, the
development contract covers the build toolchain.

| Contract | Field | Floor | Basis |
| --- | --- | --- | --- |
| Runtime | `package.json` → `engines.node` | `>=12.22.12` | Lowest Node on which the packed tarball smoke passed |
| Development / build | this document + `.nvmrc` | `>=18.0.0` | Lowest Node on which `tsc --noEmit` (TypeScript 7.0.2) actually runs |

The compiler's `engines` value is **not** the runtime floor. TypeScript 7.0.2
metadata advertises `>=16.20.0`, but it does not run there in practice (see
below), so the development floor is set from measurement, not from metadata.

## Runtime contract — `>=12.22.12`

The published package is CommonJS built with `tsc` at `target: ES2019`. It was
packed and exercised from a temporary consumer (default singleton, named
`VarCraft` class, error classes, `LIMITS`, `parseExpression`, data bindings,
ternary/logical operators, bracket and optional-chain reads, `toString`, the
case/aggregate built-ins, assignment, dangerous-key denial, missing-name errors,
and the source-length limit) under every Node available in the build environment:

| Node | Packed-dist smoke |
| --- | --- |
| 12.22.12 | pass (floor) |
| 14.21.3 | pass |
| 16.20.2 | pass |
| 18.20.8 | pass |
| 20.19.5 | pass |
| 22.22.0 | pass |
| 26.6.0 | pass |

`12.22.12` is the lowest Node that was available and verified, so it is the
declared floor. Versions below it were not installed and are **not** claimed.
Node 12/14/16 are end-of-life upstream; they remain inside the runtime floor
only because the packed dist was measured to work there.

## Development / build contract — `>=18.0.0`

The toolchain is pnpm 10, TypeScript 7, Biome, Jest, and SWC. TypeScript 7.0.2
ships as an ESM `type: module` package whose `bin/tsc` is extensionless; Node 16
and older cannot load it, producing `ERR_UNKNOWN_FILE_EXTENSION`. Measured:

| Node | `tsc --version` | `tsc --noEmit` |
| --- | --- | --- |
| 14.21.3 | fail | — |
| 16.20.2 | fail | — |
| 18.20.8 | 7.0.2 | pass |
| 22.22.0 | 7.0.2 | pass |
| 26.6.0 | 7.0.2 | pass |

`.nvmrc` pins the developer baseline to `22`. Other dependencies are satisfied
by the same floor: Biome `>=14.21.3`, Jest `^14.15.0 || ^16.10.0 || >=18.0.0`,
SWC `>=10`.

## Reproducing the matrix

Availability of Node versions is environment-specific; the numbers above are
from the machine that produced this contract. To re-run:

1. `pnpm run build`
2. `pnpm pack`
3. Extract the tarball into `node_modules/@zakyyudha/varcraft` of a temp
   consumer directory and run a CommonJS smoke script with each Node binary.
4. For the development floor: run `<node> node_modules/typescript/bin/tsc --noEmit`.

If only one Node version is installed, the runtime floor cannot be verified
below that version and must be recorded as partially verified.
