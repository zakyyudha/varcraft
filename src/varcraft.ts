type Value = number | string | boolean | object | any[] | ((data: any, ...args: any[]) => Value);

interface Context {
    set: (name: string, value: Value) => void;
    get: (name: string) => Value;
    clear: () => void;
    data: any;

    [key: string]: Value | Function;
}

export class VarCraft {
    private variables: Record<string, Value> = {};

    parseExpression(expression: string, data?: any): Value {
        console.log(`Parsing expression: ${expression}`);
        const result = this.evaluate(expression, data);
        console.log(`Result of expression: ${expression} is: ${result}`);
        return result;
    }

    evaluate(expression: string, data?: any): Value {
        const context = {
            ...data || {},
            ...this.variables,
            set: this.set.bind(this),
            get: this.get.bind(this),
            clear: this.clear.bind(this),
        };

        const functionBody = `
          with(this) {
            return ${expression};
          }
        `;

        try {
            const result = new Function(functionBody).call(context);

            // Check if the expression defines a variable
            const match = /^\s*([^=]+)\s*=\s*([^;]+)\s*$/.exec(expression);
            if (match) {
                const varName = match[1].trim();
                this.variables[varName] = result;
                console.log(`Defined variable ${varName} with value: ${result}`);
            }

            console.log(`Evaluated expression: ${expression} to: ${result}`);
            return result;
        } catch (error) {
            console.error(`Error while evaluating expression: ${expression}`);
            throw error;
        }
    }

    set(name: string, value: Value): void {
        this.variables[name] = value;
    }

    get(name: string): Value {
        if (name in this.variables) {
            return this.variables[name];
        } else {
            throw new Error(`Variable or function ${name} not found`);
        }
    }

    clear(): void {
        this.variables = {};
        console.log('Cleared defined functions and variables');
    }
}
