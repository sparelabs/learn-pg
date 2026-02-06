import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { SKILL_LEVELS } from '@learn-pg/shared';

export default function EvaluationPage() {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<any>(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<any>(null);
  const [completed, setCompleted] = useState(false);
  const [finalSession, setFinalSession] = useState<any>(null);

  const startMutation = useMutation({
    mutationFn: api.startEvaluation,
    onSuccess: (data) => {
      setSessionId(data.session.id);
      loadNextQuestion(data.session.id);
    }
  });

  const loadNextQuestion = async (sid: string) => {
    const data = await api.getNextQuestion(sid);
    if (data.question) {
      setQuestion(data.question);
      setAnswer('');
      setResult(null);
    } else {
      completeEvaluation(sid);
    }
  };

  const submitAnswer = async () => {
    if (!sessionId || !question || !answer) return;

    const data = await api.submitAnswer(sessionId, {
      questionId: question.id,
      answer,
      timeSpentSeconds: 30,
      hintsUsed: 0
    });

    setResult(data);
  };

  const handleNextQuestion = () => {
    if (sessionId) {
      loadNextQuestion(sessionId);
    }
  };

  const completeEvaluation = async (sid: string) => {
    const data = await api.completeEvaluation(sid);
    setFinalSession(data.session);
    setCompleted(true);

    // Invalidate progress cache so homepage shows updated skill level
    queryClient.invalidateQueries({ queryKey: ['progress'] });
  };

  if (completed && finalSession) {
    const skillLevel = SKILL_LEVELS.find(s => s.level === finalSession.endingSkillLevel);
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-6xl mb-4">{skillLevel?.emoji}</div>
          <h1 className="text-3xl font-bold mb-2">{skillLevel?.name}</h1>
          <p className="text-xl text-gray-600 mb-8">
            Your skill level: {finalSession.endingSkillLevel}/10
          </p>

          {finalSession.weakAreasIdentified?.length > 0 && (
            <div className="mt-8 text-left">
              <h3 className="text-lg font-semibold mb-4">Areas to improve:</h3>
              <ul className="space-y-2">
                {finalSession.weakAreasIdentified.map((area: string) => (
                  <li key={area} className="text-gray-700">• {area}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="mt-8 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded"
          >
            Take Another Evaluation
          </button>
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <h1 className="text-3xl font-bold mb-4">Skill Evaluation</h1>
          <p className="text-gray-600 mb-8">
            Test your PostgreSQL knowledge with adaptive questions that adjust to your skill level
          </p>
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded text-lg disabled:opacity-50"
          >
            {startMutation.isPending ? 'Starting...' : 'Start Evaluation'}
          </button>
        </div>
      </div>
    );
  }

  if (!question) {
    return <div className="max-w-4xl mx-auto px-4 py-8">Loading question...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow p-8">
        <div className="mb-6">
          <span className="inline-block bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm">
            Difficulty: {question.difficulty}/10
          </span>
        </div>

        <h2 className="text-2xl font-bold mb-4">{question.prompt}</h2>

        {question.type === 'multiple-choice' && question.options && (
          <div className="space-y-3 mb-6">
            {question.options.map((option: any) => (
              <button
                key={option.id}
                onClick={() => setAnswer(option.id)}
                disabled={!!result}
                className={`w-full text-left p-4 rounded border-2 transition-colors ${
                  answer === option.id
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${result ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {option.text}
              </button>
            ))}
          </div>
        )}

        {!result ? (
          <button
            onClick={submitAnswer}
            disabled={!answer}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded disabled:opacity-50 font-medium"
          >
            Submit Answer
          </button>
        ) : (
          <button
            onClick={handleNextQuestion}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded font-medium"
          >
            Next Question →
          </button>
        )}

        {result && (
          <div className={`mt-6 p-4 rounded ${result.isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className="font-semibold text-lg mb-2">
              {result.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </p>
            {result.explanation && (
              <p className="text-sm leading-relaxed">{result.explanation}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
