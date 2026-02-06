import { Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import TopicsPage from './pages/TopicsPage';
import LessonPage from './pages/LessonPage';
import EvaluationPage from './pages/EvaluationPage';
import ProgressPage from './pages/ProgressPage';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex space-x-8">
              <Link to="/" className="text-xl font-bold text-primary-600">
                Learn PostgreSQL
              </Link>
              <Link to="/topics" className="text-gray-700 hover:text-primary-600 px-3 py-2">
                Topics
              </Link>
              <Link to="/evaluation" className="text-gray-700 hover:text-primary-600 px-3 py-2">
                Evaluation
              </Link>
              <Link to="/progress" className="text-gray-700 hover:text-primary-600 px-3 py-2">
                Progress
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/lessons/:lessonId" element={<LessonPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
          <Route path="/progress" element={<ProgressPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
