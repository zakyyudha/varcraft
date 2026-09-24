import { VarCraft as Parser } from './varcraft'

export { LIMITS, LimitError } from './limits'
export type { MemberMethod } from './member-methods'
export { DeniedOperationError, MissingNameError, type Value } from './values'
export type { VarCraftOptions } from './varcraft'
export { VarCraft } from './varcraft'

const instance = new Parser({ builtins: true })

export default instance
