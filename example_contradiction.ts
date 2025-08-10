// example_contradiction.ts  
// Example: Proof by contradiction using 反证 command

import { ProofSession, Expr } from './main/index.js';

// Create a new proof session
const session = new ProofSession();
session.setLogger(console.log);

console.log('\n=== Proof by Contradiction Example ===\n');
console.log('Given: x² = 1');
console.log('Prove: x ≠ 0\n');

// Add initial fact: x² = 1
session.addGlobalFact('x_squared',
  Expr.eq(
    Expr.pow(Expr.var('x'), Expr.const(2)),
    Expr.const(1)
  )
);

// Start proving x ≠ 0
const frame = session.startHave('x_nonzero',
  Expr.neq(Expr.var('x'), Expr.const(0))
);

// Create a hypothesis for contradiction: assume x² ≠ 1
// (This would contradict our given fact)
const subFrame = session.startHave('contradiction_hyp',
  Expr.neq(
    Expr.pow(Expr.var('x'), Expr.const(2)),
    Expr.const(1)
  ),
  frame
);

// Apply 反证: swap the goal (x² ≠ 1) with hypothesis
// This creates a new goal to prove x² = 1 from x = 0
session.addCommand(subFrame, {
  cmd: '反证',
  hypName: 'x_nonzero'  // This swaps with the parent frame's goal
});

// Now the goal is x² = 1 and we have x = 0 as hypothesis
// We can verify that 0² = 0, not 1, creating a contradiction

// For this example, let's show a simpler direct proof instead:
console.log('\n=== Alternative Direct Proof ===\n');

// Reset and try a different approach
const session2 = new ProofSession();

// Given: a * b = c and c ≠ 0
session2.addGlobalFact('product_eq',
  Expr.eq(
    Expr.mul(Expr.var('a'), Expr.var('b')),
    Expr.var('c')
  )
);

session2.addGlobalFact('c_nonzero',
  Expr.neq(Expr.var('c'), Expr.const(0))
);

// Prove: a ≠ 0
const frame2 = session2.startHave('a_nonzero',
  Expr.neq(Expr.var('a'), Expr.const(0))
);

// First, rewrite the goal using the product equation
const subFrame2 = session2.startHave('product_nonzero',
  Expr.neq(
    Expr.mul(Expr.var('a'), Expr.var('b')),
    Expr.const(0)
  ),
  frame2
);

// Rewrite using product_eq: a * b = c
session2.addCommand(subFrame2, {
  cmd: '再写',
  equalityName: 'product_eq',
  occurrence: 1
});

// Now goal is c ≠ 0, which matches our fact c_nonzero
session2.finalize(subFrame2);

// Use 不利 to extract a ≠ 0 from a * b ≠ 0
session2.addCommand(frame2, {
  cmd: '不利',
  newName: 'a_from_product',
  component: Expr.var('a'),
  hypothesis: 'product_nonzero'
});

const result = session2.finalize(frame2);
console.log(`Proof completed: ${result.ok ? 'SUCCESS' : 'FAILED'}`);

console.log('\n=== Serialized Proof ===\n');
console.log(session2.serializeAll());

/*
This example demonstrates:
1. How 反证 (contradiction) swaps goals with hypotheses
2. How to combine multiple commands (再写, 不利) in a proof
3. Nested proof frames for intermediate results
*/
