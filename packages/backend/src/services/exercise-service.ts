import type { Exercise, ValidationResult, ValidationConfig } from '@learn-pg/shared';
import { dockerService } from './docker-service.js';
import { curriculumService } from './curriculum-service.js';

export class ExerciseService {
  async setupExercise(exerciseId: string): Promise<void> {
    const exercise = curriculumService.getExercise(exerciseId);
    if (!exercise) {
      throw new Error(`Exercise not found: ${exerciseId}`);
    }

    if (exercise.setupSql) {
      const schema = this.getSchemaForExercise(exerciseId);
      await dockerService.setupExercise(exercise.setupSql, schema);
    }
  }

  async validateExercise(exerciseId: string, userQuery: string): Promise<ValidationResult> {
    const exercise = curriculumService.getExercise(exerciseId);
    if (!exercise) {
      throw new Error(`Exercise not found: ${exerciseId}`);
    }

    const schema = this.getSchemaForExercise(exerciseId);
    const startTime = Date.now();

    try {
      const result = await dockerService.executeQueryWithSchema(userQuery, schema);
      const executionTimeMs = Date.now() - startTime;

      // Validate based on exercise validation config
      const validationResult = await this.validate(
        exercise.validation,
        userQuery,
        result,
        executionTimeMs,
        schema
      );

      return {
        ...validationResult,
        executionTimeMs,
        queryResults: {
          rows: result.rows || [],
          rowCount: result.rowCount || result.rows?.length || 0,
          fields: result.fields || []
        }
      };
    } catch (error: any) {
      return {
        isValid: false,
        score: 0,
        feedback: [],
        errors: [error.message || 'Query execution failed'],
        suggestions: this.generateErrorSuggestions(error),
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  private async validate(
    config: ValidationConfig,
    userQuery: string,
    result: any,
    executionTimeMs: number,
    schema: string
  ): Promise<Omit<ValidationResult, 'executionTimeMs'>> {
    const { strategy, rules } = config;

    switch (strategy) {
      case 'result-match':
        return this.validateResultMatch(rules as any, result);

      case 'query-plan':
        return this.validateQueryPlan(rules as any, userQuery, schema);

      case 'performance':
        return this.validatePerformance(rules as any, executionTimeMs);

      case 'schema':
        return this.validateSchema(rules as any, schema);

      default:
        return {
          isValid: true,
          score: 100,
          feedback: ['Validation not implemented for this exercise type'],
          errors: [],
          suggestions: []
        };
    }
  }

  private validateResultMatch(rules: any, result: any): Omit<ValidationResult, 'executionTimeMs'> {
    const feedback: string[] = [];
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Check row count
    if (rules.rowCount) {
      const actualRows = result.rowCount || result.rows?.length || 0;
      if (rules.rowCount.exact !== undefined && actualRows !== rules.rowCount.exact) {
        errors.push(`Expected exactly ${rules.rowCount.exact} rows, got ${actualRows}`);
        score -= 30;
      } else if (rules.rowCount.min !== undefined && actualRows < rules.rowCount.min) {
        errors.push(`Expected at least ${rules.rowCount.min} rows, got ${actualRows}`);
        score -= 20;
      } else if (rules.rowCount.max !== undefined && actualRows > rules.rowCount.max) {
        errors.push(`Expected at most ${rules.rowCount.max} rows, got ${actualRows}`);
        score -= 20;
      } else {
        feedback.push(`Correct row count: ${actualRows}`);
      }
    }

    // Check columns
    if (rules.columns && result.rows && result.rows.length > 0) {
      const actualColumns = Object.keys(result.rows[0]);
      const requiredColumns = rules.columns.required || [];
      const forbiddenColumns = rules.columns.forbidden || [];

      for (const col of requiredColumns) {
        if (!actualColumns.includes(col)) {
          errors.push(`Missing required column: ${col}`);
          score -= 20;
        }
      }

      for (const col of forbiddenColumns) {
        if (actualColumns.includes(col)) {
          errors.push(`Should not include column: ${col}`);
          score -= 10;
        }
      }

      if (rules.columns.exactMatch && !this.arraysEqual(actualColumns.sort(), requiredColumns.sort())) {
        errors.push(`Expected exact columns: ${requiredColumns.join(', ')}`);
        score -= 20;
      }

      if (errors.length === 0) {
        feedback.push('Correct columns returned');
      }
    }

    // Check exact values
    if (rules.values?.exactMatch && result.rows) {
      const expected = rules.values.exactMatch;
      if (!this.resultsEqual(result.rows, expected)) {
        errors.push('Result values do not match expected output');
        score -= 40;
        suggestions.push('Double-check your query logic and filtering conditions');
      } else {
        feedback.push('Result values match exactly');
      }
    }

    const isValid = errors.length === 0;
    if (isValid) {
      feedback.push('Exercise completed successfully!');
    }

    return {
      isValid,
      score: Math.max(0, score),
      feedback,
      errors,
      suggestions
    };
  }

  private async validateQueryPlan(
    rules: any,
    userQuery: string,
    schema: string
  ): Promise<Omit<ValidationResult, 'executionTimeMs'>> {
    const feedback: string[] = [];
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    try {
      const plan = await dockerService.executeExplain(userQuery, schema);

      const planText = JSON.stringify(plan);

      // Check for forbidden nodes
      if (rules.forbiddenNodes) {
        for (const node of rules.forbiddenNodes) {
          if (planText.includes(node)) {
            errors.push(`Query plan contains forbidden node: ${node}`);
            score -= 30;
            suggestions.push(`Try to avoid ${node} by using indexes or rewriting the query`);
          }
        }
      }

      // Check for required nodes
      if (rules.requiredNodes) {
        for (const node of rules.requiredNodes) {
          if (!planText.includes(node)) {
            errors.push(`Query plan missing required node: ${node}`);
            score -= 30;
            suggestions.push(`Your query should use ${node}`);
          }
        }
      }

      // Check if index is used
      if (rules.mustUseIndex && !planText.includes('Index Scan') && !planText.includes('Index Only Scan')) {
        errors.push('Query does not use an index');
        score -= 40;
        suggestions.push('Consider adding an index or restructuring the query');
      }

      // Check specific index
      if (rules.specificIndex && !planText.includes(rules.specificIndex)) {
        errors.push(`Query should use index: ${rules.specificIndex}`);
        score -= 30;
      }

      if (errors.length === 0) {
        feedback.push('Query plan is optimal');
      }

      return {
        isValid: errors.length === 0,
        score: Math.max(0, score),
        feedback,
        errors,
        suggestions,
        queryPlan: plan
      };
    } catch (error: any) {
      return {
        isValid: false,
        score: 0,
        feedback: [],
        errors: [`Failed to analyze query plan: ${error.message}`],
        suggestions: ['Check your SQL syntax']
      };
    }
  }

  private validatePerformance(
    rules: any,
    executionTimeMs: number
  ): Omit<ValidationResult, 'executionTimeMs'> {
    const feedback: string[] = [];
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    if (rules.maxExecutionTimeMs && executionTimeMs > rules.maxExecutionTimeMs) {
      errors.push(`Query too slow: ${executionTimeMs}ms (max: ${rules.maxExecutionTimeMs}ms)`);
      score -= 50;
      suggestions.push('Optimize your query with indexes or better logic');
    } else {
      feedback.push(`Good performance: ${executionTimeMs}ms`);
    }

    return {
      isValid: errors.length === 0,
      score: Math.max(0, score),
      feedback,
      errors,
      suggestions
    };
  }

  private async validateSchema(
    rules: any,
    schema: string
  ): Promise<Omit<ValidationResult, 'executionTimeMs'>> {
    const feedback: string[] = [];
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    try {
      const tables = await dockerService.getTableInfo(schema);
      const indexes = await dockerService.getIndexInfo(schema);

      const tableNames = tables.map(t => t.tablename);
      const indexNames = indexes.map(i => i.indexname);

      // Check required tables
      if (rules.tables?.required) {
        for (const table of rules.tables.required) {
          if (!tableNames.includes(table)) {
            errors.push(`Missing required table: ${table}`);
            score -= 30;
          }
        }
      }

      // Check forbidden tables
      if (rules.tables?.forbidden) {
        for (const table of rules.tables.forbidden) {
          if (tableNames.includes(table)) {
            errors.push(`Should not create table: ${table}`);
            score -= 20;
          }
        }
      }

      // Check required indexes
      if (rules.indexes?.required) {
        for (const idx of rules.indexes.required) {
          const found = indexes.some(i =>
            i.tablename === idx.table &&
            this.indexMatchesColumns(i.indexdef, idx.columns)
          );
          if (!found) {
            errors.push(`Missing index on ${idx.table}(${idx.columns.join(', ')})`);
            score -= 25;
            suggestions.push(`Create an index on ${idx.table} for better performance`);
          }
        }
      }

      if (errors.length === 0) {
        feedback.push('Schema design is correct');
      }

      return {
        isValid: errors.length === 0,
        score: Math.max(0, score),
        feedback,
        errors,
        suggestions
      };
    } catch (error: any) {
      return {
        isValid: false,
        score: 0,
        feedback: [],
        errors: [`Failed to validate schema: ${error.message}`],
        suggestions: []
      };
    }
  }

  private getSchemaForExercise(exerciseId: string): string {
    // Extract topic from exercise ID (format: topicId-lessonId-exerciseId)
    const parts = exerciseId.split('-');
    return parts[0] || 'public';
  }

  private arraysEqual(a: any[], b: any[]): boolean {
    return a.length === b.length && a.every((val, idx) => val === b[idx]);
  }

  private resultsEqual(actual: any[], expected: any[]): boolean {
    if (actual.length !== expected.length) return false;

    for (let i = 0; i < actual.length; i++) {
      const actualRow = actual[i];
      const expectedRow = expected[i];

      if (typeof actualRow !== 'object' || typeof expectedRow !== 'object') {
        return false;
      }

      const actualKeys = Object.keys(actualRow).sort();
      const expectedKeys = Object.keys(expectedRow).sort();

      if (!this.arraysEqual(actualKeys, expectedKeys)) {
        return false;
      }

      for (const key of actualKeys) {
        if (actualRow[key] !== expectedRow[key]) {
          return false;
        }
      }
    }

    return true;
  }

  private indexMatchesColumns(indexDef: string, columns: string[]): boolean {
    const columnsStr = columns.join(', ');
    return indexDef.includes(`(${columnsStr})`);
  }

  private generateErrorSuggestions(error: any): string[] {
    const suggestions: string[] = [];
    const message = error.message?.toLowerCase() || '';

    if (message.includes('syntax error')) {
      suggestions.push('Check your SQL syntax');
      suggestions.push('Make sure all keywords are spelled correctly');
    }

    if (message.includes('relation') && message.includes('does not exist')) {
      suggestions.push('Check table and column names');
      suggestions.push('Make sure the table exists in the current schema');
    }

    if (message.includes('permission denied')) {
      suggestions.push('You may not have permission to perform this operation');
    }

    if (message.includes('timeout')) {
      suggestions.push('Query took too long to execute');
      suggestions.push('Try optimizing with indexes or simpler logic');
    }

    return suggestions;
  }
}

export const exerciseService = new ExerciseService();
