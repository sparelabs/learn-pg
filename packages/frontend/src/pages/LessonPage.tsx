import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { marked } from 'marked';
import { api } from '../api/client';
import SQLEditor from '../components/exercises/SQLEditor';
import type { Exercise } from '@learn-pg/shared';

export default function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);

  const { data: lessonData } = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => api.getLesson(lessonId!)
  });

  const { data: exercisesData } = useQuery({
    queryKey: ['exercises', lessonId],
    queryFn: () => api.getExercises(lessonId!)
  });

  const setupMutation = useMutation({
    mutationFn: (exerciseId: string) => api.setupExercise(exerciseId)
  });

  const submitMutation = useMutation({
    mutationFn: ({ exerciseId, query }: { exerciseId: string; query: string }) =>
      api.submitExercise(exerciseId, query),
    onSuccess: (data) => {
      setResult(data.result);
    }
  });

  const lesson = lessonData?.lesson;
  const exercises: Exercise[] = exercisesData?.exercises || [];
  const currentExercise = exercises[currentExerciseIndex];

  const handleStartExercise = () => {
    if (currentExercise) {
      setupMutation.mutate(currentExercise.id);
    }
  };

  const handleSubmit = () => {
    if (currentExercise && query.trim()) {
      submitMutation.mutate({ exerciseId: currentExercise.id, query });
    }
  };

  const handleNextExercise = () => {
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
      setResult(null);
      setQuery('');
    } else {
      // Loop back to first exercise
      setCurrentExerciseIndex(0);
      setResult(null);
      setQuery('');
    }
  };

  if (!lesson) {
    return <div className="max-w-7xl mx-auto px-4 py-8">Loading...</div>;
  }

  const contentHtml = marked(lesson.content) as string;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Lesson Content */}
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{lesson.title}</h1>
          <p className="text-gray-600 mb-6">{lesson.description}</p>

          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>

        {/* Right: Exercise Area */}
        {currentExercise && (
          <div className="bg-white rounded-lg shadow p-8 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            {/* Exercise Navigation Tabs */}
            {exercises.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-4">
                {exercises.map((ex, idx) => (
                  <button
                    key={ex.id}
                    onClick={() => {
                      setCurrentExerciseIndex(idx);
                      setResult(null);
                      setQuery('');
                    }}
                    className={`px-4 py-2 rounded-t ${
                      idx === currentExerciseIndex
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Exercise {idx + 1}
                  </button>
                ))}
              </div>
            )}

            <h3 className="text-xl font-bold mb-2">{currentExercise.title}</h3>
            <p className="text-gray-600 mb-4">{currentExercise.prompt}</p>

            {currentExercise.setupSql && (
              <div className="mb-4">
                <button
                  onClick={handleStartExercise}
                  disabled={setupMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50 text-sm"
                >
                  {setupMutation.isPending ? 'Setting up database...' : setupMutation.isSuccess ? '✓ Database Ready' : 'Setup Exercise Database'}
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  This creates the tables and data you'll need for this exercise
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your SQL Query
              </label>
              <SQLEditor value={query} onChange={setQuery} />
            </div>

            {!result ? (
              <button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || !query.trim()}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white px-4 py-3 rounded disabled:opacity-50 font-medium"
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit Query'}
              </button>
            ) : (
              <div className="flex gap-2">
                {!result.isValid && (
                  <button
                    onClick={() => setResult(null)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-3 rounded font-medium"
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={handleNextExercise}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white px-4 py-3 rounded font-medium"
                >
                  {currentExerciseIndex < exercises.length - 1 ? 'Next Exercise →' : 'Back to Exercise 1'}
                </button>
              </div>
            )}

            {result && (
              <>
                {/* Query Results */}
                {result.queryResults && result.queryResults.rows.length > 0 && (
                  <div className="mt-6 bg-gray-50 border border-gray-200 rounded p-4">
                    <h4 className="font-semibold mb-3">Query Results ({result.queryResults.rowCount} rows)</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            {Object.keys(result.queryResults.rows[0]).map((col: string) => (
                              <th key={col} className="px-4 py-2 text-left font-medium text-gray-700">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {result.queryResults.rows.map((row: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              {Object.values(row).map((val: any, cidx: number) => (
                                <td key={cidx} className="px-4 py-2 text-gray-900">
                                  {val === null ? <span className="text-gray-400 italic">null</span> : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Validation Feedback */}
                <div className={`mt-6 p-4 rounded ${result.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <h4 className="font-semibold mb-2">
                    {result.isValid ? '✓ Correct!' : '✗ Not quite right'}
                  </h4>
                  <p className="text-sm mb-2">Score: {result.score}/100</p>

                  {result.feedback.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-medium">Feedback:</p>
                    <ul className="text-sm list-disc list-inside">
                      {result.feedback.map((f: string, i: number) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.errors.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-medium text-red-700">Errors:</p>
                    <ul className="text-sm list-disc list-inside text-red-700">
                      {result.errors.map((e: string, i: number) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.suggestions.length > 0 && (
                  <div>
                    <p className="text-sm font-medium">Suggestions:</p>
                    <ul className="text-sm list-disc list-inside">
                      {result.suggestions.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
