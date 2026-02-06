import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { SKILL_LEVELS } from '@learn-pg/shared';

export default function HomePage() {
  const { data: progressData } = useQuery({
    queryKey: ['progress'],
    queryFn: api.getProgress
  });

  const progress = progressData?.progress;
  const skillLevel = SKILL_LEVELS.find(s => s.level === (progress?.skillRating || 1));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Welcome to Learn PostgreSQL
        </h1>
        <p className="text-lg text-gray-600">
          Master PostgreSQL through interactive exercises and real-world scenarios
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl mb-2">{skillLevel?.emoji}</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {skillLevel?.name || 'Beginner'}
          </h3>
          <p className="text-sm text-gray-600">Current Skill Level: {progress?.skillRating || 1}/10</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl mb-2">🎯</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {progress?.totalExercisesCompleted || 0} Exercises
          </h3>
          <p className="text-sm text-gray-600">Completed so far</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl mb-2">🔥</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {progress?.streak || 0} Day Streak
          </h3>
          <p className="text-sm text-gray-600">Keep it going!</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          to="/topics"
          className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg p-8 transition-colors"
        >
          <h2 className="text-2xl font-bold mb-2">Browse Topics</h2>
          <p className="text-primary-100">
            Explore structured lessons on PostgreSQL fundamentals, query optimization, and more
          </p>
        </Link>

        <Link
          to="/evaluation"
          className="bg-green-600 hover:bg-green-700 text-white rounded-lg p-8 transition-colors"
        >
          <h2 className="text-2xl font-bold mb-2">Take Evaluation</h2>
          <p className="text-green-100">
            Test your skills with adaptive questions and get personalized feedback
          </p>
        </Link>
      </div>

      {progress?.currentLessonId && (
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Continue Learning</h3>
          <Link
            to={`/lessons/${progress.currentLessonId}`}
            className="text-primary-600 hover:underline"
          >
            Resume lesson →
          </Link>
        </div>
      )}
    </div>
  );
}
