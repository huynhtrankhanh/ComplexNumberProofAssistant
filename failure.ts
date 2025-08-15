
import { ProofSession } from './proof-session.js';
import { Expr } from './prover-core.js';

console.log("=== Minimal Reproduction of Prover Failure ===");

const z = Expr.var('z');

// Goal: Re(z/2) = Re(z)/2
const goal = Expr.eq(Expr.Re(Expr.div(z, Expr.const(2))), Expr.div(Expr.Re(z), Expr.const(2)));

const session = new ProofSession(goal, { logger: console.log });

console.log("Attempting to prove: Re(z/2) = Re(z)/2");

// Expand both sides of the equation using the definition of Re
session.runCommand({ cmd: '再写', equalityName: 're_def' });
session.runCommand({ cmd: '再写', equalityName: 're_def' });

// Simplify the conj expression on the LHS
session.runCommand({ cmd: '再写', equalityName: 'conj_div' });

// At this point, the two sides are algebraically identical.
// LHS: (z/2 + conj(z)/2) / 2
// RHS: ((z + conj(z)) / 2) / 2
// The 多能 command should be able to simplify this.
session.runCommand({ cmd: '多能' });

if (session.isComplete()) {
    console.log("Proof succeeded!");
} else {
    console.log("Proof failed as expected.");
    console.log("Final Goal:", JSON.stringify(session.getGoal(), null, 2));
}
