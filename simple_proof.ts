import { ProofSession } from './proof-session.js';
import { Expr } from './prover-core.js';

console.log('=== SIMPLE PROOF: (x+a)² - (x-a)² = 4*a*x ===');

const x = Expr.var('x');
const a = Expr.var('a');

// Goal: (x+a)² - (x-a)² = 4*a*x
const goal = Expr.eq(
  Expr.sub(
    Expr.pow(Expr.add(x, a), Expr.const(2)),
    Expr.pow(Expr.sub(x, a), Expr.const(2))
  ),
  Expr.mul(Expr.const(4), Expr.mul(a, x))
);

const session = new ProofSession(goal, {
  hypotheses: {},
  logger: (msg: string) => console.log(msg)
});

console.log('Goal:', goal);
console.log('Using 多能 command directly...');

let success = session.runCommand({
  cmd: '多能',
  denomProofs: []
});

if (success) {
  console.log('\n🎉 PROOF COMPLETED! 🎉');
  console.log('Simple algebraic identity proven using 多能');
} else {
  console.log('\n❌ 多能 failed. Trying step by step...');
}

console.log('\nFinal status:', session.isComplete());
console.log('Session summary:', session.getSummary());