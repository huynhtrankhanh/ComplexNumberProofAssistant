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
