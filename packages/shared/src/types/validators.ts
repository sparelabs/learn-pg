export type ValidationStrategy =
  | 'result-match'
  | 'query-plan'
  | 'performance'
  | 'schema'
  | 'custom';

export interface ValidationConfig {
  strategy: ValidationStrategy;
  rules: ValidationRules;
}

export interface ResultMatchRules {
  rowCount?: {
    exact?: number;
    min?: number;
    max?: number;
  };
  columns?: {
    required: string[];
    forbidden?: string[];
    exactMatch?: boolean; // Must have exactly these columns, no more
  };
  values?: {
    exactMatch?: Array<Record<string, any>>;
    subset?: Array<Record<string, any>>; // User result must include these rows
    allowExtraRows?: boolean;
  };
  ordering?: {
    mustMatch?: boolean;
    columnName?: string;
  };
}

export interface QueryPlanRules {
  mustUseIndex?: boolean;
  specificIndex?: string;
  forbiddenNodes?: string[]; // e.g., ['Seq Scan', 'Nested Loop']
  requiredNodes?: string[]; // e.g., ['Index Scan', 'Bitmap Heap Scan']
  maxCost?: number;
  maxRows?: number;
}

export interface PerformanceRules {
  maxExecutionTimeMs: number;
  maxPlanningTimeMs?: number;
  maxSharedBuffers?: number;
  requireParallelWorkers?: boolean;
}

export interface SchemaRules {
  tables?: {
    required: string[];
    forbidden?: string[];
  };
  indexes?: {
    required: Array<{
      table: string;
      columns: string[];
      type?: 'btree' | 'hash' | 'gin' | 'gist' | 'brin';
    }>;
    forbidden?: string[];
  };
  constraints?: {
    required: Array<{
      table: string;
      type: 'primary-key' | 'foreign-key' | 'unique' | 'check' | 'not-null';
      columns: string[];
    }>;
  };
}

export interface CustomValidationRules {
  validatorFunction: string; // Name of the custom validator function
  parameters?: Record<string, any>;
}

export type ValidationRules =
  | { strategy: 'result-match'; rules: ResultMatchRules }
  | { strategy: 'query-plan'; rules: QueryPlanRules }
  | { strategy: 'performance'; rules: PerformanceRules }
  | { strategy: 'schema'; rules: SchemaRules }
  | { strategy: 'custom'; rules: CustomValidationRules };

export interface ValidationResult {
  isValid: boolean;
  score: number; // 0-100
  feedback: string[];
  errors: string[];
  suggestions: string[];
  executionTimeMs?: number;
  queryPlan?: any;
}
