

# VarCraft

**A versatile variable handling library for JavaScript and TypeScript.**

[![npm version](https://badge.fury.io/js/varcraft.svg)](https://www.npmjs.com/package/@zakyyudha/varcraft)
[![GitHub issues](https://img.shields.io/github/issues/zakyyudha/varcraft)](https://github.com/zakyyudha/varcraft/issues)
[![GitHub stars](https://img.shields.io/github/stars/zakyyudha/varcraft)](https://github.com/zakyyudha/varcraft/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
    - [Basic Example](#basic-example)
    - [Advanced Usage](#advanced-usage)

## Installation

```bash
npm install @zakyyudha/varcraft
```

## Usage

### Basic Example

```javascript
import VarCraft from '@zakyyudha/varcraft';

VarCraft.set('x', 42);
console.log(VarCraft.get('x')); // Output: 42
```


### Advanced Usage

VarCraft is designed to handle complex scenarios involving variable management and manipulation. Here are some advanced use cases:

### Dynamic Variable Creation

You can dynamically create variables based on certain conditions or user input:

```typescript
import VarCraft from '@zakyyudha/varcraft';

function createDynamicVariable(name: string, condition: boolean, valueIfTrue: any, valueIfFalse: any): void {
  const value = condition ? valueIfTrue : valueIfFalse;
  VarCraft.set(name, value);
}

createDynamicVariable('isProduction', process.env.NODE_ENV === 'production', true, false);
console.log(VarCraft.get('isProduction')); // Output: true or false
```

### Variable Transformation

VarCraft allows you to transform variables using custom functions:

```typescript
import VarCraft from '@zakyyudha/varcraft';

function transformVariable(name: string, transformationFunction: (value: any) => any): void {
  const originalValue = VarCraft.get(name);
  const transformedValue = transformationFunction(originalValue);
  myVarCraft.set(name, transformedValue);
}

// Example: Convert a string to uppercase
VarCraft.set('message', 'hello');
transformVariable('message', (value) => value.toUpperCase());
console.log(VarCraft.get('message')); // Output: 'HELLO'
```

### Variable Dependencies

Manage variables that depend on each other by updating them accordingly:

```typescript
import VarCraft from '@zakyyudha/varcraft';

VarCraft.set('x', 5);

function updateDependentVariable(): void {
  const x = VarCraft.get('x');
  VarCraft.set('y', x * 2);
}

updateDependentVariable();
console.log(VarCraft.get('y')); // Output: 10
```
