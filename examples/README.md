# Batch Mode Usage Examples

This document provides practical examples of using the batch mode validator.

## Quick Start

```bash
# Build the project
npm run build

# Run batch validation
npm run batch-validate examples/simple_input.jsonl examples/simple_proof.jsonl

# Or directly with node
node dist/batch-validator.js examples/simple_input.jsonl examples/simple_proof.jsonl
```

## Example Files Included

### Simple Division: x/x = 1 (given x ≠ 0)
- **Input**: `examples/simple_input.jsonl`
- **Proof**: `examples/simple_proof.jsonl`
- **Result**: ✅ Proven with score (0, 1)

### Algebraic Identity: (x+a)² - (x-a)² = 4ax
- **Input**: `examples/algebraic_input.jsonl`  
- **Proof**: `examples/algebraic_proof.jsonl`
- **Result**: ✅ Proven with score (0, 1)

### Comprehensive Test: (x/x) + 0 = 1
- **Input**: `examples/comprehensive_input.jsonl`
- **Proof**: `examples/comprehensive_proof.jsonl`  
- **Result**: ✅ Proven with score (0, 1)

### Trivial Identity: x = x
- **Input**: `examples/trivial_input.jsonl`
- **Proof**: `examples/trivial_proof.jsonl`
- **Result**: ⚠️ Proven with score (1, 1) - command failed but goal is trivially true

### Error Cases
- **Input**: `examples/error_input.jsonl` - Missing required fields
- **Proof**: `examples/error_proof.jsonl` - Invalid command
- **Result**: ❌ Failed with errors

- **Input**: `examples/invalid_json.jsonl` - Invalid JSON syntax
- **Result**: ❌ Parse errors reported

## Understanding Evaluation Scores

The evaluation score is a tuple `(error_count, proved)`:

- `(0, 1)`: Perfect - no errors, goal proven ✅
- `(0, 0)`: Clean but incomplete - no errors, goal not proven ⚠️  
- `(n, 1)`: Proven with n errors - goal proven despite errors ⚠️
- `(n, 0)`: Failed - n errors and goal not proven ❌

## Creating Your Own Examples

### 1. Create Input File (hypothesis + goal)

```json
{
  "hypotheses": {
    "hyp1": {"kind": "neq", "lhs": {"type": "var", "name": "x"}, "rhs": {"type": "const", "value": 0}}
  },
  "goal": {"kind": "eq", "lhs": {"type": "var", "name": "x"}, "rhs": {"type": "var", "name": "x"}}
}
```

### 2. Create Proof File (commands)

```json
{"command": {"cmd": "确定"}}
```

### 3. Run Validation

```bash
npm run batch-validate your_input.jsonl your_proof.jsonl
```

## Common Commands

- `多能` - Algebraic simplification (most common)
- `反证` - Proof by contradiction  
- `再写` - Rewrite using known equality
- `确定` - Assert obvious mathematical truth
- `不利` - Derive inequality from hypothesis
- `重反` - Reverse sides of equality

## Troubleshooting

### Command Failed Errors
- Check that referenced fact names exist in hypotheses
- Ensure denominators are proven non-zero for `多能`
- Verify command syntax matches documentation

### Parse Errors  
- Validate JSON syntax using online JSON validator
- Ensure each line contains exactly one JSON object
- Check for proper escaping of special characters

### Validation Errors
- Verify required fields are present (hypotheses, goal)
- Check that goal has proper structure (kind, lhs, rhs)
- Ensure expression types are valid (var, const, op, func)

For detailed format specification, see `docs/BatchModeSemantics.md`.