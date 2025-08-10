// example_proof.ts
// Example: Proving that if a * b / c ≠ 0, then a ≠ 0, b ≠ 0, and c ≠ 0

import { ProofSession, Expr } from './main/index.js';

// Create a new proof session
const session = new ProofSession();
session.setLogger(console.log);

// Add the initial hypothesis: a * b / c ≠ 0
session.addGlobalFact('hypothesis', 
  Expr.neq(
    Expr.div(
      Expr.mul(Expr.var('a'), Expr.var('b')),
      Expr.var('c')
    ),
    Expr.const(0)
  )
);

console.log('\n=== Starting Proof ===\n');

// Proof 1: Prove a ≠ 0
const frame1 = session.startHave('a_nonzero', 
  Expr.neq(Expr.var('a'), Expr.const(0))
);

session.addCommand(frame1, {
  cmd: '不利',
  newName: 'a_neq_0',
  component: Expr.var('a'),
  hypothesis: 'hypothesis'
});

const result1 = session.finalize(frame1);
console.log(`Proof 1 (a ≠ 0): ${result1.ok ? 'SUCCESS' : 'FAILED'}`);

// Proof 2: Prove b ≠ 0
const frame2 = session.startHave('b_nonzero',
  Expr.neq(Expr.var('b'), Expr.const(0))
);

session.addCommand(frame2, {
  cmd: '不利',
  newName: 'b_neq_0',
  component: Expr.var('b'),
  hypothesis: 'hypothesis'
});

const result2 = session.finalize(frame2);
console.log(`Proof 2 (b ≠ 0): ${result2.ok ? 'SUCCESS' : 'FAILED'}`);

// Proof 3: Prove c ≠ 0
const frame3 = session.startHave('c_nonzero',
  Expr.neq(Expr.var('c'), Expr.const(0))
);

session.addCommand(frame3, {
  cmd: '不利',
  newName: 'c_neq_0',
  component: Expr.var('c'),
  hypothesis: 'hypothesis'
});

const result3 = session.finalize(frame3);
console.log(`Proof 3 (c ≠ 0): ${result3.ok ? 'SUCCESS' : 'FAILED'}`);

// Export the complete proof
console.log('\n=== Serialized Proof ===\n');
console.log(session.serializeAll());

// List all proven facts
console.log('\n=== Proven Facts ===');
const facts = session.getGlobalContextKeys();
facts.forEach(fact => console.log(`- ${fact}`));

/*
Expected output:

有 hypothesis : a * b / c ≠ 0 是 // seeded
有 a_nonzero : a ≠ 0 是
  有 a_neq_0 : a ≠ 0 是 不利 hypothesis
有 b_nonzero : b ≠ 0 是
  有 b_neq_0 : b ≠ 0 是 不利 hypothesis  
有 c_nonzero : c ≠ 0 是
  有 c_neq_0 : c ≠ 0 是 不利 hypothesis
*/
