"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var proof_session_js_1 = require("./proof-session.js");
var prover_core_js_1 = require("./prover-core.js");
console.log("=== ULTRA-PROPER PROOF: Using only proof commands ===");
// Only the given facts from the problem statement
var M = prover_core_js_1.Expr.var('M');
var A = prover_core_js_1.Expr.var('A');
var B = prover_core_js_1.Expr.var('B');
var O = prover_core_js_1.Expr.var('O');
var hypotheses = {
    'hd': prover_core_js_1.Expr.neq(A, B),
    'hm': prover_core_js_1.Expr.eq(M, prover_core_js_1.Expr.div(prover_core_js_1.Expr.add(A, B), prover_core_js_1.Expr.const(2))),
    'hp': prover_core_js_1.Expr.eq(prover_core_js_1.Expr.Re(prover_core_js_1.Expr.div(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.sub(A, B))), prover_core_js_1.Expr.const(0))
};
var goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.sub(O, A)), prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.sub(O, B)));
var session = new proof_session_js_1.ProofSession(goal, { hypotheses: hypotheses, logger: console.log });
// Lemma expand: sqnorm(x-y) - sqnorm(x+y) = -4*Re(x*conj(y))
var x = prover_core_js_1.Expr.var('x');
var y = prover_core_js_1.Expr.var('y');
// To prove the main lemma, we need to expand both sides. Let's prove the expansion lemmas first.
// Lemma for LHS expansion
var lemma_lhs_goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.sub(prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.sub(x, y)), prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.add(x, y))), prover_core_js_1.Expr.neg(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(2), prover_core_js_1.Expr.add(prover_core_js_1.Expr.mul(x, prover_core_js_1.Expr.conj(y)), prover_core_js_1.Expr.mul(prover_core_js_1.Expr.conj(x), y)))));
var nestedProof_lhs = session.startNestedProof(lemma_lhs_goal);
nestedProof_lhs.runCommand({ cmd: '再写', equalityName: 'sqnorm_def' });
nestedProof_lhs.runCommand({ cmd: '再写', equalityName: 'sqnorm_def' });
nestedProof_lhs.runCommand({ cmd: '再写', equalityName: 'conj_sub' });
nestedProof_lhs.runCommand({ cmd: '再写', equalityName: 'conj_add' });
nestedProof_lhs.runCommand({ cmd: '多能' });
if (nestedProof_lhs.isComplete()) {
    session.finalizeNestedProof(nestedProof_lhs, 'lemma_lhs');
    console.log("Proved lemma_lhs");
}
else {
    console.log("Failed to prove lemma_lhs");
    process.exit(1);
}
// Lemma for RHS expansion
var lemma_rhs_goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-4), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(x, prover_core_js_1.Expr.conj(y)))), prover_core_js_1.Expr.neg(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(2), prover_core_js_1.Expr.add(prover_core_js_1.Expr.mul(x, prover_core_js_1.Expr.conj(y)), prover_core_js_1.Expr.mul(prover_core_js_1.Expr.conj(x), y)))));
var nestedProof_rhs = session.startNestedProof(lemma_rhs_goal);
nestedProof_rhs.runCommand({ cmd: '再写', equalityName: 're_def' });
nestedProof_rhs.runCommand({ cmd: '多能' });
if (nestedProof_rhs.isComplete()) {
    session.finalizeNestedProof(nestedProof_rhs, 'lemma_rhs');
    console.log("Proved lemma_rhs");
}
else {
    console.log("Failed to prove lemma_rhs");
    process.exit(1);
}
// Now prove the main expansion lemma using the LHS and RHS lemmas
var lemma_expand_goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.sub(prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.sub(x, y)), prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.add(x, y))), prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-4), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(x, prover_core_js_1.Expr.conj(y)))));
var nestedProof_expand = session.startNestedProof(lemma_expand_goal);
nestedProof_expand.runCommand({ cmd: '再写', equalityName: 'lemma_lhs' });
nestedProof_expand.runCommand({ cmd: '再写', equalityName: 'lemma_rhs' });
if (nestedProof_expand.isComplete()) {
    session.finalizeNestedProof(nestedProof_expand, 'lemma_expand');
    console.log("Proved lemma_expand");
}
else {
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
var lemma_re_simplify_goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-4), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.conj(prover_core_js_1.Expr.div(prover_core_js_1.Expr.sub(A, B), prover_core_js_1.Expr.const(2)))))), prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-2), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.conj(prover_core_js_1.Expr.sub(A, B))))));
var nestedProof_re_simplify = session.startNestedProof(lemma_re_simplify_goal);
nestedProof_re_simplify.runCommand({ cmd: '多能' });
if (nestedProof_re_simplify.isComplete()) {
    session.finalizeNestedProof(nestedProof_re_simplify, 'lemma_re_simplify');
    console.log("Proved lemma_re_simplify");
}
else {
    console.log("Failed to prove lemma_re_simplify");
    process.exit(1);
}
session.runCommand({ cmd: '再写', equalityName: 'lemma_re_simplify' });
// Now goal is -2*Re((O-M)*conj(A-B)) = 0, which is Re((O-M)*conj(A-B)) = 0
// Now, connect to hp: Re((O-M)/(A-B)) = 0
var ab_neq_0_goal = prover_core_js_1.Expr.neq(prover_core_js_1.Expr.sub(A, B), prover_core_js_1.Expr.const(0));
var nestedProof_ab = session.startNestedProof(ab_neq_0_goal, { hypotheses: { 'A_eq_B': prover_core_js_1.Expr.eq(A, B) } });
nestedProof_ab.runCommand({ cmd: '反证', hypName: 'hd' });
nestedProof_ab.runCommand({ cmd: '再写', equalityName: 'A_eq_B' });
nestedProof_ab.runCommand({ cmd: '多能' });
if (nestedProof_ab.isComplete()) {
    session.finalizeNestedProof(nestedProof_ab, 'ab_neq_0');
}
var lemma_final_goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.conj(prover_core_js_1.Expr.sub(A, B)))), prover_core_js_1.Expr.mul(prover_core_js_1.Expr.Re(prover_core_js_1.Expr.div(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.sub(A, B))), prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.sub(A, B))));
var nestedProof_final = session.startNestedProof(lemma_final_goal);
nestedProof_final.runCommand({ cmd: '多能', denomProofs: ['ab_neq_0'] });
if (nestedProof_final.isComplete()) {
    session.finalizeNestedProof(nestedProof_final, 'lemma_final');
    console.log("Proved lemma_final");
}
else {
    console.log("Failed to prove lemma_final");
    process.exit(1);
}
session.runCommand({ cmd: '再写', equalityName: 'lemma_final' });
session.runCommand({ cmd: '再写', equalityName: 'hp' });
session.runCommand({ cmd: '多能' });
if (session.isComplete()) {
    console.log("Proof complete!");
}
else {
    console.log("Proof failed.");
}
