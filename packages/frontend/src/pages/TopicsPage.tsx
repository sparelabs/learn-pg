import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Topic, Lesson, TopicProgress } from '@learn-pg/shared';

function getLessonStatus(lesson: Lesson, completedSet: Set<string>): 'not-started' | 'in-progress' | 'complete' {
  const exercises = lesson.exercises || [];
  if (exercises.length === 0) return 'not-started';
  const completedCount = exercises.filter(ex => completedSet.has(ex.id)).length;
  if (completedCount === 0) return 'not-started';
  if (completedCount >= exercises.length) return 'complete';
  return 'in-progress';
}

function getLessonButtonLabel(status: 'not-started' | 'in-progress' | 'complete'): string | undefined {
  switch (status) {
    case 'complete': return 'Complete';
    case 'in-progress': return 'Continue';
    default: return undefined;
  }
}

export default function TopicsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: api.getTopics
  });

  const { data: progressData } = useQuery({
    queryKey: ['progress'],
    queryFn: api.getProgress
  });

  const topics: Topic[] = data?.topics || [];
  const completedSet = useMemo(
    () => {
      const ids: string[] = (progressData?.progress?.topicProgress || [])
        .flatMap((tp: TopicProgress) => tp.completedExercises);
      return new Set<string>(ids);
    },
    [progressData]
  );

  if (isLoading) {
    return <div className="max-w-7xl mx-auto px-4 py-8">Loading...</div>;
  }

  const topicsByLevel = topics.reduce((acc, topic) => {
    if (!acc[topic.level]) acc[topic.level] = [];
    acc[topic.level].push(topic);
    return acc;
  }, {} as Record<number, Topic[]>);

  const levelNames: Record<number, string> = {
    1: 'Foundational Topics',
    2: 'Advanced Query Topics',
    3: 'Query Planner & Optimization',
    4: 'Operational Health & Performance',
    5: 'Advanced Topics'
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Learning Topics</h1>

      {Object.entries(topicsByLevel).map(([level, levelTopics]) => (
        <div key={level} className="mb-12">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Level {level}: {levelNames[parseInt(level)]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {levelTopics.map(topic => (
              <div key={topic.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{topic.title}</h3>
                <p className="text-gray-600 text-sm mb-4">{topic.description}</p>
                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span>{topic.lessons.length} lessons</span>
                  <span>{topic.estimatedWeeks} weeks</span>
                </div>
                {topic.prerequisites.length > 0 && (
                  <div className="text-xs text-gray-500 mb-4">
                    Prerequisites: {topic.prerequisites.length}
                  </div>
                )}
                <div className="space-y-2">
                  {topic.lessons.map((lesson) => {
                    const status = getLessonStatus(lesson, completedSet);
                    const buttonLabel = getLessonButtonLabel(status);
                    const buttonText = buttonLabel ? `${lesson.title} (${buttonLabel})` : lesson.title;
                    return (
                      <Link
                        key={lesson.id}
                        to={`/lessons/${lesson.id}`}
                        className={`block px-4 py-2 rounded transition-colors text-sm ${
                          status === 'complete'
                            ? 'bg-green-100 hover:bg-green-200 text-green-800'
                            : status === 'in-progress'
                            ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800'
                            : 'bg-primary-600 hover:bg-primary-700 text-white'
                        }`}
                      >
                        {buttonText}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
