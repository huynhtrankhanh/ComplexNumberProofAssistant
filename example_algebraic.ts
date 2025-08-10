// example_algebraic.ts
// Example: Proving (x + 1) * (x - 1) = x² - 1 using algebraic simplification

import { ProofSession, Expr } from './main/index.js';

// Create a new proof session
const session = new ProofSession();
session.setLogger(console.log);

console.log('\n=== Proving Difference of Squares Identity ===\n');

// Start proof: (x + 1) * (x - 1) = x² - 1
const frame = session.startHave('difference_of_squares',
  Expr.eq(
    // Left side: (x + 1) * (x - 1)
    Expr.mul(
      Expr.add(Expr.var('x'), Expr.const(1)),
      Expr.sub(Expr.var('x'), Expr.const(1))
    ),
    // Right side: x² - 1
    Expr.sub(
      Expr.pow(Expr.var('x'), Expr.const(2)),
      Expr.const(1)
    )
  )
);

// Apply 多能 (algebraic simplification) - no denominators to prove non-zero
const result = session.addCommand(frame, {
  cmd: '多能',
  denomProofs: []
});

console.log(`多能 command: ${result.ok ? 'SUCCESS' : result.message}`);

// Finalize the proof
const finalized = session.finalize(frame);
console.log(`Proof finalized: ${finalized.ok ? 'SUCCESS' : finalized.message}`);

// Export the proof
console.log('\n=== Serialized Proof ===\n');
console.log(session.serializeAll());

console.log('\n=== Another Example: Complex Conjugate ===\n');

// Add a fact about a complex number
session.addGlobalFact('z_def', 
  Expr.eq(
    Expr.var('z'),
    Expr.add(Expr.const(3), Expr.mul(Expr.const(4), Expr.var('i')))
  )
);

// Prove that conj(conj(z)) = z using rewrite rules
const frame2 = session.startHave('conj_involution',
  Expr.eq(
    Expr.func('conj', Expr.func('conj', Expr.var('z'))),
    Expr.var('z')
  )
);

// Use the built-in conj_inv rewrite rule
session.addCommand(frame2, {
  cmd: '再写',
  equalityName: 'conj_inv',
  occurrence: 1
});

const finalized2 = session.finalize(frame2);
console.log(`Conjugate involution proof: ${finalized2.ok ? 'SUCCESS' : 'FAILED'}`);

console.log('\n=== Final Serialized Proof ===\n');
console.log(session.serializeAll());

/*
Expected output shows:
1. The difference of squares identity proven using algebraic simplification
2. The conjugate involution property proven using rewrite rules
3. A self-contained proof script with all steps
*/
