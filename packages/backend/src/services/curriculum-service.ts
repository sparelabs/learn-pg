import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import type { Topic, Lesson, Exercise } from '@learn-pg/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class CurriculumService {
  private topics: Map<string, Topic> = new Map();
  private lessons: Map<string, Lesson> = new Map();
  private exercises: Map<string, Exercise> = new Map();
  private curriculumPath: string;

  constructor(curriculumPath?: string) {
    this.curriculumPath = curriculumPath || join(__dirname, '../../../../curriculum');
  }

  async loadCurriculum(): Promise<void> {
    const topicsPath = join(this.curriculumPath, 'topics');

    if (!existsSync(topicsPath)) {
      console.warn(`Curriculum path does not exist: ${topicsPath}`);
      return;
    }

    const topicDirs = readdirSync(topicsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const topicDir of topicDirs) {
      const topicPath = join(topicsPath, topicDir);
      const metaPath = join(topicPath, 'meta.json');

      if (!existsSync(metaPath)) {
        continue;
      }

      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      const topic: Topic = {
        id: topicDir,
        title: meta.title,
        description: meta.description,
        level: meta.level,
        estimatedWeeks: meta.estimatedWeeks,
        prerequisites: meta.prerequisites || [],
        lessons: [],
        order: meta.order || 0
      };

      // Load lessons for this topic
      const lessonsPath = join(topicPath, 'lessons');
      if (existsSync(lessonsPath)) {
        const lessonFiles = readdirSync(lessonsPath)
          .filter(f => f.endsWith('.md'))
          .sort();

        for (let i = 0; i < lessonFiles.length; i++) {
          const lessonFile = lessonFiles[i];
          const lessonPath = join(lessonsPath, lessonFile);
          const lessonId = `${topicDir}-${lessonFile.replace('.md', '')}`;

          const fileContent = readFileSync(lessonPath, 'utf-8');
          const { data, content } = matter(fileContent);

          const lesson: Lesson = {
            id: lessonId,
            topicId: topicDir,
            title: data.title || 'Untitled Lesson',
            description: data.description || '',
            content,
            exercises: [],
            order: i,
            estimatedMinutes: data.estimatedMinutes || 30
          };

          // Load exercises for this lesson
          const exercisesPath = join(topicPath, 'exercises', lessonFile.replace('.md', '.ts'));
          if (existsSync(exercisesPath)) {
            try {
              const exerciseModule = await import(exercisesPath);
              if (exerciseModule.exercises && Array.isArray(exerciseModule.exercises)) {
                lesson.exercises = exerciseModule.exercises.map((ex: Exercise) => {
                  const exerciseId = `${lessonId}-${ex.id}`;
                  const fullExercise = { ...ex, id: exerciseId, lessonId };
                  this.exercises.set(exerciseId, fullExercise);
                  return fullExercise;
                });
              }
            } catch (error) {
              console.warn(`Failed to load exercises for ${lessonId}:`, error);
            }
          }

          this.lessons.set(lessonId, lesson);
          topic.lessons.push(lesson);
        }
      }

      this.topics.set(topicDir, topic);
    }
  }

  getAllTopics(): Topic[] {
    return Array.from(this.topics.values()).sort((a, b) => a.order - b.order);
  }

  getTopic(topicId: string): Topic | undefined {
    return this.topics.get(topicId);
  }

  getLesson(lessonId: string): Lesson | undefined {
    return this.lessons.get(lessonId);
  }

  getExercise(exerciseId: string): Exercise | undefined {
    return this.exercises.get(exerciseId);
  }

  getLessonsForTopic(topicId: string): Lesson[] {
    return Array.from(this.lessons.values())
      .filter(l => l.topicId === topicId)
      .sort((a, b) => a.order - b.order);
  }

  getExercisesForLesson(lessonId: string): Exercise[] {
    return Array.from(this.exercises.values())
      .filter(e => e.lessonId === lessonId)
      .sort((a, b) => a.order - b.order);
  }

  searchTopics(query: string): Topic[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.topics.values())
      .filter(t =>
        t.title.toLowerCase().includes(lowerQuery) ||
        t.description.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => a.order - b.order);
  }

  getTopicsByLevel(level: number): Topic[] {
    return Array.from(this.topics.values())
      .filter(t => t.level === level)
      .sort((a, b) => a.order - b.order);
  }

  getPrerequisiteChain(topicId: string): Topic[] {
    const chain: Topic[] = [];
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const topic = this.topics.get(id);
      if (!topic) return;

      for (const prereqId of topic.prerequisites) {
        traverse(prereqId);
      }

      chain.push(topic);
    };

    traverse(topicId);
    return chain;
  }
}

export const curriculumService = new CurriculumService();
