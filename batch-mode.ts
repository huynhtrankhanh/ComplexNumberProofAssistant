import { readFileSync } from 'fs';
import { ProofSession } from './proof-session.js';
import type { ProofSessionOptions } from './proof-session.js';
import { factToReadable } from './prover-core.js';
import type { Fact, Command } from './prover-core.js';

/**
 * Batch mode input format for hypotheses and goal
 */
export interface BatchInput {
  hypotheses: Record<string, Fact>;
  goal: Fact;
}

/**
 * Batch mode proof commands format
 */
export interface BatchCommand {
  command: Command;
}

/**
 * Error information for batch processing
 */
export interface BatchError {
  line: number;
  command?: Command;
  message: string;
  type: 'parse_error' | 'command_error' | 'validation_error';
}

/**
 * Evaluation score for batch processing
 */
export interface EvaluationScore {
  error_count: number;
  proved: 0 | 1;
}

/**
 * Result of batch mode processing
 */
export interface BatchResult {
  evaluation_score: EvaluationScore;
  errors: BatchError[];
  session_summary?: string;
}

/**
 * Batch mode validator and processor
 */
export class BatchModeValidator {
  private logger: (message: string) => void;

  constructor(logger: (message: string) => void = () => {}) {
    this.logger = logger;
  }

  /**
   * Parse JSONL file content into an array of objects
   */
  private parseJsonl<T>(content: string): { data: T[], errors: BatchError[] } {
    const lines = content.trim().split('\n');
    const data: T[] = [];
    const errors: BatchError[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue; // Skip empty lines

      try {
        const parsed = JSON.parse(line) as T;
        data.push(parsed);
      } catch (error) {
        errors.push({
          line: i + 1,
          message: `JSON parse error: ${(error as Error).message}`,
          type: 'parse_error'
        });
      }
    }

    return { data, errors };
  }

  /**
   * Validate batch input format
   */
  private validateBatchInput(data: any): BatchError[] {
    const errors: BatchError[] = [];

    if (!data.hypotheses || typeof data.hypotheses !== 'object') {
      errors.push({
        line: 1,
        message: 'Missing or invalid "hypotheses" field - must be an object',
        type: 'validation_error'
      });
    }

    if (!data.goal || typeof data.goal !== 'object') {
      errors.push({
        line: 1,
        message: 'Missing or invalid "goal" field - must be a Fact object',
        type: 'validation_error'
      });
    }

    // Validate goal format
    if (data.goal) {
      if (!data.goal.kind || !['eq', 'neq'].includes(data.goal.kind)) {
        errors.push({
          line: 1,
          message: 'Goal must have "kind" field with value "eq" or "neq"',
          type: 'validation_error'
        });
      }
      if (!data.goal.lhs || !data.goal.rhs) {
        errors.push({
          line: 1,
          message: 'Goal must have "lhs" and "rhs" expression fields',
          type: 'validation_error'
        });
      }
    }

    return errors;
  }

  /**
   * Validate batch command format
   */
  private validateBatchCommand(data: any, lineNumber: number): BatchError[] {
    const errors: BatchError[] = [];

    if (!data.command || typeof data.command !== 'object') {
      errors.push({
        line: lineNumber,
        message: 'Missing or invalid "command" field - must be a Command object',
        type: 'validation_error'
      });
      return errors;
    }

    const cmd = data.command;
    if (!cmd.cmd || typeof cmd.cmd !== 'string') {
      errors.push({
        line: lineNumber,
        message: 'Command must have a "cmd" field with string value',
        type: 'validation_error'
      });
    }

    // Validate command-specific fields
    const validCommands = ['多能', '不利', '反证', '再写', '重反', '确定'];
    if (!validCommands.includes(cmd.cmd)) {
      errors.push({
        line: lineNumber,
        message: `Invalid command "${cmd.cmd}". Valid commands are: ${validCommands.join(', ')}`,
        type: 'validation_error'
      });
    }

    return errors;
  }

  /**
   * Process batch mode files
   */
  async processBatch(inputFilePath: string, proofFilePath: string): Promise<BatchResult> {
    const errors: BatchError[] = [];
    let proved: 0 | 1 = 0;

    try {
      // Read and parse input file
      this.logger(`Reading input file: ${inputFilePath}`);
      const inputContent = readFileSync(inputFilePath, 'utf-8');
      const inputParseResult = this.parseJsonl<BatchInput>(inputContent);
      errors.push(...inputParseResult.errors);

      if (inputParseResult.data.length === 0) {
        errors.push({
          line: 1,
          message: 'Input file is empty or contains no valid JSON objects',
          type: 'validation_error'
        });
        return { evaluation_score: { error_count: errors.length, proved }, errors };
      }

      if (inputParseResult.data.length > 1) {
        errors.push({
          line: inputParseResult.data.length,
          message: 'Input file should contain exactly one JSON object with hypotheses and goal',
          type: 'validation_error'
        });
      }

      const batchInput = inputParseResult.data[0];
      
      // Validate input format
      const inputValidationErrors = this.validateBatchInput(batchInput);
      errors.push(...inputValidationErrors);

      if (inputValidationErrors.length > 0) {
        return { evaluation_score: { error_count: errors.length, proved }, errors };
      }

      // Read and parse proof commands file
      this.logger(`Reading proof file: ${proofFilePath}`);
      const proofContent = readFileSync(proofFilePath, 'utf-8');
      const proofParseResult = this.parseJsonl<BatchCommand>(proofContent);
      errors.push(...proofParseResult.errors);

      // Validate proof commands
      for (let i = 0; i < proofParseResult.data.length; i++) {
        const commandValidationErrors = this.validateBatchCommand(proofParseResult.data[i], i + 1);
        errors.push(...commandValidationErrors);
      }

      if (errors.length > 0) {
        return { evaluation_score: { error_count: errors.length, proved }, errors };
      }

      // Create proof session and execute commands
      this.logger('Creating proof session...');
      const session = new ProofSession(batchInput.goal, {
        hypotheses: batchInput.hypotheses,
        logger: this.logger
      });

      this.logger(`Goal: ${factToReadable(batchInput.goal)}`);
      this.logger(`Hypotheses: ${Object.keys(batchInput.hypotheses).length}`);

      // Execute proof commands
      this.logger(`Executing ${proofParseResult.data.length} commands...`);
      for (let i = 0; i < proofParseResult.data.length; i++) {
        const batchCommand = proofParseResult.data[i];
        const command = batchCommand.command;

        this.logger(`Command ${i + 1}: ${JSON.stringify(command)}`);
        const success = session.runCommand(command);

        if (!success) {
          errors.push({
            line: i + 1,
            command,
            message: `Command failed to execute`,
            type: 'command_error'
          });
        }

        // Check if proof is complete after each command
        if (session.isComplete()) {
          this.logger(`Proof completed at command ${i + 1}`);
          proved = 1;
          break;
        }
      }

      // Final check if proof is complete
      if (session.isComplete()) {
        proved = 1;
        this.logger('✅ Proof completed successfully!');
      } else {
        this.logger('❌ Proof not completed');
        errors.push({
          line: proofParseResult.data.length,
          message: 'Proof sequence did not complete the goal',
          type: 'validation_error'
        });
      }

      return {
        evaluation_score: { error_count: errors.length, proved },
        errors,
        session_summary: session.getSummary()
      };

    } catch (error) {
      errors.push({
        line: 1,
        message: `File processing error: ${(error as Error).message}`,
        type: 'parse_error'
      });

      return { evaluation_score: { error_count: errors.length, proved }, errors };
    }
  }

  /**
   * Format batch result for output
   */
  formatResult(result: BatchResult): string {
    const lines: string[] = [];
    
    lines.push('=== BATCH MODE EVALUATION RESULT ===');
    lines.push(`Error Count: ${result.evaluation_score.error_count}`);
    lines.push(`Proved: ${result.evaluation_score.proved}`);
    lines.push(`Evaluation Score: (${result.evaluation_score.error_count}, ${result.evaluation_score.proved})`);
    
    if (result.errors.length > 0) {
      lines.push('\n=== ERRORS ===');
      for (const error of result.errors) {
        let errorLine = `Line ${error.line} [${error.type.toUpperCase()}]: ${error.message}`;
        if (error.command) {
          errorLine += ` (Command: ${JSON.stringify(error.command)})`;
        }
        lines.push(errorLine);
      }
    }

    if (result.session_summary) {
      lines.push('\n=== SESSION SUMMARY ===');
      lines.push(result.session_summary);
    }

    return lines.join('\n');
  }
}

export default BatchModeValidator;