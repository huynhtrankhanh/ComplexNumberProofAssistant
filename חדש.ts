import { ProofSession } from './proof-session.js';
import { Expr } from './prover-core.js';

// Goal: (a-b) / (a+a-b-b) = 1/2
const goal = Expr.eq(
  Expr.div(
    Expr.sub(Expr.var('a'), Expr.var('b')),
    Expr.sub(
      Expr.add(Expr.var('a'), Expr.var('a')),
      Expr.add(Expr.var('b'), Expr.var('b'))
    )
  ),
  Expr.div(Expr.const(1), Expr.const(2))
);

// Hypothesis: a ≠ b  which implies a-b ≠ 0
const hypothesis = {
  'H1': Expr.neq(Expr.sub(Expr.var('a'), Expr.var('b')), Expr.const(0))
};

// Create a new proof session
const session = new ProofSession(goal, {
  hypotheses: hypothesis,
  logger: console.log,
});

console.log('Starting proof for: (a-b)/(a+a-b-b) = 1/2');

// 1. Prove that the denominator is equal to 2*(a-b)
const denom = Expr.sub(
  Expr.add(Expr.var('a'), Expr.var('a')),
  Expr.add(Expr.var('b'), Expr.var('b'))
);
const denomSimplifiedGoal = Expr.eq(denom, Expr.mul(Expr.const(2), Expr.sub(Expr.var('a'), Expr.var('b'))));
const nestedProof1 = session.startNestedProof(denomSimplifiedGoal);
nestedProof1.runCommand({ cmd: '多能' });
if (nestedProof1.isComplete()) {
    session.finalizeNestedProof(nestedProof1, 'denom_simplified');
    console.log("Proved: a+a-b-b = 2*(a-b)");
} else {
    console.log("Failed to prove a+a-b-b = 2*(a-b)");
    process.exit(1);
}

// 2. Prove that 2*(a-b) is not zero
const denom2 = Expr.mul(Expr.const(2), Expr.sub(Expr.var('a'), Expr.var('b')));
const denom2IsNotZeroGoal = Expr.neq(denom2, Expr.const(0));
const nestedProof2 = session.startNestedProof(denom2IsNotZeroGoal);
nestedProof2.runCommand({ cmd: '反证', hypName: 'H1' });

const subNestedProof2 = nestedProof2.startNestedProof(
    Expr.eq(
        Expr.sub(Expr.var('a'), Expr.var('b')),
        Expr.div(
            Expr.mul(Expr.const(2), Expr.sub(Expr.var('a'), Expr.var('b'))),
            Expr.const(2)
        )
    )
);
subNestedProof2.runCommand({ cmd: '多能' });
if (subNestedProof2.isComplete()) {
    nestedProof2.finalizeNestedProof(subNestedProof2, 'div_by_2');
} else {
    console.log("Failed to prove a-b = (2*(a-b))/2");
    process.exit(1);
}

nestedProof2.runCommand({ cmd: '再写', equalityName: 'div_by_2', occurrence: 1 });
nestedProof2.runCommand({ cmd: '再写', equalityName: 'H1', occurrence: 1 });
nestedProof2.runCommand({ cmd: '确定' });

if (nestedProof2.isComplete()) {
    session.finalizeNestedProof(nestedProof2, 'denom_is_nonzero');
    console.log("Proved: 2*(a-b) != 0");
} else {
    console.log("Failed to prove 2*(a-b) != 0");
    console.log('Final Goal in nestedProof2:', JSON.stringify(nestedProof2.getGoal(), null, 2));
    process.exit(1);
}

// 3. Rewrite the main goal and prove it
session.runCommand({ cmd: '再写', equalityName: 'denom_simplified' });
session.runCommand({ cmd: '多能', denomProofs: ['denom_is_nonzero'] });

if (session.isComplete()) {
  console.log('Proof complete!');
} else {
  console.log('Proof failed.');
  console.log('Final Goal:', JSON.stringify(session.getGoal(), null, 2));
}