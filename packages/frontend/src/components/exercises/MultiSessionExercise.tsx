import { useState, useEffect, useRef, useCallback } from 'react';
import type { MultiSessionExercise } from '@learn-pg/shared';
import { api } from '../../api/client';
import SQLEditor from './SQLEditor';

interface QueryResult {
  rows: any[];
  rowCount: number;
}

interface Props {
  exercise: MultiSessionExercise;
}

function ResultsTable({ result }: { result: QueryResult }) {
  if (!result.rows || result.rows.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic p-2">
        {result.rowCount > 0 ? `${result.rowCount} row(s) affected` : 'No rows returned'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-100">
          <tr>
            {Object.keys(result.rows[0]).map((col) => (
              <th key={col} className="px-3 py-1.5 text-left font-medium text-gray-700">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {result.rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {Object.values(row).map((val: any, cidx) => (
                <td key={cidx} className="px-3 py-1.5 text-gray-900">
                  {val === null ? <span className="text-gray-400 italic">null</span> : String(val)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-gray-500 mt-1">{result.rowCount} row(s)</div>
    </div>
  );
}

export default function MultiSessionExerciseComponent({ exercise }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queryA, setQueryA] = useState(exercise.sessions.sessionAInitialQuery || '');
  const [queryB, setQueryB] = useState(exercise.sessions.sessionBInitialQuery || '');
  const [resultA, setResultA] = useState<QueryResult | null>(null);
  const [resultB, setResultB] = useState<QueryResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const sessionIdRef = useRef<string | null>(null);
  const exerciseIdRef = useRef(exercise.id);

  const startSession = useCallback(async () => {
    try {
      setSessionError(null);
      const data = await api.startSession(exercise.id);
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
    } catch (err: any) {
      setSessionError(err.message || 'Failed to start session');
    }
  }, [exercise.id]);

  // Start session on mount, close on unmount or exercise change
  useEffect(() => {
    startSession();

    return () => {
      if (sessionIdRef.current) {
        api.closeSession(exerciseIdRef.current, sessionIdRef.current).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  }, [startSession]);

  // Reset state when exercise changes
  useEffect(() => {
    exerciseIdRef.current = exercise.id;
    setQueryA(exercise.sessions.sessionAInitialQuery || '');
    setQueryB(exercise.sessions.sessionBInitialQuery || '');
    setResultA(null);
    setResultB(null);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setErrorA(null);
    setErrorB(null);
  }, [exercise.id, exercise.sessions.sessionAInitialQuery, exercise.sessions.sessionBInitialQuery]);

  const handleSubmit = async (session: 'A' | 'B') => {
    if (!sessionId) return;

    const query = session === 'A' ? queryA : queryB;
    if (!query.trim()) return;

    const setLoading = session === 'A' ? setLoadingA : setLoadingB;
    const setResult = session === 'A' ? setResultA : setResultB;
    const setError = session === 'A' ? setErrorA : setErrorB;

    setLoading(true);
    setError(null);

    try {
      const data = await api.executeOnSession(exercise.id, sessionId, query, session, currentStep);

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.queryResults);

        // Advance step if submitted on the correct session
        const activeStep = exercise.steps[currentStep];
        if (activeStep && activeStep.session === session && currentStep < exercise.steps.length) {
          setCompletedSteps(prev => new Set(prev).add(currentStep));
          if (currentStep < exercise.steps.length - 1) {
            setCurrentStep(currentStep + 1);
          } else {
            setCurrentStep(exercise.steps.length); // All done
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Query execution failed');
    } finally {
      setLoading(false);
    }
  };

  const activeStep = exercise.steps[currentStep];
  const isComplete = currentStep >= exercise.steps.length;

  if (sessionError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4">
        <p className="text-red-700 font-medium">Failed to start session</p>
        <p className="text-red-600 text-sm mt-1">{sessionError}</p>
        <button
          onClick={startSession}
          className="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex items-center gap-2 text-gray-600 p-4">
        <div className="animate-spin h-4 w-4 border-2 border-primary-600 border-t-transparent rounded-full" />
        Starting database sessions...
      </div>
    );
  }

  return (
    <div>
      {/* Step Instructions */}
      <div className="mb-4 bg-gray-50 border border-gray-200 rounded p-3">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Steps</h4>
        <ol className="space-y-1">
          {exercise.steps.map((step, idx) => {
            const isDone = completedSteps.has(idx);
            const isActive = idx === currentStep;
            return (
              <li
                key={idx}
                className={`flex items-start gap-2 text-sm rounded px-2 py-1 ${
                  isActive ? 'bg-primary-50 border border-primary-200 font-medium' :
                  isDone ? 'text-gray-400 line-through' : 'text-gray-600'
                }`}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {isDone ? (
                    <span className="text-green-600">&#10003;</span>
                  ) : isActive ? (
                    <span className="text-primary-600">&#9654;</span>
                  ) : (
                    <span className="text-gray-400">{idx + 1}.</span>
                  )}
                </span>
                <span>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono mr-1 ${
                    step.session === 'A' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {step.session}
                  </span>
                  {step.instruction}
                </span>
              </li>
            );
          })}
        </ol>
        {isComplete && (
          <div className="mt-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
            All steps completed!
          </div>
        )}
      </div>

      {/* Dual Editor Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Session A */}
        <div className={`rounded-lg border-2 transition-colors ${
          activeStep?.session === 'A' ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">
              Session A
            </span>
            <span className="text-xs text-gray-500">{exercise.sessions.sessionAPrompt}</span>
          </div>
          <div className={`p-2 ${activeStep?.session !== 'A' && !isComplete ? 'opacity-60' : ''}`}>
            <SQLEditor value={queryA} onChange={setQueryA} height="120px" />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => handleSubmit('A')}
                disabled={loadingA || !queryA.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
              >
                {loadingA ? 'Running...' : 'Run A'}
              </button>
            </div>
            {errorA && (
              <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">{errorA}</div>
            )}
            {resultA && (
              <div className="mt-2 bg-white border border-gray-200 rounded p-2 max-h-48 overflow-auto">
                <ResultsTable result={resultA} />
              </div>
            )}
          </div>
        </div>

        {/* Session B */}
        <div className={`rounded-lg border-2 transition-colors ${
          activeStep?.session === 'B' ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">
              Session B
            </span>
            <span className="text-xs text-gray-500">{exercise.sessions.sessionBPrompt}</span>
          </div>
          <div className={`p-2 ${activeStep?.session !== 'B' && !isComplete ? 'opacity-60' : ''}`}>
            <SQLEditor value={queryB} onChange={setQueryB} height="120px" />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => handleSubmit('B')}
                disabled={loadingB || !queryB.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
              >
                {loadingB ? 'Running...' : 'Run B'}
              </button>
            </div>
            {errorB && (
              <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">{errorB}</div>
            )}
            {resultB && (
              <div className="mt-2 bg-white border border-gray-200 rounded p-2 max-h-48 overflow-auto">
                <ResultsTable result={resultB} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
