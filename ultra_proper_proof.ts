import { ProofSession } from './proof-session.js';
import { Expr } from './prover-core.js';

console.log("=== ULTRA-PROPER PROOF: Using only proof commands ===");

// Only the given facts from the problem statement
const M = Expr.var('M');
const A = Expr.var('A');
const B = Expr.var('B');
const O = Expr.var('O');

const hypotheses = {
  'hd': Expr.neq(A, B),
  'hm': Expr.eq(M, Expr.div(Expr.add(A, B), Expr.const(2))),
  'hp': Expr.eq(Expr.Re(Expr.div(Expr.sub(O, M), Expr.sub(A, B))), Expr.const(0))
};

const goal = Expr.eq(
  Expr.sqnorm(Expr.sub(O, A)), 
  Expr.sqnorm(Expr.sub(O, B))
);

const session = new ProofSession(goal, { hypotheses, logger: console.log });

// Step 1: Prove that the denominator is non-zero
const denom_is_nonzero_goal = Expr.neq(Expr.sub(A, B), Expr.const(0));
const denom_session = session.startNestedProof(denom_is_nonzero_goal);

denom_session.runCommand({ cmd: '反证', hypName: 'hd' });

// After 反证, the new goal is A = B, and the hypothesis 'hd' is replaced with A - B = 0.
// Let's try to reverse the hypothesis to see if it helps the rewrite engine.
denom_session.runCommand({ cmd: '重反', oldName: 'hd', newName: 'hd_rev' });

const b0 = denom_session.startNestedProof(Expr.eq(B, Expr.add(B, Expr.const(0))));
b0.runCommand({cmd: "多能"});
denom_session.finalizeNestedProof(b0, "b0");
denom_session.runCommand({cmd:"再写", equalityName: "b0"})

// We can rewrite the goal using the new hypothesis.
denom_session.runCommand({ cmd: '再写', equalityName: 'hd_rev' });
denom_session.runCommand({cmd: "多能"});

if (denom_session.isComplete()) {
  console.log('Denominator proof successful!');
  session.finalizeNestedProof(denom_session, 'denom_ok');
} else {
  console.log('Denominator proof failed.');
  console.log(denom_session.serialize());
}

// Step 2: Use 多能 with the proven denominator
session.runCommand({ cmd: '多能', denomProofs: ['denom_ok'] });

if (session.isComplete()) {
  console.log('\n🎉 PROOF COMPLETED! 🎉');
} else {
  console.log('\n❌ PROOF FAILED. ❌');
}

console.log('\nFinal proof:');
console.log(session.serialize());
