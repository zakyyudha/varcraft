type Value =
  | number
  | string
  | boolean
  | object
  | any[]
  | ((data: any, ...args: any[]) => Value)

interface Context {
  set: (name: string, value: Value) => void
  get: (name: string) => Value
  clear: () => void
  data: any

  [key: string]: Value | Function
}

export class VarCraft {
  private variables: Record<string, Value> = {}
  private predefinedVariables: Record<string, Value> = {}
  private enableLogging: boolean = false

  setEnableLogging(enableLogging: boolean): void {
    this.enableLogging = enableLogging
  }

  private log(message: string): void {
    if (this.enableLogging) {
      this.log(message)
    }
  }

  private createContext(data?: any): Context {
    return {
      ...(data || {}),
      ...this.variables,
      ...this.predefinedVariables,
      set: this.set.bind(this),
      get: this.get.bind(this),
      clear: this.clear.bind(this),
    }
  }

  parseExpression(expression: string, data?: any): Value {
    this.log(`Parsing expression: ${expression}`)
    const result = this.evaluate(expression, data)
    this.log(`Result of expression: ${expression} is: ${result}`)
    return result
  }

  evaluate(expression: string, data?: any): Value {
    const context = this.createContext(data)

    const functionBody = `
          with(this) {
            return ${expression};
          }
        `

    try {
      const result = new Function(functionBody).call(context)

      // Check if the expression defines a variable
      const match = /^\s*([^=]+)\s*=\s*([^;]+)\s*$/.exec(expression)
      if (match) {
        const varName = match[1].trim()
        this.variables[varName] = result
        this.log(`Defined variable ${varName} with value: ${result}`)
      }

      this.log(`Evaluated expression: ${expression} to: ${result}`)
      return result
    } catch (error) {
      console.error(`Error while evaluating expression: ${expression}`)
      throw error
    }
  }

  set(name: string, value: Value): void {
    this.variables[name] = value
  }

  setPredefinedVar(name: string, value: Value): void {
    this.predefinedVariables[name] = value
  }

  get(name: string): Value {
    if (name in this.variables) {
      return this.variables[name]
    } else if (name in this.predefinedVariables) {
      return this.predefinedVariables[name]
    } else {
      throw new Error(`Variable or function ${name} not found`)
    }
  }

  clear(): void {
    this.variables = {}
    this.log('Cleared defined functions and variables')
  }
}
