import { useState, useEffect } from "react";
import {
  BookOpen, Star, Trophy, Flame, Lock, CheckCircle2,
  ChevronRight, ArrowLeft, Loader2, Award, Languages,
  GraduationCap, Target, XCircle, Check, Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, apiFetch } from "../utils/api";

// ---------- Types ----------

interface Lesson {
  id: number; title: string; type: string; xp: number;
}
interface Unit {
  id: number; title: string; lessons: Lesson[];
}
interface Level {
  name: string; description: string; units: Unit[];
}
interface Curriculum {
  name: string; native_name: string; flag: string;
  available: boolean; levels: Record<string, Level>;
}
interface Progress {
  level: string; unit: number; lesson: number;
  xp: number; streak_days: number; accuracy: number;
  exercises_completed: number; exercises_correct: number;
  placement_done: boolean; completed_lessons: string[];
}
interface Exercise {
  type: string; question?: string; options?: string[]; correct?: number;
  explanation?: string; sentence?: string; answer?: string; hint?: string;
  direction?: string; alternatives?: string[]; pairs?: [string, string][];
  instruction?: string; words?: string[]; correct_order?: number[];
  translation?: string;
}

// ---------- Helpers ----------

const LEVEL_COLORS: Record<string, string> = {
  A1: "green", A2: "blue", B1: "orange", B2: "purple", C1: "red",
};

function levelBadgeColor(level: string) {
  const color = LEVEL_COLORS[level] || "gray";
  return {
    green: "bg-green-500/20 text-green-400 border-green-500/40",
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    orange: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    purple: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    red: "bg-red-500/20 text-red-400 border-red-500/40",
    gray: "bg-gray-500/20 text-gray-400 border-gray-500/40",
  }[color];
}

// ---------- Exercise Components ----------

function MultipleChoice({ exercise, onAnswer, answered, selectedIdx }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg text-white font-medium">{exercise.question}</h3>
      <div className="space-y-2">
        {exercise.options?.map((opt: string, i: number) => {
          const isCorrect = i === exercise.correct;
          const isSelected = i === selectedIdx;
          let bg = "bg-dark-700 border-dark-500 hover:border-dark-400";
          if (answered) {
            if (isCorrect) bg = "bg-green-500/20 border-green-500 text-green-300";
            else if (isSelected) bg = "bg-red-500/20 border-red-500 text-red-300";
          } else if (isSelected) bg = "bg-brand-orange/20 border-brand-orange";
          return (
            <button
              key={i}
              onClick={() => !answered && onAnswer(i)}
              disabled={answered}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${bg} text-white disabled:cursor-not-allowed`}
            >
              <span className="font-mono text-xs text-gray-500 mr-3">{String.fromCharCode(65 + i)}</span>
              {opt}
              {answered && isCorrect && <CheckCircle2 size={16} className="inline ml-2 text-green-400" />}
              {answered && isSelected && !isCorrect && <XCircle size={16} className="inline ml-2 text-red-400" />}
            </button>
          );
        })}
      </div>
      {answered && exercise.explanation && (
        <div className="bg-dark-700/50 border border-dark-500/30 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Explanation</p>
          <p className="text-sm text-gray-200">{exercise.explanation}</p>
        </div>
      )}
    </div>
  );
}

function FillBlank({ exercise, onAnswer, answered, userInput, setUserInput }: any) {
  const isCorrect = answered && userInput.trim().toLowerCase() === exercise.answer?.toLowerCase();
  return (
    <div className="space-y-4">
      <h3 className="text-lg text-white font-medium">Fill in the blank:</h3>
      <p className="text-gray-200 text-lg">{exercise.sentence}</p>
      <input
        type="text"
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        disabled={answered}
        className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white focus:border-brand-blue focus:outline-none disabled:opacity-70"
        placeholder="Your answer..."
      />
      {exercise.hint && !answered && (
        <p className="text-xs text-gray-500">💡 Hint: {exercise.hint}</p>
      )}
      {!answered && (
        <button
          onClick={() => onAnswer(userInput)}
          disabled={!userInput.trim()}
          className="bg-brand-orange hover:bg-orange-600 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          Check Answer
        </button>
      )}
      {answered && (
        <div className={`rounded-lg p-3 border ${isCorrect ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
          <p className={`text-sm font-medium ${isCorrect ? "text-green-400" : "text-red-400"}`}>
            {isCorrect ? "✓ Correct!" : `✗ Correct answer: ${exercise.answer}`}
          </p>
          {exercise.explanation && <p className="text-xs text-gray-300 mt-1">{exercise.explanation}</p>}
        </div>
      )}
    </div>
  );
}

function Translation({ exercise, onAnswer, answered, userInput, setUserInput }: any) {
  const accepted = [exercise.answer, ...(exercise.alternatives || [])].map(a => a?.toLowerCase().trim());
  const isCorrect = answered && accepted.includes(userInput.trim().toLowerCase());
  return (
    <div className="space-y-4">
      <h3 className="text-lg text-white font-medium">
        Translate to {exercise.direction === "ru_to_en" ? "English" : "Russian"}:
      </h3>
      <div className="bg-dark-700 rounded-lg p-4 border border-dark-500">
        <p className="text-xl text-white">{exercise.sentence}</p>
      </div>
      <input
        type="text"
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        disabled={answered}
        className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white focus:border-brand-blue focus:outline-none disabled:opacity-70"
        placeholder="Type your translation..."
      />
      {!answered && (
        <button
          onClick={() => onAnswer(userInput)}
          disabled={!userInput.trim()}
          className="bg-brand-orange hover:bg-orange-600 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          Check Translation
        </button>
      )}
      {answered && (
        <div className={`rounded-lg p-3 border ${isCorrect ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
          <p className={`text-sm font-medium ${isCorrect ? "text-green-400" : "text-red-400"}`}>
            {isCorrect ? "✓ Correct!" : `✗ Correct answer: ${exercise.answer}`}
          </p>
          {exercise.explanation && <p className="text-xs text-gray-300 mt-1">{exercise.explanation}</p>}
        </div>
      )}
    </div>
  );
}

function Matching({ exercise, onAnswer, answered }: any) {
  const [leftSel, setLeftSel] = useState<number | null>(null);
  const [matches, setMatches] = useState<Record<number, number>>({});
  const [wrong, setWrong] = useState<[number, number] | null>(null);

  const pairs: [string, string][] = exercise.pairs || [];
  const rightOrder = pairs.map((_, i) => i).sort(() => 0.5 - Math.random());

  const handleRightClick = (rIdx: number) => {
    if (leftSel === null || answered) return;
    if (rIdx === leftSel) {
      setMatches(prev => ({ ...prev, [leftSel]: rIdx }));
      setLeftSel(null);
      if (Object.keys(matches).length + 1 === pairs.length) {
        setTimeout(() => onAnswer(true), 500);
      }
    } else {
      setWrong([leftSel, rIdx]);
      setTimeout(() => {
        setWrong(null);
        setLeftSel(null);
      }, 700);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg text-white font-medium">{exercise.instruction}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {pairs.map((p, i) => {
            const matched = matches[i] !== undefined;
            const selected = leftSel === i;
            return (
              <button
                key={i}
                onClick={() => !matched && setLeftSel(i)}
                disabled={matched}
                className={`w-full px-4 py-3 rounded-lg border-2 font-medium transition-colors ${matched ? "bg-green-500/20 border-green-500/50 text-green-300" : selected ? "bg-brand-orange/20 border-brand-orange text-white" : "bg-dark-700 border-dark-500 text-white hover:border-dark-400"}`}
              >
                {p[0]}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {rightOrder.map((origIdx) => {
            const matched = Object.values(matches).includes(origIdx);
            const isWrong = wrong && wrong[1] === origIdx;
            return (
              <button
                key={origIdx}
                onClick={() => handleRightClick(origIdx)}
                disabled={matched}
                className={`w-full px-4 py-3 rounded-lg border-2 font-medium transition-colors ${matched ? "bg-green-500/20 border-green-500/50 text-green-300" : isWrong ? "bg-red-500/20 border-red-500 text-red-300" : "bg-dark-700 border-dark-500 text-white hover:border-dark-400"}`}
              >
                {pairs[origIdx][1]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SentenceBuild({ exercise, onAnswer, answered }: any) {
  const [built, setBuilt] = useState<number[]>([]);
  const words: string[] = exercise.words || [];
  const correctOrder: number[] = exercise.correct_order || [];
  const isCorrect = built.length === correctOrder.length && built.every((v, i) => v === correctOrder[i]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg text-white font-medium">Arrange the words:</h3>
      {exercise.translation && <p className="text-sm text-gray-400">English: {exercise.translation}</p>}
      <div className="bg-dark-700 rounded-lg p-4 min-h-[60px] border border-dark-500 flex flex-wrap gap-2">
        {built.map((wIdx, pos) => (
          <button
            key={pos}
            onClick={() => !answered && setBuilt(built.filter((_, i) => i !== pos))}
            className="bg-brand-orange/20 border border-brand-orange text-white px-3 py-1.5 rounded"
          >
            {words[wIdx]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {words.map((w, i) => (
          <button
            key={i}
            onClick={() => !built.includes(i) && !answered && setBuilt([...built, i])}
            disabled={built.includes(i)}
            className="bg-dark-700 border border-dark-500 text-white px-3 py-1.5 rounded hover:border-dark-400 disabled:opacity-30"
          >
            {w}
          </button>
        ))}
      </div>
      {!answered && built.length === words.length && (
        <button
          onClick={() => onAnswer(isCorrect)}
          className="bg-brand-orange hover:bg-orange-600 text-white px-5 py-2 rounded-lg font-medium"
        >
          Check Sentence
        </button>
      )}
      {answered && (
        <div className={`rounded-lg p-3 border ${isCorrect ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
          <p className={`text-sm font-medium ${isCorrect ? "text-green-400" : "text-red-400"}`}>
            {isCorrect ? "✓ Perfect!" : `✗ Correct: ${correctOrder.map(i => words[i]).join(" ")}`}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- Main Component (continued in part 2) ----------

export default function LangLearner() {
  const [view, setView] = useState<"dashboard" | "lesson" | "placement" | "complete">("dashboard");
  const [language, setLanguage] = useState("russian");
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [currentLevel, setCurrentLevel] = useState("A1");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [answered, setAnswered] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [userInput, setUserInput] = useState("");
  const [lessonInfo, setLessonInfo] = useState<{ unit: number; lesson: number; title: string; xp: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [language]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        apiFetch(`/api/lang/curriculum/${language}`),
        apiFetch(`/api/lang/progress/${language}`),
      ]);
      setCurriculum(c);
      setProgress(p);
      setCurrentLevel(p.level);
    } catch (err: any) {
      toast.error("Failed to load language data");
    } finally {
      setLoading(false);
    }
  };

  const startLesson = async (unit: number, lesson: number, title: string, xp: number) => {
    setLoading(true);
    setLessonInfo({ unit, lesson, title, xp });
    try {
      const res = await apiFetch(`/api/lang/exercises/${language}/${currentLevel}/${unit}/${lesson}`);
      setExercises(res.exercises || []);
      setExerciseIdx(0);
      setScore({ correct: 0, total: 0 });
      setAnswered(false);
      setSelectedIdx(null);
      setUserInput("");
      setView("lesson");
    } catch (err: any) {
      toast.error("Failed to load exercises");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (answer: any) => {
    const ex = exercises[exerciseIdx];
    let isCorrect = false;
    if (ex.type === "multiple_choice") {
      setSelectedIdx(answer);
      isCorrect = answer === ex.correct;
    } else if (ex.type === "fill_blank") {
      isCorrect = typeof answer === "string" && answer.trim().toLowerCase() === ex.answer?.toLowerCase();
    } else if (ex.type === "translation") {
      const accepted = [ex.answer, ...(ex.alternatives || [])].map(a => a?.toLowerCase().trim());
      isCorrect = typeof answer === "string" && accepted.includes(answer.trim().toLowerCase());
    } else {
      isCorrect = answer === true;
    }
    setAnswered(true);
    setScore(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
  };

  const nextExercise = async () => {
    if (exerciseIdx + 1 >= exercises.length) {
      // Lesson complete
      if (lessonInfo) {
        try {
          await apiPost(`/api/lang/progress/${language}/update`, {
            level: currentLevel,
            unit: lessonInfo.unit,
            lesson: lessonInfo.lesson,
            correct: score.correct + (answered ? 1 : 0),
            total: exercises.length,
            xp_earned: lessonInfo.xp,
          });
          await loadData();
        } catch {}
      }
      setView("complete");
    } else {
      setExerciseIdx(exerciseIdx + 1);
      setAnswered(false);
      setSelectedIdx(null);
      setUserInput("");
    }
  };

  if (loading && !curriculum) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={40} className="animate-spin text-brand-orange" />
      </div>
    );
  }

  if (!curriculum || !progress) return null;

  const levelData = curriculum.levels[currentLevel];
  const isLessonCompleted = (unit: number, lesson: number) =>
    progress.completed_lessons?.includes(`${currentLevel}-${unit}-${lesson}`);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-dark-500/30 bg-dark-800/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Languages size={22} className="text-brand-orange" />
            <div>
              <h1 className="text-xl font-bold text-white">iKo LangLearner</h1>
              <p className="text-xs text-gray-400">
                {curriculum.flag} {curriculum.native_name} — Level {currentLevel}
              </p>
            </div>
          </div>
          {view === "dashboard" && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Star size={14} className="text-yellow-400" />
                <span className="text-sm font-semibold text-white">{progress.xp} XP</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Flame size={14} className="text-orange-400" />
                <span className="text-sm font-semibold text-white">{progress.streak_days} days</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Target size={14} className="text-green-400" />
                <span className="text-sm font-semibold text-white">{progress.accuracy}%</span>
              </div>
            </div>
          )}
          {(view === "lesson" || view === "complete") && (
            <button
              onClick={() => setView("dashboard")}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
            >
              <ArrowLeft size={14} /> Back to dashboard
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        {/* DASHBOARD VIEW */}
        {view === "dashboard" && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Language selector */}
            <div className="flex gap-2 flex-wrap">
              {["russian", "german", "french", "spanish"].map(lang => {
                const locked = false; // all 4 languages now active
                return (
                  <button
                    key={lang}
                    onClick={() => !locked && setLanguage(lang)}
                    disabled={locked}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${language === lang ? "bg-brand-orange/20 border-brand-orange text-brand-orange" : locked ? "bg-dark-700 border-dark-500 text-gray-600" : "bg-dark-700 border-dark-500 text-gray-300 hover:border-dark-400"}`}
                  >
                    <span>{lang === "russian" ? "🇷🇺" : lang === "german" ? "🇩🇪" : lang === "french" ? "🇫🇷" : "🇪🇸"}</span>
                    <span className="capitalize text-sm font-medium">{lang}</span>
                    {locked && <Lock size={12} />}
                  </button>
                );
              })}
            </div>

            {/* Level tabs */}
            <div className="flex gap-2 border-b border-dark-500/30 pb-0">
              {["A1", "A2", "B1", "B2", "C1"].map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setCurrentLevel(lvl)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${currentLevel === lvl ? "border-brand-orange text-brand-orange" : "border-transparent text-gray-500 hover:text-gray-300"}`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Level description */}
            {levelData && (
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${levelBadgeColor(currentLevel)}`}>{currentLevel}</span>
                  <h2 className="text-lg font-bold text-white">{levelData.name}</h2>
                </div>
                <p className="text-sm text-gray-400">{levelData.description}</p>
              </div>
            )}

            {/* Units */}
            {levelData && levelData.units.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {levelData.units.map(unit => {
                  const completedInUnit = unit.lessons.filter(l => isLessonCompleted(unit.id, l.id)).length;
                  const pct = Math.round((completedInUnit / unit.lessons.length) * 100);
                  return (
                    <div key={unit.id} className="bg-dark-800 rounded-xl p-4 border border-dark-500/30">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white">{unit.title}</h3>
                        <span className="text-xs text-gray-500">{completedInUnit}/{unit.lessons.length}</span>
                      </div>
                      <div className="h-1.5 bg-dark-700 rounded-full mb-3 overflow-hidden">
                        <div className="h-full bg-brand-orange transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="space-y-1.5">
                        {unit.lessons.map(lesson => {
                          const done = isLessonCompleted(unit.id, lesson.id);
                          return (
                            <button
                              key={lesson.id}
                              onClick={() => startLesson(unit.id, lesson.id, lesson.title, lesson.xp)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${done ? "bg-green-500/5 hover:bg-green-500/10" : "bg-dark-700 hover:bg-dark-600"}`}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {done ? <CheckCircle2 size={14} className="text-green-400 shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-gray-500 shrink-0" />}
                                <span className="text-sm text-gray-200 truncate">{lesson.title}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-yellow-400">+{lesson.xp} XP</span>
                                <ChevronRight size={14} className="text-gray-500" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <GraduationCap size={40} className="mx-auto mb-2 text-gray-700" />
                <p>Coming soon — content for this language is in development.</p>
              </div>
            )}
          </div>
        )}

        {/* LESSON VIEW */}
        {view === "lesson" && exercises.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">{lessonInfo?.title}</span>
                <span className="text-xs text-gray-500">{exerciseIdx + 1} / {exercises.length}</span>
              </div>
              <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                <div className="h-full bg-brand-orange transition-all" style={{ width: `${((exerciseIdx + 1) / exercises.length) * 100}%` }} />
              </div>
            </div>

            {/* Exercise */}
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-500/30">
              {(() => {
                const ex = exercises[exerciseIdx];
                if (ex.type === "multiple_choice")
                  return <MultipleChoice exercise={ex} onAnswer={handleAnswer} answered={answered} selectedIdx={selectedIdx} />;
                if (ex.type === "fill_blank")
                  return <FillBlank exercise={ex} onAnswer={handleAnswer} answered={answered} userInput={userInput} setUserInput={setUserInput} />;
                if (ex.type === "translation")
                  return <Translation exercise={ex} onAnswer={handleAnswer} answered={answered} userInput={userInput} setUserInput={setUserInput} />;
                if (ex.type === "matching")
                  return <Matching exercise={ex} onAnswer={handleAnswer} answered={answered} />;
                if (ex.type === "sentence_build")
                  return <SentenceBuild exercise={ex} onAnswer={handleAnswer} answered={answered} />;
                return <p className="text-gray-400">Unknown exercise type: {ex.type}</p>;
              })()}
            </div>

            {answered && (
              <div className="flex justify-end">
                <button
                  onClick={nextExercise}
                  className="flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
                >
                  {exerciseIdx + 1 >= exercises.length ? "Finish" : "Next"} <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* COMPLETE VIEW */}
        {view === "complete" && (
          <div className="max-w-md mx-auto text-center py-12">
            <div className="mb-6">
              <Trophy size={80} className="mx-auto text-yellow-400 mb-2" />
              <h2 className="text-2xl font-bold text-white">Lesson Complete!</h2>
              <p className="text-gray-400 mt-2">{lessonInfo?.title}</p>
            </div>
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-500/30 mb-6">
              <div className="flex justify-around">
                <div>
                  <p className="text-3xl font-bold text-green-400">{score.correct}/{exercises.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Correct</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-yellow-400">+{lessonInfo?.xp}</p>
                  <p className="text-xs text-gray-500 mt-1">XP Earned</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-blue-400">{Math.round((score.correct / exercises.length) * 100)}%</p>
                  <p className="text-xs text-gray-500 mt-1">Accuracy</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setView("dashboard")}
              className="bg-brand-orange hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              Continue Learning
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
