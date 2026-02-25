const API_BASE = 'http://localhost:3000/api';

export const api = {
  // Curriculum
  getTopics: () => fetch(`${API_BASE}/curriculum/topics`).then(r => r.json()),
  getTopic: (id: string) => fetch(`${API_BASE}/curriculum/topics/${id}`).then(r => r.json()),
  getLesson: (id: string) => fetch(`${API_BASE}/curriculum/lessons/${id}`).then(r => r.json()),
  getExercises: (lessonId: string) =>
    fetch(`${API_BASE}/curriculum/lessons/${lessonId}/exercises`).then(r => r.json()),

  // Exercises
  setupExercise: (id: string) =>
    fetch(`${API_BASE}/exercises/${id}/setup`, { method: 'POST' }).then(r => r.json()),
  submitExercise: (id: string, query: string) =>
    fetch(`${API_BASE}/exercises/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    }).then(r => r.json()),
  getHints: (id: string, count: number) =>
    fetch(`${API_BASE}/exercises/${id}/hints?count=${count}`).then(r => r.json()),
  getExerciseAttempts: (id: string) =>
    fetch(`${API_BASE}/exercises/${id}/attempts`).then(r => r.json()),
  // Multi-session exercises
  startSession: (exerciseId: string) =>
    fetch(`${API_BASE}/exercises/${exerciseId}/start-session`, { method: 'POST' }).then(r => r.json()),
  executeOnSession: (exerciseId: string, sessionId: string, query: string, session: 'A' | 'B', stepIndex: number) =>
    fetch(`${API_BASE}/exercises/${exerciseId}/session/${sessionId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, session, stepIndex })
    }).then(r => r.json()),
  closeSession: (exerciseId: string, sessionId: string) =>
    fetch(`${API_BASE}/exercises/${exerciseId}/session/${sessionId}/close`, { method: 'POST' }).then(r => r.json()),

  // Progress
  getProgress: () => fetch(`${API_BASE}/progress`).then(r => r.json()),
  updateProgress: (updates: any) =>
    fetch(`${API_BASE}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }).then(r => r.json()),
  getWeakAreas: () => fetch(`${API_BASE}/progress/weak-areas`).then(r => r.json()),

  // Evaluation
  startEvaluation: () =>
    fetch(`${API_BASE}/evaluation/start`, { method: 'POST' }).then(r => r.json()),
  getNextQuestion: (sessionId: string) =>
    fetch(`${API_BASE}/evaluation/${sessionId}/next`).then(r => r.json()),
  submitAnswer: (sessionId: string, data: any) =>
    fetch(`${API_BASE}/evaluation/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),
  completeEvaluation: (sessionId: string) =>
    fetch(`${API_BASE}/evaluation/${sessionId}/complete`, { method: 'POST' }).then(r => r.json())
};
