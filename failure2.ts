import { ProofSession } from './proof-session.js';
import { Expr } from './prover-core.js';

console.log("=== Minimal Reproduction of Prover Failure 2 ===");

const O = Expr.var('O');
const M = Expr.var('M');
const A = Expr.var('A');
const B = Expr.var('B');

// Goal: -4*Re((O-M)*conj((A-B)/2)) = -2*Re((O-M)*conj(A-B))
const goal = Expr.eq(
    Expr.mul(Expr.const(-4), Expr.Re(Expr.mul(Expr.sub(O,M), Expr.conj(Expr.div(Expr.sub(A,B), Expr.const(2)))))),
    Expr.mul(Expr.const(-2), Expr.Re(Expr.mul(Expr.sub(O,M), Expr.conj(Expr.sub(A,B)))))
);

const session = new ProofSession(goal, { logger: console.log });

console.log("Attempting to prove the simplification lemma with corrected rewrite steps...");

// Expand LHS
session.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_div', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_sub', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_mul', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_inv', occurrence: 1 });

// Expand RHS
session.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_sub', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_mul', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_inv', occurrence: 1 });

// Now, with both sides fully expanded, the field solver should succeed.
session.runCommand({ cmd: '多能' });

if (session.isComplete()) {
    console.log("Proof succeeded!");
} else {
    console.log("Proof failed.");
    console.log("Final Goal:", JSON.stringify(session.getGoal(), null, 2));
}