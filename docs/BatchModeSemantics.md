# Batch Mode Semantics

This document describes the JSONL format and prover semantics for batch mode processing in the Complex Number Proof Assistant.

## Overview

Batch mode allows for automated validation of mathematical proofs by processing two separate JSONL files:

1. **Input file**: Contains hypotheses and the goal to be proven
2. **Proof file**: Contains a sequence of proof commands

The validator processes these files and returns an evaluation score with error reporting.

## File Formats

### Input File Format

The input file should contain exactly one JSON object with the following structure:

```json
{
  "hypotheses": {
    "fact_name": {
      "kind": "eq" | "neq",
      "lhs": <Expression>,
      "rhs": <Expression>
    }
  },
  "goal": {
    "kind": "eq" | "neq", 
    "lhs": <Expression>,
    "rhs": <Expression>
  }
}
```

**Fields:**
- `hypotheses`: Object mapping fact names to mathematical facts (equations or inequalities)
- `goal`: The mathematical fact to be proven

### Proof File Format

The proof file should contain one JSON object per line, each representing a proof command:

```json
{"command": {"cmd": "多能", "denomProofs": ["fact1", "fact2"]}}
{"command": {"cmd": "反证", "hypName": "hypothesis_name"}}
{"command": {"cmd": "再写", "equalityName": "fact_name", "occurrence": 1}}
```

Each line must contain a `command` field with a valid proof command object.

## Expression Format

Expressions are represented as JSON objects with the following types:

### Variable
```json
{"type": "var", "name": "x"}
```

### Constant
```json
{"type": "const", "value": 5}
```
or
```json
{"type": "const", "value": "0"}
```

### Operations
```json
{
  "type": "op",
  "op": "add" | "sub" | "mul" | "div" | "neg" | "pow",
  "args": [<Expression>, ...]
}
```

**Operation types:**
- `add`: Addition (a + b)
- `sub`: Subtraction (a - b)
- `mul`: Multiplication (a * b)
- `div`: Division (a / b)
- `neg`: Negation (-a)
- `pow`: Exponentiation (a^b)

### Functions
```json
{
  "type": "func",
  "name": "conj" | "Re" | "Im" | "abs",
  "args": [<Expression>, ...]
}
```

**Function types:**
- `conj`: Complex conjugate
- `Re`: Real part
- `Im`: Imaginary part
- `abs`: Absolute value/magnitude

## Proof Commands

### 多能 (Duoneng) - Algebraic Simplification
Attempts to prove the current goal using field axioms and algebraic simplification.

```json
{"cmd": "多能", "denomProofs": ["denom_fact1", "denom_fact2"]}
```

**Parameters:**
- `denomProofs` (optional): Array of fact names proving denominators are non-zero

### 反证 (Fanzheng) - Proof by Contradiction
Assumes the negation of a hypothesis and updates the goal.

```json
{"cmd": "反证", "hypName": "hypothesis_name"}
```

**Parameters:**
- `hypName`: Name of hypothesis to negate

### 再写 (Rewrite) - Rewrite Using Equality
Rewrites the goal using a known equality.

```json
{"cmd": "再写", "equalityName": "fact_name", "occurrence": 1}
```

**Parameters:**
- `equalityName`: Name of equality fact to use for rewriting
- `occurrence` (optional): Which occurrence to rewrite (default: all)

### 不利 (Buli) - Derive Inequality
Derives an inequality from a hypothesis about a complex expression.

```json
{"cmd": "不利", "newName": "new_fact_name", "component": <Expression>, "hypothesis": "hyp_name"}
```

**Parameters:**
- `newName`: Name for the new derived fact
- `component`: Expression component to analyze
- `hypothesis`: Name of hypothesis to use

### 重反 (Reverse) - Reverse Equality
Reverses the sides of an equality.

```json
{"cmd": "重反", "oldName": "old_fact_name", "newName": "new_fact_name"}
```

**Parameters:**
- `oldName`: Name of existing equality fact
- `newName`: Name for reversed equality

### 确定 (Certain) - Assert Obvious Truth
Asserts that the current goal is an obvious mathematical truth.

```json
{"cmd": "确定"}
```

No parameters required.

## Prover Semantics

### Proof Process
1. **Initialization**: Create a proof session with the given hypotheses and goal
2. **Command Execution**: Execute proof commands sequentially
3. **State Management**: Track context (known facts) and current goal
4. **Completion Check**: After each command, check if the goal is proven

### Context Management
- **Facts**: Named mathematical statements (equations/inequalities)
- **Inheritance**: Child proof sessions inherit parent context
- **Updates**: Successful commands may add new facts to context

### Error Handling
Commands can fail for various reasons:
- Invalid syntax or parameters
- Referenced facts don't exist
- Mathematical operations are invalid
- Proof strategy doesn't apply

### Nested Proofs
The prover supports nested proof sessions for proving sub-goals:
- Child sessions inherit parent context
- Completed child proofs add facts to parent context
- Used for lemmas and intermediate results

## Evaluation Score

The batch validator returns an evaluation score as a tuple:

```
(error_count, proved)
```

Where:
- `error_count`: Number of errors encountered (integer ≥ 0)
- `proved`: Whether the goal was proven (0 for false, 1 for true)

### Success Criteria
- `error_count = 0` and `proved = 1`: Perfect proof
- `error_count = 0` and `proved = 0`: Valid but incomplete proof
- `error_count > 0`: Invalid proof with errors

## Error Types

### Parse Errors
- Invalid JSON syntax
- Malformed JSONL format

### Validation Errors  
- Missing required fields
- Invalid field types
- Unknown command names
- Invalid expression structure

### Command Errors
- Command execution failures
- Referenced facts not found
- Mathematical inconsistencies
- Proof strategy failures

## Example Files

### Input File Example (problem1_input.jsonl)
```json
{"hypotheses": {"H1": {"kind": "neq", "lhs": {"type": "var", "name": "x"}, "rhs": {"type": "const", "value": 0}}}, "goal": {"kind": "eq", "lhs": {"type": "op", "op": "div", "args": [{"type": "var", "name": "x"}, {"type": "var", "name": "x"}]}, "rhs": {"type": "const", "value": 1}}}
```

### Proof File Example (problem1_proof.jsonl)
```json
{"command": {"cmd": "多能", "denomProofs": ["H1"]}}
```

This example proves that x/x = 1 given x ≠ 0 using algebraic simplification.

## Usage

```bash
# Command line usage
node batch-validator.js input.jsonl proof.jsonl

# Programmatic usage
import { BatchModeValidator } from './batch-mode.js';

const validator = new BatchModeValidator(console.log);
const result = await validator.processBatch('input.jsonl', 'proof.jsonl');
console.log(validator.formatResult(result));
```

## Notes

- All file paths are relative to the current working directory
- JSONL files should use UTF-8 encoding
- Empty lines in JSONL files are ignored
- The prover uses mathematical libraries for algebraic simplification
- Complex number operations are fully supported
- Proof sessions maintain complete command history for debugging