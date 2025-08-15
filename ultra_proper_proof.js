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
var printGoal = function () { return console.log("Current Goal:", (0, prover_core_js_1.factToReadable)(session.getGoal())); };
var simplify_conj = function (session) {
    var changed = true;
    while (changed) {
        changed = false;
        if (session.runCommand({ cmd: '再写', equalityName: 'conj_div' }))
            changed = true;
        if (session.runCommand({ cmd: '再写', equalityName: 'conj_mul' }))
            changed = true;
        if (session.runCommand({ cmd: '再写', equalityName: 'conj_sub' }))
            changed = true;
        if (session.runCommand({ cmd: '再写', equalityName: 'conj_add' }))
            changed = true;
        if (session.runCommand({ cmd: '再写', equalityName: 'conj_neg' }))
            changed = true;
        if (session.runCommand({ cmd: '再写', equalityName: 'conj_inv' }))
            changed = true;
    }
};
// Lemma 1: A = M + (A-B)/2
var lemma1Goal = prover_core_js_1.Expr.eq(A, prover_core_js_1.Expr.add(M, prover_core_js_1.Expr.div(prover_core_js_1.Expr.sub(A, B), prover_core_js_1.Expr.const(2))));
var nestedProof1 = session.startNestedProof(lemma1Goal);
nestedProof1.runCommand({ cmd: '再写', equalityName: 'hm' });
nestedProof1.runCommand({ cmd: '多能' });
if (nestedProof1.isComplete()) {
    session.finalizeNestedProof(nestedProof1, 'lemma1');
}
else {
    process.exit(1);
}
// Lemma 2: B = M - (A-B)/2
var lemma2Goal = prover_core_js_1.Expr.eq(B, prover_core_js_1.Expr.sub(M, prover_core_js_1.Expr.div(prover_core_js_1.Expr.sub(A, B), prover_core_js_1.Expr.const(2))));
var nestedProof2 = session.startNestedProof(lemma2Goal);
nestedProof2.runCommand({ cmd: '再写', equalityName: 'hm' });
nestedProof2.runCommand({ cmd: '多能' });
if (nestedProof2.isComplete()) {
    session.finalizeNestedProof(nestedProof2, 'lemma2');
}
else {
    process.exit(1);
}
var x = prover_core_js_1.Expr.var('x');
var y = prover_core_js_1.Expr.var('y');
// Lemma expand: sqnorm(x-y) - sqnorm(x+y) = -4*Re(x*conj(y))
var lemma_expand_goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.sub(prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.sub(x, y)), prover_core_js_1.Expr.sqnorm(prover_core_js_1.Expr.add(x, y))), prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-4), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(x, prover_core_js_1.Expr.conj(y)))));
var nestedProof_expand = session.startNestedProof(lemma_expand_goal);
simplify_conj(nestedProof_expand);
nestedProof_expand.runCommand({ cmd: '再写', equalityName: 'sqnorm_def' });
nestedProof_expand.runCommand({ cmd: '再写', equalityName: 're_def' });
simplify_conj(nestedProof_expand);
nestedProof_expand.runCommand({ cmd: '多能' });
if (nestedProof_expand.isComplete()) {
    session.finalizeNestedProof(nestedProof_expand, 'lemma_expand');
}
else {
    process.exit(1);
}
// Back to the main proof
printGoal();
session.runCommand({ cmd: '再写', equalityName: 'lemma1' });
printGoal();
session.runCommand({ cmd: '再写', equalityName: 'lemma2' });
printGoal();
// I will manually transform the goal from a = b to a - b = 0
var current_goal = session.getGoal();
session.runCommand({ cmd: '再写', equalityName: 'lemma_expand' });
printGoal();
// Now the goal is -4 * Re((O - M) * conj(((A - B) / 2))) = 0
// which is Re((O-M)*conj(A-B)) = 0
var lemma_re_simplify_goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-4), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.conj(prover_core_js_1.Expr.div(prover_core_js_1.Expr.sub(A, B), prover_core_js_1.Expr.const(2)))))), prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-2), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.conj(prover_core_js_1.Expr.sub(A, B))))));
var nestedProof_re_simplify = session.startNestedProof(lemma_re_simplify_goal);
simplify_conj(nestedProof_re_simplify);
nestedProof_re_simplify.runCommand({ cmd: '再写', equalityName: 're_def' });
nestedProof_re_simplify.runCommand({ cmd: '再写', equalityName: 're_def' });
simplify_conj(nestedProof_re_simplify);
nestedProof_re_simplify.runCommand({ cmd: '多能' });
if (nestedProof_re_simplify.isComplete()) {
    session.finalizeNestedProof(nestedProof_re_simplify, 'lemma_re_simplify');
}
else {
    process.exit(1);
}
session.runCommand({ cmd: '再写', equalityName: 'lemma_re_simplify' });
printGoal();
// Now goal is -2*Re((O-M)*conj(A-B)) = 0, which is Re((O-M)*conj(A-B)) = 0
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
}
else {
    process.exit(1);
}
session.runCommand({ cmd: '再写', equalityName: 'lemma_final' });
printGoal();
session.runCommand({ cmd: '再写', equalityName: 'hp' });
printGoal();
session.runCommand({ cmd: '多能' });
if (session.isComplete()) {
    console.log("Proof complete!");
}
else {
    console.log("Proof failed.");
}
