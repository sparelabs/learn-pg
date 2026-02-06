import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { SKILL_LEVELS } from '@learn-pg/shared';

export default function ProgressPage() {
  const { data: progressData } = useQuery({
    queryKey: ['progress'],
    queryFn: api.getProgress
  });

  const { data: weakAreasData } = useQuery({
    queryKey: ['weakAreas'],
    queryFn: api.getWeakAreas
  });

  const progress = progressData?.progress;
  const weakAreas = weakAreasData?.weakAreas || [];
  const skillLevel = SKILL_LEVELS.find(s => s.level === (progress?.skillRating || 1));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Your Progress</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-4xl mb-2">{skillLevel?.emoji}</div>
          <h3 className="text-xl font-semibold mb-1">{skillLevel?.name}</h3>
          <p className="text-gray-600">Level {progress?.skillRating || 1}/10</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-4xl mb-2">📊</div>
          <h3 className="text-xl font-semibold mb-1">
            {progress?.totalExercisesCompleted || 0}
          </h3>
          <p className="text-gray-600">Exercises Completed</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-4xl mb-2">⏱️</div>
          <h3 className="text-xl font-semibold mb-1">
            {progress?.totalTimeSpentMinutes || 0} min
          </h3>
          <p className="text-gray-600">Time Spent Learning</p>
        </div>
      </div>

      {weakAreas.length > 0 && (
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h2 className="text-2xl font-bold mb-6">Areas to Improve</h2>
          <div className="space-y-4">
            {weakAreas.map((area: any) => (
              <div key={area.concept} className="border-l-4 border-yellow-400 pl-4">
                <h3 className="font-semibold text-lg">{area.concept}</h3>
                <p className="text-gray-600 text-sm">{area.topicTitle}</p>
                <p className="text-sm text-gray-500">
                  Failure rate: {(area.failureRate * 100).toFixed(0)}% ({area.totalAttempts} attempts)
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6">Topic Progress</h2>
        {progress?.topicProgress?.length > 0 ? (
          <div className="space-y-4">
            {progress.topicProgress.map((tp: any) => (
              <div key={tp.topicId} className="border-b border-gray-200 pb-4 last:border-0">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">{tp.topicId}</h3>
                  <span className={`px-3 py-1 rounded text-sm ${
                    tp.status === 'completed' ? 'bg-green-100 text-green-800' :
                    tp.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {tp.status}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {tp.completedLessons.length} lessons • {tp.completedExercises.length} exercises completed
                </div>
                <div className="mt-2">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 rounded-full h-2"
                      style={{ width: `${tp.masteryLevel}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No progress yet. Start learning to track your progress!</p>
        )}
      </div>
    </div>
  );
}
