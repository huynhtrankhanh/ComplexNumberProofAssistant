# Chinese Theorem Prover MCP Server

An MCP (Model Context Protocol) server providing access to a mathematical theorem prover that uses Chinese command names. This system allows formal mathematical proofs through algebraic manipulation and logical reasoning.

## Installation

```bash
npm install
npm run build
```

## Running the Server

```bash
npm start
```

Or for development with hot-reload:
```bash
npm run dev
```

## Overview

The Chinese Theorem Prover is a formal proof system where:
- **Facts** are mathematical statements (equations or inequalities)
- **Proofs** are sequences of commands that transform goals into proven facts
- **Commands** use Chinese names that describe their mathematical function

## Core Concepts

### Facts
- **Equality (eq)**: States that two expressions are equal (e.g., `x + 1 = 5`)
- **Inequality (neq)**: States that two expressions are not equal (e.g., `x ≠ 0`)

### Expressions
Expressions are built from:
- **Variables**: Named symbols like `x`, `y`, `a`
- **Constants**: Numbers like `0`, `1`, `-5`, or special values like `i`
- **Operations**: `add` (+), `sub` (-), `mul` (*), `div` (/), `neg` (-), `pow` (^)
- **Functions**: `conj` (conjugate), `Re` (real part), `Im` (imaginary part), `sqnorm` (squared norm)

### Commands (Chinese Names)

1. **不利 (bùlì)** - "Unfavorable"
   - Proves a component is non-zero from a product/quotient inequality
   - Example: From `a * b / c ≠ 0`, prove `b ≠ 0`

2. **多能 (duōnéng)** - "Versatile"
   - Uses algebraic simplification to prove equations
   - Automatically simplifies both sides and checks equivalence

3. **反证 (fǎnzhèng)** - "Contradiction"
   - Proof by contradiction
   - Swaps goal inequality with hypothesis inequality

4. **再写 (zàixiě)** - "Rewrite"
   - Substitutes expressions using equalities or rewrite rules
   - Has built-in rules for complex conjugates and functions

5. **重反 (chóngfǎn)** - "Reverse"
   - Creates a new equality with reversed sides
   - From `a = b`, creates `b = a`

6. **确定 (quèdìng)** - "Confirm"
   - Verifies equations with only constant values
   - Numerically evaluates both sides

## MCP Tools

### Session Management
- `create_session`: Initialize a new proof session
- `add_fact`: Add a mathematical fact to the global context
- `list_facts`: List all available facts in a session

### Proof Construction
- `start_proof`: Begin proving a new fact (creates a frame)
- `finalize_proof`: Complete a proof and add the fact to context
- `get_frame_state`: Check the current state of a proof

### Proof Commands
- `apply_buli`: Apply the 不利 command
- `apply_duoneng`: Apply the 多能 command
- `apply_fanzheng`: Apply the 反证 command
- `apply_rewrite`: Apply the 再写 command
- `apply_reverse`: Apply the 重反 command
- `apply_certain`: Apply the 确定 command

### Utilities
- `serialize_proof`: Export the complete proof as a formatted script
- `list_rewrite_rules`: Show available built-in rewrite rules

## Example Workflow

1. **Create a session**
```json
{
  "tool": "create_session",
  "arguments": {
    "initial_facts": [
      {
        "name": "given",
        "fact": {
          "kind": "neq",
          "lhs": {"type": "op", "op": "mul", "args": [
            {"type": "var", "name": "x"},
            {"type": "var", "name": "y"}
          ]},
          "rhs": {"type": "const", "value": 0}
        }
      }
    ]
  }
}
```

2. **Start a proof**
```json
{
  "tool": "start_proof",
  "arguments": {
    "session_id": "session_1",
    "name": "x_nonzero",
    "goal": {
      "kind": "neq",
      "lhs": {"type": "var", "name": "x"},
      "rhs": {"type": "const", "value": 0}
    }
  }
}
```

3. **Apply commands**
```json
{
  "tool": "apply_buli",
  "arguments": {
    "session_id": "session_1",
    "frame_id": "frame_1",
    "new_name": "x_neq_0",
    "component": {"type": "var", "name": "x"},
    "hypothesis": "given"
  }
}
```

4. **Finalize and export**
```json
{
  "tool": "finalize_proof",
  "arguments": {
    "session_id": "session_1",
    "frame_id": "frame_1"
  }
}
```

## Expression Building Examples

### Simple variable
```json
{"type": "var", "name": "x"}
```

### Constant
```json
{"type": "const", "value": 5}
```

### Addition: x + y
```json
{
  "type": "op",
  "op": "add",
  "args": [
    {"type": "var", "name": "x"},
    {"type": "var", "name": "y"}
  ]
}
```

### Division: a / b
```json
{
  "type": "op",
  "op": "div",
  "args": [
    {"type": "var", "name": "a"},
    {"type": "var", "name": "b"}
  ]
}
```

### Function: conj(x)
```json
{
  "type": "func",
  "name": "conj",
  "args": [{"type": "var", "name": "x"}]
}
```

### Complex: (x + 1) * (x - 1)
```json
{
  "type": "op",
  "op": "mul",
  "args": [
    {
      "type": "op",
      "op": "add",
      "args": [
        {"type": "var", "name": "x"},
        {"type": "const", "value": 1}
      ]
    },
    {
      "type": "op",
      "op": "sub",
      "args": [
        {"type": "var", "name": "x"},
        {"type": "const", "value": 1}
      ]
    }
  ]
}
```

## Built-in Rewrite Rules

- `conj_inv`: conj(conj(a)) = a
- `conj_add`: conj(a + b) = conj(a) + conj(b)
- `conj_mul`: conj(a * b) = conj(a) * conj(b)
- `conj_sub`: conj(a - b) = conj(a) - conj(b)
- `conj_div`: conj(a / b) = conj(a) / conj(b)
- `conj_neg`: conj(-a) = -conj(a)
- `sqnorm_def`: sqnorm(a) = a * conj(a)
- `re_def`: Re(a) = (a + conj(a)) / 2
- `im_def`: Im(a) = (a - conj(a)) / 2
- `i_square`: i * i = -1

## Notes

- Proofs can be nested (sub-proofs within proofs)
- The system maintains a chronological history for accurate serialization
- Incomplete proofs are commented out when serialized
- All referenced facts are automatically included as seeds in exports
