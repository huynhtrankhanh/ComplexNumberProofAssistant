import { ProofSession } from './proof-session.js';
import { Expr, factToReadable } from './prover-core.js';

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

const printGoal = () => console.log("Current Goal:", factToReadable(session.getGoal()));

const simplify_conj = (session: ProofSession) => {
    let changed = true;
    while(changed) {
        changed = false;
        if(session.runCommand({ cmd: '再写', equalityName: 'conj_div' })) changed = true;
        if(session.runCommand({ cmd: '再写', equalityName: 'conj_mul' })) changed = true;
        if(session.runCommand({ cmd: '再写', equalityName: 'conj_sub' })) changed = true;
        if(session.runCommand({ cmd: '再写', equalityName: 'conj_add' })) changed = true;
        if(session.runCommand({ cmd: '再写', equalityName: 'conj_neg' })) changed = true;
        if(session.runCommand({ cmd: '再写', equalityName: 'conj_inv' })) changed = true;
    }
}

// It is your task to complete this proof using the prover-core.ts and proof-session.ts API.
// When you compile, put your files in dist/, according to tsconfig.json. Don't litter your compilation artifacts.
// You must complete this proof. It is mathematically possible to complete the proof with the given APIs.

printGoal();

// Step 1: Expand sqnorm definitions on both sides
console.log("\n=== Step 1: Expand sqnorm definitions ===");
session.runCommand({ cmd: '再写', equalityName: 'sqnorm_def' });
printGoal();

// The RHS still has sqnorm, so expand it
session.runCommand({ cmd: '再写', equalityName: 'sqnorm_def' });
printGoal();

// Step 2: Expand conjugate operations 
console.log("\n=== Step 2: Expand conjugates ===");
simplify_conj(session);
printGoal();

// Step 3: Now we have the goal in expanded form
// Let's work to show that sqnorm(O-A) = sqnorm(O-B) by showing
// (O-A)*conj(O-A) = (O-B)*conj(O-B)
// This is equivalent to showing |O-A|² = |O-B|²

// The key insight is to use the fact that Re((O-M)/(A-B)) = 0
// This means O-M is perpendicular to A-B

// Step 4: Use algebraic approach - try the 多能 command directly
console.log("\n=== Step 3: Try direct algebraic proof ===");
// We need to prove A-B ≠ 0 first for denominator
session.runCommand({ cmd: '不利', newName: 'ab_neq_zero', component: Expr.sub(A, B), hypothesis: 'hd' });

// Now try 多能 with the denominator proof
session.runCommand({ cmd: '多能', denomProofs: ['ab_neq_zero'] });

// Check if proof is complete
if (session.isComplete()) {
    console.log("\n🎉 PROOF COMPLETED! 🎉");
    console.log("Perpendicular bisector theorem proven!");
} else {
    console.log("\n❌ Direct approach failed. Trying manual expansion...");
    printGoal();
    
    // Manual approach: expand everything and use the perpendicular property
    console.log("\n=== Step 4: Manual algebraic manipulation ===");
    
    // Let's substitute M = (A + B) / 2 
    session.runCommand({ cmd: '再写', equalityName: 'hm' });
    printGoal();
    
    // Try again with 多能
    session.runCommand({ cmd: '多能', denomProofs: ['ab_neq_zero'] });
    
    if (session.isComplete()) {
        console.log("\n🎉 PROOF COMPLETED! 🎉");
        console.log("Perpendicular bisector theorem proven!");
    } else {
        console.log("\n❌ Still incomplete. Available facts:", Object.keys(session.getHypotheses()));
        printGoal();
    }
}
