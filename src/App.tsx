import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  Plus, 
  History, 
  Settings, 
  BrainCircuit, 
  ChevronRight, 
  Trophy, 
  Clock, 
  BookOpen,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Save,
  Download,
  Edit,
  PlusCircle,
  Sparkles
} from 'lucide-react';
import { Quiz, QuestionType, Difficulty, Question, UserAttempt, TimerType } from './types';
import { generateQuiz } from './services/gemini';

// --- Constants & Built-ins ---

const BUILTIN_QUIZZES: Quiz[] = [
  {
    id: 'builtin-1',
    topic: 'Mathematics: Calculus & Algebra',
    difficulty: Difficulty.MEDIUM,
    createdAt: Date.now(),
    timerType: TimerType.NONE,
    customScoringEnabled: false,
    questions: [
      {
        id: 'q1',
        type: QuestionType.MCQ,
        text: 'What is the derivative of $f(x) = x^2$?',
        choices: ['$2x$', '$x$', '$x^2$', '1'],
        correctAnswer: '$2x$',
        timerSeconds: 30,
        points: 1
      },
      {
        id: 'q2',
        type: QuestionType.SHORT_ANSWER,
        text: 'Solve for $x$ in the equation: $2x + 5 = 15$.',
        correctAnswer: '5',
        timerSeconds: 45,
        points: 2
      },
      {
        id: 'q3',
        type: QuestionType.ENUMERATION,
        text: 'List the first 3 prime numbers.',
        correctAnswer: ['2', '3', '5'],
        expectedCount: 3,
        timerSeconds: 60,
        points: 3
      },
      {
        id: 'q4',
        type: QuestionType.TRUE_FALSE,
        text: 'The value of $\\pi$ is exactly 3.14.',
        choices: ['True', 'False'],
        correctAnswer: 'False',
        timerSeconds: 15,
        points: 1
      }
    ]
  },
  {
    id: 'builtin-2',
    topic: 'Web Development Basics',
    difficulty: Difficulty.EASY,
    createdAt: Date.now(),
    timerType: TimerType.NONE,
    customScoringEnabled: false,
    questions: [
      {
        id: 'q1',
        type: QuestionType.MCQ,
        text: 'Which HTML tag is used to define an internal style sheet?',
        choices: ['<css>', '<script>', '<style>', '<html>'],
        correctAnswer: '<style>',
        timerSeconds: 20,
        points: 1
      },
      {
        id: 'q2',
        type: QuestionType.ENUMERATION,
        text: 'List the 3 main technologies used for front-end web development.',
        correctAnswer: ['HTML', 'CSS', 'JavaScript'],
        expectedCount: 3,
        timerSeconds: 40,
        points: 3
      },
      {
        id: 'q3',
        type: QuestionType.SHORT_ANSWER,
        text: 'What does CSS stand for?',
        correctAnswer: 'Cascading Style Sheets',
        timerSeconds: 30,
        points: 2
      }
    ]
  }
];

// --- Components ---

const Markdown = ({ children, className = '' }: { children: string; className?: string }) => (
  <div className={`markdown-content ${className}`}>
    <ReactMarkdown 
      remarkPlugins={[remarkMath]} 
      rehypePlugins={[rehypeKatex]}
    >
      {children}
    </ReactMarkdown>
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = '', 
  disabled = false,
  loading = false
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}) => {
  const variants = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm',
    secondary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    outline: 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
    ghost: 'text-zinc-600 hover:bg-zinc-100',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string; key?: React.Key }) => (
  <div className={`bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

// --- Main App ---

const normalizeString = (str: string) => str.toLowerCase().trim();
const normalizeMath = (str: string) => str.toLowerCase().replace(/\s+/g, '').replace(/\^/g, '^');

const getCorrectAnswersArray = (correctAnswer: string | string[]): string[] => {
  if (Array.isArray(correctAnswer)) return correctAnswer;
  if (typeof correctAnswer === 'string' && correctAnswer.includes('|')) {
    return correctAnswer.split('|').map(s => s.trim()).filter(Boolean);
  }
  return [String(correctAnswer)];
};

const isAnswerCorrect = (userAnswer: string | string[], correctAnswer: string | string[], type: QuestionType): boolean => {
  const u = userAnswer || '';
  const cArr = getCorrectAnswersArray(correctAnswer);
  
  if (type === QuestionType.ENUMERATION) {
    const uArr = Array.isArray(u) ? u : [String(u)];
    return cArr.every(c => 
      uArr.some(ua => normalizeString(ua) === normalizeString(c))
    );
  }

  const uStr = String(u);

  // Check if it matches any of the acceptable answers
  return cArr.some(c => {
    const normC = normalizeString(c);
    const normU = normalizeString(uStr);
    
    // Basic match
    if (normC === normU) return true;
    
    // Math/Expression match (remove all spaces)
    if (normalizeMath(c) === normalizeMath(uStr)) return true;
    
    return false;
  });
};

const calculateQuestionScore = (userAnswer: string | string[], q: Question): number => {
  const qPoints = q.points || (q.type === QuestionType.SHORT_ANSWER ? 2 : q.type === QuestionType.ENUMERATION ? (q.expectedCount || 1) : 1);
  const cArr = getCorrectAnswersArray(q.correctAnswer);
  
  if (q.type === QuestionType.ENUMERATION) {
    const uArr = Array.isArray(userAnswer) ? userAnswer : [String(userAnswer)];
    
    const matches = uArr.filter(u => 
      u && cArr.some(c => normalizeString(c) === normalizeString(u))
    ).length;
    
    const itemPoints = qPoints / cArr.length;
    return Math.min(qPoints, Math.round(matches * itemPoints * 100) / 100);
  }

  return isAnswerCorrect(userAnswer, q.correctAnswer, q.type) ? qPoints : 0;
};

export default function App() {
  const [view, setView] = useState<'landing' | 'generator' | 'quiz' | 'results' | 'history' | 'builder'>('landing');
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string | string[]>>({});
  const [lastAttempt, setLastAttempt] = useState<UserAttempt | null>(null);
  const [savedQuizzes, setSavedQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved quizzes from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ai_quizmaker_quizzes');
    let quizzes: Quiz[] = [];
    if (saved) {
      try {
        quizzes = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved quizzes", e);
      }
    }
    
    // Initialize with built-ins if library is empty and not initialized before
    if (quizzes.length === 0 && !localStorage.getItem('ai_quizmaker_initialized')) {
      quizzes = BUILTIN_QUIZZES;
      localStorage.setItem('ai_quizmaker_quizzes', JSON.stringify(quizzes));
      localStorage.setItem('ai_quizmaker_initialized', 'true');
    }
    setSavedQuizzes(quizzes);
  }, []);

  const saveQuizToStorage = (quiz: Quiz) => {
    const updated = [quiz, ...savedQuizzes.filter(q => q.id !== quiz.id)];
    setSavedQuizzes(updated);
    localStorage.setItem('ai_quizmaker_quizzes', JSON.stringify(updated));
  };

  const deleteQuizFromStorage = (id: string) => {
    const updated = savedQuizzes.filter(q => q.id !== id);
    setSavedQuizzes(updated);
    localStorage.setItem('ai_quizmaker_quizzes', JSON.stringify(updated));
  };

  const handleGenerate = async (topic: string, difficulty: Difficulty, types: QuestionType[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const quiz = await generateQuiz(topic, difficulty, types);
      setCurrentQuiz(quiz);
      setUserAnswers({});
      setView('quiz');
    } catch (err: any) {
      setError(err.message || "Failed to generate quiz. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitQuiz = () => {
    if (!currentQuiz) return;

    let score = 0;
    let maxScore = 0;

    currentQuiz.questions.forEach(q => {
      const userAnswer = userAnswers[q.id];
      const qPoints = q.points || (q.type === QuestionType.SHORT_ANSWER ? 2 : q.type === QuestionType.ENUMERATION ? (q.expectedCount || 1) : 1);
      
      maxScore += qPoints;
      score += calculateQuestionScore(userAnswer, q);
    });

    const attempt: UserAttempt = {
      id: crypto.randomUUID(),
      quizId: currentQuiz.id,
      answers: userAnswers,
      score: Math.round(score * 100) / 100, // Round to 2 decimal places
      maxScore,
      totalQuestions: currentQuiz.questions.length,
      timestamp: Date.now(),
    };

    setLastAttempt(attempt);
    setView('results');
  };

  const startQuiz = (quiz: Quiz) => {
    setCurrentQuiz(quiz);
    setUserAnswers({});
    setView('quiz');
  };

  const downloadQuiz = (quiz: Quiz) => {
    const dataStr = JSON.stringify(quiz, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${quiz.topic.replace(/\s+/g, '_')}_quiz.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCreateNew = () => {
    const newQuiz: Quiz = {
      id: crypto.randomUUID(),
      topic: '',
      difficulty: Difficulty.MEDIUM,
      questions: [],
      createdAt: Date.now(),
      timerType: TimerType.NONE,
      globalTimerSeconds: 300,
      customScoringEnabled: false
    };
    setEditingQuiz(newQuiz);
    setView('builder');
  };

  const handleEditQuiz = (quiz: Quiz) => {
    setEditingQuiz({ ...quiz });
    setView('builder');
  };

  const handleSaveEditedQuiz = (quiz: Quiz) => {
    saveQuizToStorage(quiz);
    setView('history');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-bottom border-zinc-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => setView('landing')}
          >
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white group-hover:scale-110 transition-transform">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">AI QuizMaker</span>
          </div>
          
          <nav className="flex items-center gap-1">
            <Button variant="ghost" onClick={handleCreateNew}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create</span>
            </Button>
            <Button variant="ghost" onClick={() => setView('history')}>
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Library</span>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 w-full">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <LandingPage 
              onStart={handleCreateNew} 
              onViewHistory={() => setView('history')}
              savedCount={savedQuizzes.length}
            />
          )}
          
          {view === 'builder' && editingQuiz && (
            <QuizBuilder 
              quiz={editingQuiz}
              onSave={handleSaveEditedQuiz}
              onCancel={() => setView('landing')}
              onGoToAI={() => setView('generator')}
              onDownload={downloadQuiz}
            />
          )}

          {view === 'generator' && (
            <Generator 
              onGenerate={handleGenerate} 
              isLoading={isLoading} 
              error={error}
              onBack={() => setView('builder')}
            />
          )}

          {view === 'quiz' && currentQuiz && (
            <QuizPlayer 
              quiz={currentQuiz} 
              answers={userAnswers}
              setAnswers={setUserAnswers}
              onSubmit={handleSubmitQuiz}
              onCancel={() => setView('landing')}
            />
          )}

          {view === 'results' && lastAttempt && currentQuiz && (
            <Results 
              attempt={lastAttempt} 
              quiz={currentQuiz}
              onRetry={() => {
                setUserAnswers({});
                setView('quiz');
              }}
              onSave={() => {
                saveQuizToStorage(currentQuiz);
                alert("Quiz saved to your library!");
              }}
              onHome={() => setView('landing')}
            />
          )}

          {view === 'history' && (
            <HistoryView 
              quizzes={savedQuizzes}
              onSelect={startQuiz}
              onEdit={handleEditQuiz}
              onDelete={deleteQuizFromStorage}
              onDownload={downloadQuiz}
              onBack={() => setView('landing')}
            />
          )}
        </AnimatePresence>
      </main>

      <footer className="py-8 border-t border-zinc-100 text-center text-zinc-400 text-sm">
        <p>© {new Date().getFullYear()} AI QuizMaker • Powered by Gemini AI</p>
      </footer>
    </div>
  );
}

// --- Sub-Views ---

function LandingPage({ onStart, onViewHistory, savedCount }: { onStart: () => void; onViewHistory: () => void; savedCount: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="text-center space-y-12"
    >
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
          <BrainCircuit className="w-3 h-3" />
          Next-Gen Assessment
        </div>
        <h1 className="text-5xl sm:text-7xl font-display font-bold tracking-tight text-zinc-900 leading-[1.1]">
          Turn any topic into a <span className="text-emerald-600">Quiz</span> in seconds.
        </h1>
        <p className="text-xl text-zinc-500 leading-relaxed">
          The ultimate tool for educators and learners. Generate customized assessments, 
          practice instantly, and track your progress—all powered by advanced AI.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Button onClick={onStart} className="px-8 py-4 text-lg rounded-2xl w-full sm:w-auto">
          Get Started
          <ChevronRight className="w-5 h-5" />
        </Button>
        <Button variant="outline" onClick={onViewHistory} className="px-8 py-4 text-lg rounded-2xl w-full sm:w-auto">
          View Library
          <span className="ml-1 px-2 py-0.5 bg-zinc-100 rounded-md text-sm">{savedCount}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12">
        {[
          { icon: BrainCircuit, title: "AI Powered", desc: "Leverage Gemini 1.5 for high-quality, relevant questions." },
          { icon: Clock, title: "Instant Results", desc: "Get immediate feedback and scoring on your attempts." },
          { icon: Save, title: "Local Storage", desc: "Your quizzes are saved directly in your browser." }
        ].map((feature, i) => (
          <Card key={i} className="p-6 text-left hover:border-emerald-200 transition-colors">
            <feature.icon className="w-8 h-8 text-emerald-600 mb-4" />
            <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
            <p className="text-zinc-500 text-sm">{feature.desc}</p>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}

function Generator({ 
  onGenerate, 
  isLoading, 
  error,
  onBack
}: { 
  onGenerate: (topic: string, difficulty: Difficulty, types: QuestionType[]) => void;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [types, setTypes] = useState<QuestionType[]>([QuestionType.MCQ]);

  const toggleType = (type: QuestionType) => {
    if (types.includes(type)) {
      if (types.length > 1) setTypes(types.filter(t => t !== type));
    } else {
      setTypes([...types, type]);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-xl mx-auto space-y-4"
    >
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" />
        Back to Builder
      </Button>
      <Card className="p-8 space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-display font-bold">Configure Your Quiz</h2>
          <p className="text-zinc-500 text-sm">Tell us what you want to learn today.</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Topic or Subject</label>
            <input 
              type="text"
              placeholder="e.g. Quantum Physics, World War II, JavaScript Basics"
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Difficulty Level</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(Difficulty).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                    difficulty === d 
                      ? 'bg-zinc-900 border-zinc-900 text-white' 
                      : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Question Formats</label>
            <div className="space-y-2">
              {[
                { type: QuestionType.MCQ, label: "Multiple Choice" },
                { type: QuestionType.TRUE_FALSE, label: "True or False" },
                { type: QuestionType.SHORT_ANSWER, label: "Short Answer" },
                { type: QuestionType.ENUMERATION, label: "Enumeration (List)" }
              ].map((t) => (
                <label key={t.type} className="flex items-center gap-3 p-3 rounded-xl border border-zinc-100 hover:bg-zinc-50 cursor-pointer transition-all">
                  <input 
                    type="checkbox"
                    checked={types.includes(t.type)}
                    onChange={() => toggleType(t.type)}
                    className="w-5 h-5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span className="text-sm font-medium text-zinc-700">{t.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <Button 
          className="w-full py-4 text-lg rounded-2xl" 
          onClick={() => onGenerate(topic, difficulty, types)}
          loading={isLoading}
          disabled={!topic.trim()}
        >
          {isLoading ? 'Generating Quiz...' : 'Generate Quiz'}
        </Button>
      </Card>
    </motion.div>
  );
}

function QuizPlayer({ 
  quiz, 
  answers, 
  setAnswers, 
  onSubmit,
  onCancel
}: { 
  quiz: Quiz; 
  answers: Record<string, string | string[]>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const currentQuestion = quiz.questions[currentIndex];
  const isLast = currentIndex === quiz.questions.length - 1;

  // Initialize timer
  useEffect(() => {
    if (quiz.timerType === TimerType.GLOBAL) {
      if (timeLeft === null) {
        setTimeLeft(quiz.globalTimerSeconds || 300);
      }
    } else if (quiz.timerType === TimerType.PER_QUESTION) {
      setTimeLeft(currentQuestion.timerSeconds || 30);
    } else {
      setTimeLeft(null);
    }
  }, [quiz.timerType, quiz.globalTimerSeconds, currentIndex, currentQuestion.timerSeconds]);

  // Timer countdown logic
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) {
      if (timeLeft === 0) {
        if (quiz.timerType === TimerType.GLOBAL) {
          onSubmit();
        } else if (quiz.timerType === TimerType.PER_QUESTION) {
          if (isLast) {
            onSubmit();
          } else {
            setCurrentIndex(prev => prev + 1);
          }
        }
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, quiz.timerType, isLast, onSubmit]);

  const handleAnswer = (val: string | string[]) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: val }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4" />
          Quit
        </Button>
        <div className="flex flex-col items-center">
          <div className="text-sm font-medium text-zinc-500">
            Question {currentIndex + 1} of {quiz.questions.length}
          </div>
          {timeLeft !== null && (
            <div className={`flex items-center gap-1 text-sm font-bold ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-zinc-700'}`}>
              <Clock className="w-4 h-4" />
              {formatTime(timeLeft)}
            </div>
          )}
        </div>
        <div className="w-24 h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300" 
            style={{ width: `${((currentIndex + 1) / quiz.questions.length) * 100}%` }}
          />
        </div>
      </div>

      <Card className="p-8 min-h-[400px] flex flex-col">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="px-2 py-1 bg-zinc-100 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {currentQuestion.type.replace('_', ' ')}
            </span>
            {quiz.customScoringEnabled && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                {currentQuestion.points || (currentQuestion.type === QuestionType.SHORT_ANSWER ? 2 : currentQuestion.type === QuestionType.ENUMERATION ? (currentQuestion.expectedCount || 1) : 1)} Points
              </span>
            )}
          </div>
          <div className="text-2xl font-semibold leading-tight">
            <Markdown>{currentQuestion.text}</Markdown>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {currentQuestion.type === QuestionType.MCQ || currentQuestion.type === QuestionType.TRUE_FALSE ? (
            <div className="space-y-3">
              {currentQuestion.choices?.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(choice)}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between group ${
                    answers[currentQuestion.id] === choice
                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-md'
                      : 'border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <div className="font-medium">
                    <Markdown>{choice}</Markdown>
                  </div>
                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ml-4 ${
                    answers[currentQuestion.id] === choice ? 'border-white/30 bg-white/10' : 'border-zinc-200'
                  }`}>
                    {String.fromCharCode(65 + i)}
                  </div>
                </button>
              ))}
            </div>
          ) : currentQuestion.type === QuestionType.SHORT_ANSWER ? (
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Type your answer here..."
                className="w-full p-4 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={String(answers[currentQuestion.id] || '')}
                onChange={(e) => handleAnswer(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500 font-medium">Provide {currentQuestion.expectedCount || 1} items:</p>
              <div className="space-y-3">
                {Array.from({ length: currentQuestion.expectedCount || 1 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-zinc-400 font-mono text-sm w-4">{i + 1}.</span>
                    <input
                      type="text"
                      placeholder={`Item ${i + 1}`}
                      className="flex-1 p-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      value={(answers[currentQuestion.id] as string[])?.[i] || ''}
                      onChange={(e) => {
                        const currentAnswers = [...(answers[currentQuestion.id] as string[] || [])];
                        // Ensure the array is long enough
                        while (currentAnswers.length < (currentQuestion.expectedCount || 1)) {
                          currentAnswers.push('');
                        }
                        currentAnswers[i] = e.target.value;
                        handleAnswer(currentAnswers);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-12 flex items-center justify-between">
          <Button 
            variant="outline" 
            disabled={currentIndex === 0 || quiz.timerType === TimerType.PER_QUESTION}
            onClick={() => setCurrentIndex(prev => prev - 1)}
          >
            Previous
          </Button>
          
          {isLast ? (
            <Button variant="secondary" onClick={onSubmit} className="px-8">
              Submit Quiz
            </Button>
          ) : (
            <Button 
              onClick={() => setCurrentIndex(prev => prev + 1)} 
              className="px-8"
              disabled={quiz.timerType === TimerType.PER_QUESTION}
            >
              Next Question
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function Results({ 
  attempt, 
  quiz, 
  onRetry, 
  onSave, 
  onHome 
}: { 
  attempt: UserAttempt; 
  quiz: Quiz; 
  onRetry: () => void; 
  onSave: () => void; 
  onHome: () => void;
}) {
  const percentage = Math.round((attempt.score / attempt.maxScore) * 100);
  const isPassed = percentage >= 70;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-3xl mx-auto space-y-8"
    >
      <Card className="p-12 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-zinc-50 border-4 border-zinc-100 mb-4 relative">
          {isPassed ? (
            <Trophy className="w-12 h-12 text-yellow-500" />
          ) : (
            <AlertCircle className="w-12 h-12 text-zinc-400" />
          )}
          <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg ${isPassed ? 'bg-emerald-500' : 'bg-zinc-500'}`}>
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-4xl font-display font-bold">
            {isPassed ? 'Great Job!' : 'Keep Practicing!'}
          </h2>
          <p className="text-zinc-500">You scored {attempt.score} out of {attempt.maxScore}</p>
        </div>

        <div className="text-7xl font-display font-black text-zinc-900">
          {percentage}%
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
          <Button onClick={onRetry} variant="outline">Retry Quiz</Button>
          <Button onClick={onSave} variant="secondary">
            <Save className="w-4 h-4" />
            Save to Library
          </Button>
          <Button onClick={onHome} variant="ghost">Return Home</Button>
        </div>
      </Card>

      <div className="space-y-4">
        <h3 className="text-xl font-bold px-2">Review Answers</h3>
        <div className="space-y-4">
          {quiz.questions.map((q, i) => {
            const userAnswer = attempt.answers[q.id];
            const qPoints = q.points || (q.type === QuestionType.SHORT_ANSWER ? 2 : q.type === QuestionType.ENUMERATION ? (q.expectedCount || 1) : 1);
            const earnedPoints = calculateQuestionScore(userAnswer, q);
            const isCorrect = isAnswerCorrect(userAnswer, q.correctAnswer, q.type);
            const isPartial = !isCorrect && earnedPoints > 0;

            return (
              <Card key={q.id} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-400">Q{i + 1}</span>
                        {isCorrect ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase">
                            <CheckCircle2 className="w-3 h-3" /> Correct
                          </span>
                        ) : isPartial ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase">
                            <CheckCircle2 className="w-3 h-3" /> Partial
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 uppercase">
                            <XCircle className="w-3 h-3" /> Incorrect
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase">
                        {earnedPoints} / {qPoints} pts
                      </div>
                    </div>
                    <div className="font-medium text-lg">
                      <Markdown>{q.text}</Markdown>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Your Answer</span>
                        <div className={`font-medium ${isCorrect ? 'text-emerald-700' : isPartial ? 'text-amber-700' : 'text-red-700'}`}>
                          {Array.isArray(userAnswer) ? (
                            <ul className="list-disc list-inside">
                              {userAnswer.map((a, idx) => a ? <li key={idx}>{a}</li> : null)}
                            </ul>
                          ) : (
                            String(userAnswer) || 'No answer'
                          )}
                        </div>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">
                          {getCorrectAnswersArray(q.correctAnswer).length > 1 ? 'Acceptable Answers' : 'Correct Answer'}
                        </span>
                        <div className="font-medium text-emerald-800">
                          {getCorrectAnswersArray(q.correctAnswer).length > 1 ? (
                            <ul className="list-disc list-inside">
                              {getCorrectAnswersArray(q.correctAnswer).map((a, idx) => <li key={idx}>{a}</li>)}
                            </ul>
                          ) : (
                            Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function HistoryView({ 
  quizzes, 
  onSelect, 
  onEdit,
  onDelete, 
  onDownload,
  onBack 
}: { 
  quizzes: Quiz[]; 
  onSelect: (quiz: Quiz) => void; 
  onEdit: (quiz: Quiz) => void;
  onDelete: (id: string) => void;
  onDownload: (quiz: Quiz) => void;
  onBack: () => void;
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-display font-bold">Your Library</h2>
          <p className="text-zinc-500">Quizzes saved locally in this browser.</p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </div>

      {quizzes.length === 0 ? (
        <Card className="p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-8 h-8 text-zinc-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">No quizzes saved yet</h3>
            <p className="text-zinc-500 max-w-xs mx-auto">Generate your first quiz and save it to see it here.</p>
          </div>
          <Button onClick={onBack}>Create a Quiz</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="group hover:border-zinc-300 transition-all">
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        quiz.difficulty === Difficulty.EASY ? 'bg-emerald-50 text-emerald-600' :
                        quiz.difficulty === Difficulty.MEDIUM ? 'bg-blue-50 text-blue-600' :
                        'bg-red-50 text-red-600'
                      }`}>
                        {quiz.difficulty}
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">
                        {new Date(quiz.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold leading-tight group-hover:text-emerald-600 transition-colors">
                      {quiz.topic}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(quiz);
                      }}
                      className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all"
                      title="Edit Quiz"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload(quiz);
                      }}
                      className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all"
                      title="Download JSON"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(quiz.id);
                      }}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Delete Quiz"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-zinc-500">
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    {quiz.questions.length} Questions
                  </div>
                  <div className="flex items-center gap-1">
                    <BrainCircuit className="w-4 h-4" />
                    {Array.from(new Set(quiz.questions.map(q => q.type))).length} Types
                  </div>
                </div>

                <Button className="w-full" onClick={() => onSelect(quiz)}>
                  Start Quiz
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function QuizBuilder({ 
  quiz, 
  onSave, 
  onCancel,
  onGoToAI,
  onDownload
}: { 
  quiz: Quiz; 
  onSave: (quiz: Quiz) => void; 
  onCancel: () => void;
  onGoToAI: () => void;
  onDownload: (quiz: Quiz) => void;
}) {
  const [localQuiz, setLocalQuiz] = useState<Quiz>({ ...quiz });

  const addQuestion = () => {
    const newQuestion: Question = {
      id: crypto.randomUUID(),
      type: QuestionType.MCQ,
      text: '',
      choices: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
      correctAnswer: 'Option 1',
      timerSeconds: 30,
      points: 1
    };
    setLocalQuiz(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion]
    }));
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setLocalQuiz(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === id ? { ...q, ...updates } : q)
    }));
  };

  const removeQuestion = (id: string) => {
    setLocalQuiz(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== id)
    }));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onCancel}>
            <ArrowLeft className="w-4 h-4" />
            Cancel
          </Button>
          <h2 className="text-3xl font-display font-bold">Quiz Builder</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onDownload(localQuiz)} className="text-zinc-600">
            <Download className="w-4 h-4" />
            Export JSON
          </Button>
          <Button variant="outline" onClick={onGoToAI} className="text-emerald-600 border-emerald-100 hover:bg-emerald-50">
            <Sparkles className="w-4 h-4" />
            Generate with AI
          </Button>
          <Button onClick={() => onSave(localQuiz)} disabled={!localQuiz.topic || localQuiz.questions.length === 0}>
            <Save className="w-4 h-4" />
            Save Quiz
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6 space-y-6">
            <h3 className="font-bold text-lg">General Info</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700">Quiz Topic</label>
                <input 
                  type="text"
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  value={localQuiz.topic || ''}
                  onChange={(e) => setLocalQuiz(prev => ({ ...prev, topic: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700">Difficulty</label>
                <select 
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  value={localQuiz.difficulty}
                  onChange={(e) => setLocalQuiz(prev => ({ ...prev, difficulty: e.target.value as Difficulty }))}
                >
                  {Object.values(Difficulty).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              
              <div className="space-y-2 pt-4 border-t border-zinc-100">
                <label className="text-sm font-semibold text-zinc-700">Timer Configuration</label>
                <div className="space-y-2">
                  {Object.values(TimerType).map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio"
                        checked={localQuiz.timerType === t}
                        onChange={() => setLocalQuiz(prev => ({ ...prev, timerType: t }))}
                      />
                      <span className="text-sm">{t.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              {localQuiz.timerType === TimerType.GLOBAL && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Global Timer (seconds)</label>
                  <input 
                    type="number"
                    className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    value={localQuiz.globalTimerSeconds || 300}
                    onChange={(e) => setLocalQuiz(prev => ({ ...prev, globalTimerSeconds: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              )}

              <div className="space-y-2 pt-4 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-zinc-700">Custom Scoring</label>
                  <input 
                    type="checkbox"
                    checked={!!localQuiz.customScoringEnabled}
                    onChange={(e) => setLocalQuiz(prev => ({ ...prev, customScoringEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight">
                  If enabled, you can set specific points for each question.
                </p>
              </div>
            </div>
          </Card>
          
          <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Sparkles className="w-5 h-5" />
              <h4 className="font-bold">AI Assistant</h4>
            </div>
            <p className="text-sm text-emerald-600 leading-relaxed">
              Don't want to write questions manually? Use our AI generator to create a full quiz in seconds.
            </p>
            <Button variant="secondary" onClick={onGoToAI} className="w-full">
              Try AI Generator
            </Button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="font-bold text-lg">Questions ({localQuiz.questions.length})</h3>
            <Button variant="outline" onClick={addQuestion} className="text-sm py-1.5">
              <PlusCircle className="w-4 h-4" />
              Add Question
            </Button>
          </div>

          <div className="space-y-4">
            {localQuiz.questions.map((q, idx) => (
              <Card key={q.id} className="p-6 space-y-4 border-l-4 border-l-zinc-900">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-zinc-400">#{idx + 1}</span>
                        <select 
                          className="text-xs font-bold uppercase tracking-wider bg-zinc-100 px-2 py-1 rounded border-none focus:ring-0"
                          value={q.type}
                          onChange={(e) => {
                            const newType = e.target.value as QuestionType;
                            const updates: Partial<Question> = { type: newType };
                            if (newType === QuestionType.TRUE_FALSE) {
                              updates.choices = ['True', 'False'];
                              updates.correctAnswer = 'True';
                              updates.points = 1;
                            } else if (newType === QuestionType.ENUMERATION) {
                              updates.correctAnswer = [''];
                              updates.expectedCount = 1;
                              updates.points = 1;
                            } else if (newType === QuestionType.MCQ) {
                              updates.points = 1;
                            } else if (newType === QuestionType.SHORT_ANSWER) {
                              updates.points = 2;
                            }
                            updateQuestion(q.id, updates);
                          }}
                        >
                          {Object.values(QuestionType).map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                        </select>
                      </div>

                      <div className="flex items-center gap-4">
                        {localQuiz.customScoringEnabled && (
                          <div className="flex items-center gap-2">
                            <Trophy className="w-3 h-3 text-zinc-400" />
                            <input 
                              type="number"
                              className="w-16 px-2 py-1 rounded border border-zinc-100 text-xs"
                              value={q.points || 1}
                              onChange={(e) => updateQuestion(q.id, { points: parseInt(e.target.value) || 0 })}
                            />
                            <span className="text-[10px] text-zinc-400 font-bold uppercase">pts</span>
                          </div>
                        )}

                        {localQuiz.timerType === TimerType.PER_QUESTION && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 text-zinc-400" />
                            <input 
                              type="number"
                              className="w-16 px-2 py-1 rounded border border-zinc-100 text-xs"
                              value={q.timerSeconds || 30}
                              onChange={(e) => updateQuestion(q.id, { timerSeconds: parseInt(e.target.value) || 0 })}
                            />
                            <span className="text-[10px] text-zinc-400 font-bold uppercase">sec</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <textarea 
                      className="w-full p-3 rounded-xl border border-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 text-lg font-medium resize-none"
                      placeholder="Enter question text... (Markdown supported)"
                      rows={2}
                      value={q.text || ''}
                      onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                    />

                    {/* Question Specific Inputs */}
                    {q.type === QuestionType.MCQ && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {q.choices?.map((choice, cIdx) => (
                          <div key={cIdx} className="flex items-center gap-2">
                            <input 
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={q.correctAnswer === choice}
                              onChange={() => updateQuestion(q.id, { correctAnswer: choice })}
                            />
                            <input 
                              type="text"
                              className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-100 text-sm"
                              value={choice || ''}
                              onChange={(e) => {
                                const newChoices = [...(q.choices || [])];
                                newChoices[cIdx] = e.target.value;
                                updateQuestion(q.id, { choices: newChoices });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === QuestionType.TRUE_FALSE && (
                      <div className="flex gap-4">
                        {['True', 'False'].map(val => (
                          <label key={val} className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={q.correctAnswer === val}
                              onChange={() => updateQuestion(q.id, { correctAnswer: val })}
                            />
                            <span className="text-sm font-medium">{val}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {q.type === QuestionType.SHORT_ANSWER && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-400 uppercase">Correct Answer</label>
                          <span className="text-[10px] text-zinc-400">Use | for multiple options</span>
                        </div>
                        <input 
                          type="text"
                          className="w-full px-4 py-2 rounded-xl border border-zinc-100 text-sm"
                          placeholder="e.g. sea | ocean | water"
                          value={String(q.correctAnswer || '')}
                          onChange={(e) => updateQuestion(q.id, { correctAnswer: e.target.value })}
                        />
                      </div>
                    )}

                    {q.type === QuestionType.ENUMERATION && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-400 uppercase">Correct Items</label>
                          <Button 
                            variant="ghost" 
                            className="text-[10px] py-0.5" 
                            onClick={() => {
                              const current = [...(q.correctAnswer as string[])];
                              current.push('');
                              updateQuestion(q.id, { correctAnswer: current, expectedCount: current.length });
                            }}
                          >
                            + Add Item
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {(q.correctAnswer as string[]).map((item, iIdx) => (
                            <div key={iIdx} className="flex items-center gap-2">
                              <span className="text-zinc-300 text-xs">{iIdx + 1}.</span>
                              <input 
                                type="text"
                                className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-100 text-sm"
                                value={item || ''}
                                onChange={(e) => {
                                  const current = [...(q.correctAnswer as string[])];
                                  current[iIdx] = e.target.value;
                                  updateQuestion(q.id, { correctAnswer: current });
                                }}
                              />
                              <button 
                                onClick={() => {
                                  const current = (q.correctAnswer as string[]).filter((_, i) => i !== iIdx);
                                  updateQuestion(q.id, { correctAnswer: current, expectedCount: current.length });
                                }}
                                className="text-zinc-300 hover:text-red-500"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => removeQuestion(q.id)}
                    className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            ))}

            {localQuiz.questions.length === 0 && (
              <div className="p-12 text-center border-2 border-dashed border-zinc-100 rounded-2xl space-y-4">
                <p className="text-zinc-400">No questions yet. Add one manually or use AI.</p>
                <Button variant="outline" onClick={addQuestion}>
                  Add First Question
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
