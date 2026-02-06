import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Topic } from '@learn-pg/shared';

export default function TopicsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: api.getTopics
  });

  const topics: Topic[] = data?.topics || [];

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
                <Link
                  to={`/lessons/${topic.lessons[0]?.id}`}
                  className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded transition-colors"
                >
                  Start Learning
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
