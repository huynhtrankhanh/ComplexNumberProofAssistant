#!/usr/bin/env node

import { BatchModeValidator } from './batch-mode.js';
import { argv, exit } from 'process';

/**
 * Command-line interface for batch mode validation
 */
async function main() {
  if (argv.length < 4) {
    console.error('Usage: batch-validator <input-file> <proof-file>');
    console.error('');
    console.error('Arguments:');
    console.error('  input-file   JSONL file with hypotheses and goal');
    console.error('  proof-file   JSONL file with proof commands');
    console.error('');
    console.error('Example:');
    console.error('  batch-validator examples/problem1_input.jsonl examples/problem1_proof.jsonl');
    exit(1);
  }

  const inputFile = argv[2];
  const proofFile = argv[3];

  console.log('=== BATCH MODE PROOF VALIDATOR ===');
  console.log(`Input file: ${inputFile}`);
  console.log(`Proof file: ${proofFile}`);
  console.log('');

  const validator = new BatchModeValidator((msg) => console.log(`[LOG] ${msg}`));

  try {
    const result = await validator.processBatch(inputFile, proofFile);
    
    console.log('');
    console.log(validator.formatResult(result));
    
    // Exit with non-zero code if there are errors
    if (result.evaluation_score.error_count > 0) {
      exit(1);
    } else {
      console.log('\n✅ Batch processing completed successfully!');
      exit(0);
    }
  } catch (error) {
    console.error('\n❌ Batch processing failed:');
    console.error((error as Error).message);
    exit(1);
  }
}

main().catch(console.error);