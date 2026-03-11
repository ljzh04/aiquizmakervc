export enum QuestionType {
  MCQ = 'MCQ',
  TRUE_FALSE = 'TRUE_FALSE',
  ENUMERATION = 'ENUMERATION',
  SHORT_ANSWER = 'SHORT_ANSWER',
}

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
}

export enum TimerType {
  NONE = 'NONE',
  GLOBAL = 'GLOBAL',
  PER_QUESTION = 'PER_QUESTION',
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  choices?: string[]; // For MCQ and TRUE_FALSE
  correctAnswer: string | string[]; // String for MCQ/TF/ShortAnswer, Array for Enumeration
  expectedCount?: number; // For Enumeration
  timerSeconds?: number; // For PER_QUESTION mode
  points?: number; // Custom points for this question
}

export interface Quiz {
  id: string;
  topic: string;
  difficulty: Difficulty;
  questions: Question[];
  createdAt: number;
  timerType: TimerType;
  globalTimerSeconds?: number; // For GLOBAL mode
  customScoringEnabled?: boolean;
}

export interface UserAttempt {
  id: string;
  quizId: string;
  answers: Record<string, string | string[]>;
  score: number;
  maxScore: number;
  totalQuestions: number;
  timestamp: number;
}
