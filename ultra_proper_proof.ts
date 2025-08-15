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

// Lemma expand: sqnorm(x-y) - sqnorm(x+y) = -4*Re(x*conj(y))
const x = Expr.var('x');
const y = Expr.var('y');

// To prove the main lemma, we need to expand both sides. Let's prove the expansion lemmas first.
// Lemma for LHS expansion
const lemma_lhs_goal = Expr.eq(
    Expr.sub(Expr.sqnorm(Expr.sub(x,y)), Expr.sqnorm(Expr.add(x,y))),
    Expr.neg(Expr.mul(Expr.const(2), Expr.add(Expr.mul(x, Expr.conj(y)), Expr.mul(Expr.conj(x), y))))
);
const nestedProof_lhs = session.startNestedProof(lemma_lhs_goal);
nestedProof_lhs.runCommand({ cmd: '再写', equalityName: 'sqnorm_def'});
nestedProof_lhs.runCommand({ cmd: '再写', equalityName: 'sqnorm_def'});
nestedProof_lhs.runCommand({ cmd: '再写', equalityName: 'conj_sub'});
nestedProof_lhs.runCommand({ cmd: '再写', equalityName: 'conj_add'});
nestedProof_lhs.runCommand({ cmd: '多能' });
if (nestedProof_lhs.isComplete()) {
    session.finalizeNestedProof(nestedProof_lhs, 'lemma_lhs');
    console.log("Proved lemma_lhs");
} else {
    console.log("Failed to prove lemma_lhs");
    process.exit(1);
}

// Lemma for RHS expansion
const lemma_rhs_goal = Expr.eq(
    Expr.mul(Expr.const(-4), Expr.Re(Expr.mul(x, Expr.conj(y)))),
    Expr.neg(Expr.mul(Expr.const(2), Expr.add(Expr.mul(x, Expr.conj(y)), Expr.mul(Expr.conj(x), y))))
);
const nestedProof_rhs = session.startNestedProof(lemma_rhs_goal);
nestedProof_rhs.runCommand({ cmd: '再写', equalityName: 're_def' });
nestedProof_rhs.runCommand({ cmd: '多能' });
if (nestedProof_rhs.isComplete()) {
    session.finalizeNestedProof(nestedProof_rhs, 'lemma_rhs');
    console.log("Proved lemma_rhs");
} else {
    console.log("Failed to prove lemma_rhs");
    process.exit(1);
}

// Now prove the main expansion lemma using the LHS and RHS lemmas
const lemma_expand_goal = Expr.eq(
    Expr.sub(Expr.sqnorm(Expr.sub(x,y)), Expr.sqnorm(Expr.add(x,y))),
    Expr.mul(Expr.const(-4), Expr.Re(Expr.mul(x, Expr.conj(y))))
);
const nestedProof_expand = session.startNestedProof(lemma_expand_goal);
nestedProof_expand.runCommand({ cmd: '再写', equalityName: 'lemma_lhs' });
nestedProof_expand.runCommand({ cmd: '再写', equalityName: 'lemma_rhs' });
if (nestedProof_expand.isComplete()) {
    session.finalizeNestedProof(nestedProof_expand, 'lemma_expand');
    console.log("Proved lemma_expand");
} else {
    console.log("Failed to prove lemma_expand");
    process.exit(1);
}

// Now, back to the main proof.
// The goal is sqnorm(O-A) = sqnorm(O-B), which is sqnorm(O-A) - sqnorm(O-B) = 0
session.runCommand({ cmd: '再写', equalityName: 'lemma1' });
session.runCommand({ cmd: '再写', equalityName: 'lemma2' });

// After rewrite with lemma1 and lemma2, goal is sqnorm((O-M)-(A-B)/2) = sqnorm((O-M)+(A-B)/2)
// which is sqnorm((O-M)-(A-B)/2) - sqnorm((O-M)+(A-B)/2) = 0
// Let x = O-M and y = (A-B)/2. Apply lemma_expand
session.runCommand({ cmd: '再写', equalityName: 'lemma_expand' });

// Now goal is -4*Re((O-M)*conj((A-B)/2)) = 0
// which is Re((O-M)*conj(A-B)) = 0
// Let's prove this simplification
const lemma_re_simplify_goal = Expr.eq(
    Expr.mul(Expr.const(-4), Expr.Re(Expr.mul(Expr.sub(O,M), Expr.conj(Expr.div(Expr.sub(A,B), Expr.const(2)))))),
    Expr.mul(Expr.const(-2), Expr.Re(Expr.mul(Expr.sub(O,M), Expr.conj(Expr.sub(A,B)))))
);
const nestedProof_re_simplify = session.startNestedProof(lemma_re_simplify_goal);
nestedProof_re_simplify.runCommand({ cmd: '多能' });
if (nestedProof_re_simplify.isComplete()) {
    session.finalizeNestedProof(nestedProof_re_simplify, 'lemma_re_simplify');
    console.log("Proved lemma_re_simplify");
} else {
    console.log("Failed to prove lemma_re_simplify");
    process.exit(1);
}

session.runCommand({ cmd: '再写', equalityName: 'lemma_re_simplify' });

// Now goal is -2*Re((O-M)*conj(A-B)) = 0, which is Re((O-M)*conj(A-B)) = 0
// Now, connect to hp: Re((O-M)/(A-B)) = 0
const ab_neq_0_goal = Expr.neq(Expr.sub(A,B), Expr.const(0));
const nestedProof_ab = session.startNestedProof(ab_neq_0_goal, {hypotheses: {'A_eq_B': Expr.eq(A,B)}});
nestedProof_ab.runCommand({cmd: '反证', hypName: 'hd'});
nestedProof_ab.runCommand({cmd: '再写', equalityName: 'A_eq_B'});
nestedProof_ab.runCommand({cmd: '多能'});
if (nestedProof_ab.isComplete()) {
    session.finalizeNestedProof(nestedProof_ab, 'ab_neq_0');
}

const lemma_final_goal = Expr.eq(
    Expr.Re(Expr.mul(Expr.sub(O,M), Expr.conj(Expr.sub(A,B)))),
    Expr.mul(Expr.Re(Expr.div(Expr.sub(O,M), Expr.sub(A,B))), Expr.sqnorm(Expr.sub(A,B)))
);
const nestedProof_final = session.startNestedProof(lemma_final_goal);
nestedProof_final.runCommand({ cmd: '多能', denomProofs:['ab_neq_0'] });
if (nestedProof_final.isComplete()) {
    session.finalizeNestedProof(nestedProof_final, 'lemma_final');
    console.log("Proved lemma_final");
} else {
    console.log("Failed to prove lemma_final");
    process.exit(1);
}

session.runCommand({ cmd: '再写', equalityName: 'lemma_final' });
session.runCommand({ cmd: '再写', equalityName: 'hp' });
session.runCommand({ cmd: '多能' });

if (session.isComplete()) {
    console.log("Proof complete!");
} else {
    console.log("Proof failed.");
}