import ProofSession from './proof-session';
import { Expr } from './prover-core';

// Set up logging
const log = (message: string) => {
  console.log(`[PROOF] ${message}`);
};

function runDemo() {
  log("=".repeat(60));
  log("CHALLENGE: Prove sqnorm (O - A) = sqnorm (O - B)");
  log("=".repeat(60));

  // Variables: M A B O
  const M = Expr.var('M');
  const A = Expr.var('A');
  const B = Expr.var('B');
  const O = Expr.var('O');

  // Context facts:
  // hd: A ≠ B
  // hm: M = (A + B) / 2
  // hp: Re ((O - M) / (A - B)) = 0
  const hypotheses = {
    'hd': Expr.neq(A, B),
    'hm': Expr.eq(M, Expr.div(Expr.add(A, B), Expr.const(2))),
    'hp': Expr.eq(Expr.Re(Expr.div(Expr.sub(O, M), Expr.sub(A, B))), Expr.const(0))
  };

  // Goal: sqnorm (O - A) = sqnorm (O - B)
  const goal = Expr.eq(
    Expr.sqnorm(Expr.sub(O, A)), 
    Expr.sqnorm(Expr.sub(O, B))
  );

  // Create proof session
  const session = new ProofSession(goal, {
    hypotheses: hypotheses,
    logger: log
  });

  log("\nInitial state:");
  log(session.getSummary());

  // Strategy: Use sqnorm definition and properties of complex numbers
  // sqnorm(z) = z * conj(z)
  
  log("\n--- Step 1: Expand sqnorm definitions ---");
  
  // Rewrite left side using sqnorm_def
  const success1 = session.runCommand({
    cmd: '再写',
    occurrence: 1,
    equalityName: 'sqnorm_def'
  });
  log(`Step 1a success: ${success1}`);

  // Rewrite right side using sqnorm_def  
  const success2 = session.runCommand({
    cmd: '再写',
    occurrence: 1,
    equalityName: 'sqnorm_def'
  });
  log(`Step 1b success: ${success2}`);

  log("\n--- Step 2: Work with the Re condition ---");
  
  // The key insight: Re((O - M) / (A - B)) = 0 means (O - M) / (A - B) is purely imaginary
  // This means (O - M) / (A - B) = -conj((O - M) / (A - B))
  // Or equivalently: (O - M) / (A - B) + conj((O - M) / (A - B)) = 0
  // Which by re_def means: 2 * Re((O - M) / (A - B)) = 0
  
  // Create a derived fact from hp using re_def
  const reCondChild = session.startNestedProof(
    Expr.eq(
      Expr.add(
        Expr.div(Expr.sub(O, M), Expr.sub(A, B)),
        Expr.conj(Expr.div(Expr.sub(O, M), Expr.sub(A, B)))
      ),
      Expr.const(0)
    )
  );

  log("\nWorking on derived condition from Re = 0...");
  
  // Use re_def: Re a = (a + conj a) / 2
  const reSuccess1 = reCondChild.runCommand({
    cmd: '重反',
    oldName: 'hp',
    newName: 'hp_rev'
  });
  log(`Re condition reverse success: ${reSuccess1}`);

  const reSuccess2 = reCondChild.runCommand({
    cmd: '再写',
    occurrence: 1,
    equalityName: 're_def'
  });
  log(`Re condition rewrite success: ${reSuccess2}`);

  // Try to solve with field axioms
  const reSuccess3 = reCondChild.runCommand({
    cmd: '多能',
    denomProofs: ['hd'] // A ≠ B implies A - B ≠ 0
  });
  log(`Re condition solve success: ${reSuccess3}`);

  if (reCondChild.isComplete()) {
    session.finalizeNestedProof(reCondChild, 'pure_imaginary');
    log("Successfully proved purely imaginary condition");
  } else {
    log("Re condition proof incomplete - continuing with main proof");
  }

  log("\n--- Step 3: Use symmetry argument ---");
  
  // The key insight is that if (O - M) / (A - B) is purely imaginary,
  // then O lies on the perpendicular bisector of A and B
  // This creates a symmetry that makes |O - A| = |O - B|

  // Try to use substitution with M = (A + B) / 2
  const success3 = session.runCommand({
    cmd: '再写',
    occurrence: 1,
    equalityName: 'hm'
  });
  log(`Substitution success: ${success3}`);

  // Try algebraic manipulation
  const success4 = session.runCommand({
    cmd: '多能',
    denomProofs: ['hd']
  });
  log(`Field axioms success: ${success4}`);

  if (!session.isComplete()) {
    log("\n--- Step 4: Alternative approach with conjugates ---");
    
    // Try expanding conjugates
    const success5 = session.runCommand({
      cmd: '再写',
      occurrence: 1,
      equalityName: 'conj_sub'
    });
    log(`Conjugate expansion success: ${success5}`);

    const success6 = session.runCommand({
      cmd: '再写',
      occurrence: 1,
      equalityName: 'conj_sub'
    });
    log(`Second conjugate expansion success: ${success6}`);

    // Try final algebraic solution
    const success7 = session.runCommand({
      cmd: '多能',
      denomProofs: ['hd']
    });
    log(`Final algebraic attempt success: ${success7}`);
  }

  log("\n" + "=".repeat(60));
  log("PROOF SUMMARY");
  log("=".repeat(60));
  
  log("\nFinal session state:");
  log(session.getSummary());
  
  log("\nIs proof complete?", session.isComplete());
  
  log("\nSerialization summary:");
  log(session.getSerializationSummary());

  log("\n" + "=".repeat(60));
  log("SERIALIZED PROOF (Chinese Syntax)");
  log("=".repeat(60));

  console.log("\n" + session.serializeWithContext());

  log("\n" + "=".repeat(60));
  log("PROOF ANALYSIS");
  log("=".repeat(60));

  if (session.isComplete()) {
    log("✅ PROOF COMPLETE! The theorem has been successfully proven.");
  } else {
    log("⚠️  PROOF INCOMPLETE. This is a challenging theorem that may require:");
    log("   - More sophisticated algebraic manipulation");
    log("   - Additional lemmas about complex number geometry"); 
    log("   - Properties of perpendicular bisectors");
    log("   - The serialization shows the attempted proof steps");
  }

  return session;
}

// Run the demo
if (typeof window !== 'undefined') {
  // Browser environment
  console.log("Running proof demo in browser...");
  const result = runDemo();
  (window as any).proofResult = result;
} else {
  // Node.js environment  
  console.log("Running proof demo in Node.js...");
  runDemo();
}

export { runDemo };
