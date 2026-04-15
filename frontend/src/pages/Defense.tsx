import { useState, useRef, useEffect } from "react";
import {
  Shield,
  Loader2,
  HelpCircle,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Presentation,
  Clock,
  StickyNote,
  Smile,
  Frown,
  Flame,
  User,
  Bot,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Layout,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab = "questions" | "mock" | "presentation";
type Difficulty = "easy" | "medium" | "hard";
type ExaminerStyle = "supportive" | "critical" | "devils_advocate";
type QuestionCategory = "Conceptual" | "Methodological" | "Results" | "Critical" | "Extension";

interface DefenseQuestion {
  question: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  answer_framework: string;
}

interface QuestionsResult {
  questions: DefenseQuestion[];
}

interface MockMessage {
  role: "user" | "examiner";
  content: string;
  feedback?: string;
  quality?: "good" | "fair" | "needs_improvement";
}

interface Slide {
  slide_number: number;
  title: string;
  time_minutes: number;
  content: string[];
  speaker_notes: string;
}

interface PresentationResult {
  slides: Slide[];
  total_time: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function difficultyBadge(d: Difficulty): string {
  const map: Record<Difficulty, string> = {
    easy: "bg-green-500/20 text-green-400 border-green-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    hard: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return map[d] || map.easy;
}

function categoryColor(c: QuestionCategory): string {
  const map: Record<QuestionCategory, string> = {
    Conceptual: "text-blue-400",
    Methodological: "text-purple-400",
    Results: "text-green-400",
    Critical: "text-red-400",
    Extension: "text-brand-orange",
  };
  return map[c] || "text-gray-400";
}

function qualityIcon(q?: string) {
  if (q === "good") return <ThumbsUp size={14} className="text-green-400" />;
  if (q === "needs_improvement") return <ThumbsDown size={14} className="text-red-400" />;
  return <Minus size={14} className="text-yellow-400" />;
}

const TAB_CONFIG: { id: Tab; label: string; icon: any }[] = [
  { id: "questions", label: "Question Generator", icon: HelpCircle },
  { id: "mock", label: "Mock Defense", icon: MessageSquare },
  { id: "presentation", label: "Presentation Builder", icon: Presentation },
];

const EXAMINER_STYLES: { id: ExaminerStyle; label: string; icon: any; desc: string }[] = [
  { id: "supportive", label: "Supportive", icon: Smile, desc: "Encouraging and constructive" },
  { id: "critical", label: "Critical", icon: Frown, desc: "Rigorous and detailed" },
  { id: "devils_advocate", label: "Devil's Advocate", icon: Flame, desc: "Challenges every assumption" },
];

const CATEGORIES: QuestionCategory[] = [
  "Conceptual",
  "Methodological",
  "Results",
  "Critical",
  "Extension",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Defense() {
  const [tab, setTab] = useState<Tab>("questions");

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield size={24} className="text-brand-orange" />
          iKo Defense
        </h1>
        <p className="text-sm text-gray-400 mt-1">Thesis Defense Preparation Suite</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TAB_CONFIG.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                tab === t.id
                  ? "bg-brand-orange text-white"
                  : "bg-dark-700 text-gray-400 hover:text-white"
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "questions" && <QuestionGenerator />}
      {tab === "mock" && <MockDefense />}
      {tab === "presentation" && <PresentationBuilder />}
    </div>
  );
}

/* ================================================================== */
/*  Tab 1: Question Generator                                          */
/* ================================================================== */

function QuestionGenerator() {
  const [form, setForm] = useState({
    thesis_title: "",
    abstract: "",
    methodology_summary: "",
    key_findings: "",
    limitations: "",
    field: "",
    level: "masters" as string,
  });
  const [provider, setProvider] = useState("claude");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuestionsResult | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const updateField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.thesis_title.trim()) {
      toast.error("Please enter your thesis title");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost<QuestionsResult>(
        "/api/defense/generate-questions",
        { ...form, provider }
      );
      setResult(data);
      toast.success("Defense questions generated");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate questions");
    } finally {
      setLoading(false);
    }
  };

  const grouped = result
    ? CATEGORIES.reduce<Record<QuestionCategory, DefenseQuestion[]>>(
        (acc, cat) => {
          acc[cat] = (result.questions || []).filter((q) => q.category === cat);
          return acc;
        },
        {
          Conceptual: [],
          Methodological: [],
          Results: [],
          Critical: [],
          Extension: [],
        }
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-dark-800 border border-dark-500/30 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-300 mb-1.5">Thesis Title</label>
            <input
              type="text"
              value={form.thesis_title}
              onChange={(e) => updateField("thesis_title", e.target.value)}
              placeholder="The full title of your thesis..."
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm text-gray-300 mb-1.5">Abstract</label>
            <textarea
              value={form.abstract}
              onChange={(e) => updateField("abstract", e.target.value)}
              placeholder="Paste your thesis abstract..."
              rows={4}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Methodology Summary</label>
            <textarea
              value={form.methodology_summary}
              onChange={(e) => updateField("methodology_summary", e.target.value)}
              placeholder="Briefly describe your research methodology..."
              rows={3}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Key Findings</label>
            <textarea
              value={form.key_findings}
              onChange={(e) => updateField("key_findings", e.target.value)}
              placeholder="What were your main results?"
              rows={3}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Limitations</label>
            <textarea
              value={form.limitations}
              onChange={(e) => updateField("limitations", e.target.value)}
              placeholder="Known limitations of your research..."
              rows={3}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Research Field</label>
              <input
                type="text"
                value={form.field}
                onChange={(e) => updateField("field", e.target.value)}
                placeholder="e.g. Computer Science, Education..."
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Degree Level</label>
              <div className="relative">
                <GraduationCap size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <select
                  value={form.level}
                  onChange={(e) => updateField("level", e.target.value)}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-10 pr-10 py-3 text-white focus:border-brand-blue focus:outline-none appearance-none"
                >
                  <option value="bachelors">Bachelor's</option>
                  <option value="masters">Master's</option>
                  <option value="phd">PhD</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="claude">Claude</option>
            <option value="deepseek">DeepSeek</option>
            <option value="gpt4o">GPT-4o</option>
            <option value="gemini">Gemini</option>
          </select>

          <button
            type="submit"
            disabled={loading || !form.thesis_title.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <HelpCircle size={16} />
                Generate Questions
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results grouped by category */}
      {grouped && (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const questions = grouped[cat];
            if (questions.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${categoryColor(cat)}`}>
                  <span className="w-2 h-2 rounded-full bg-current" />
                  {cat} ({questions.length})
                </h3>
                <div className="space-y-3">
                  {questions.map((q, qi) => {
                    const globalIdx = result!.questions.indexOf(q);
                    const isExpanded = expandedIdx === globalIdx;
                    return (
                      <div
                        key={qi}
                        className="bg-dark-800 border border-dark-500/30 rounded-xl overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
                          className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-dark-700/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white leading-relaxed">
                              {q.question}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border capitalize ${difficultyBadge(
                                q.difficulty
                              )}`}
                            >
                              {q.difficulty}
                            </span>
                            {isExpanded ? (
                              <ChevronUp size={16} className="text-gray-500" />
                            ) : (
                              <ChevronDown size={16} className="text-gray-500" />
                            )}
                          </div>
                        </button>
                        {isExpanded && q.answer_framework && (
                          <div className="px-4 pb-4 border-t border-dark-500/20">
                            <div className="mt-3 bg-dark-700/50 rounded-lg p-3">
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">
                                Answer Framework
                              </p>
                              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {q.answer_framework}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Tab 2: Mock Defense                                                 */
/* ================================================================== */

function MockDefense() {
  const [style, setStyle] = useState<ExaminerStyle>("supportive");
  const [provider, setProvider] = useState("claude");
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [thesisContext, setThesisContext] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startSession = async () => {
    if (!thesisContext.trim()) {
      toast.error("Please describe your thesis briefly to start");
      return;
    }
    setLoading(true);
    try {
      const data = await apiPost<{ message: string }>("/api/defense/mock-session", {
        action: "start",
        examiner_style: style,
        thesis_context: thesisContext,
        provider,
      });
      setMessages([
        { role: "examiner", content: data.message || "Welcome to your mock defense. Let us begin. Can you start by summarizing the main contribution of your thesis?" },
      ]);
      setSessionStarted(true);
      toast.success("Mock defense session started");
    } catch (err: any) {
      toast.error(err.message || "Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: MockMessage = { role: "user", content: input };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    try {
      const data = await apiPost<{ message: string; feedback: string; quality: string }>(
        "/api/defense/mock-session",
        {
          action: "respond",
          examiner_style: style,
          thesis_context: thesisContext,
          conversation: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          answer: input,
          provider,
        }
      );
      setMessages([
        ...updatedMessages,
        {
          role: "examiner",
          content: data.message,
          feedback: data.feedback,
          quality: data.quality as MockMessage["quality"],
        },
      ]);
    } catch (err: any) {
      toast.error(err.message || "Failed to get response");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!sessionStarted) {
    return (
      <div className="space-y-6">
        <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-4 sm:p-6 space-y-4">
          {/* Examiner style selector */}
          <div>
            <label className="block text-sm text-gray-300 mb-3">Choose Examiner Style</label>
            <div className="grid gap-3 sm:grid-cols-3">
              {EXAMINER_STYLES.map((es) => {
                const Icon = es.icon;
                const isActive = style === es.id;
                return (
                  <button
                    key={es.id}
                    onClick={() => setStyle(es.id)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      isActive
                        ? "border-brand-orange bg-brand-orange/10"
                        : "border-dark-500/30 bg-dark-700 hover:border-dark-400"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        size={18}
                        className={isActive ? "text-brand-orange" : "text-gray-400"}
                      />
                      <span
                        className={`text-sm font-medium ${
                          isActive ? "text-white" : "text-gray-300"
                        }`}
                      >
                        {es.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{es.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thesis context */}
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Brief Thesis Description
            </label>
            <textarea
              value={thesisContext}
              onChange={(e) => setThesisContext(e.target.value)}
              placeholder="Describe your thesis topic, methodology, and key findings so the examiner can ask relevant questions..."
              rows={4}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="claude">Claude</option>
              <option value="deepseek">DeepSeek</option>
              <option value="gpt4o">GPT-4o</option>
              <option value="gemini">Gemini</option>
            </select>

            <button
              onClick={startSession}
              disabled={loading || !thesisContext.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <MessageSquare size={16} />
                  Start Mock Defense
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session info bar */}
      <div className="bg-dark-800 border border-dark-500/30 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Examiner:</span>
          <span className="text-xs font-medium text-brand-orange capitalize">
            {style.replace("_", " ")}
          </span>
        </div>
        <button
          onClick={() => {
            setSessionStarted(false);
            setMessages([]);
          }}
          className="text-xs text-gray-400 hover:text-white bg-dark-700 px-3 py-1 rounded-lg transition-colors"
        >
          End Session
        </button>
      </div>

      {/* Chat messages */}
      <div className="bg-dark-800 border border-dark-500/30 rounded-xl overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className="space-y-2">
              <div
                className={`flex items-start gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user"
                      ? "bg-brand-blue/20"
                      : "bg-brand-orange/20"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User size={16} className="text-brand-blue" />
                  ) : (
                    <Bot size={16} className="text-brand-orange" />
                  )}
                </div>
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-brand-blue/10 border border-brand-blue/20"
                      : "bg-dark-700 border border-dark-500/30"
                  }`}
                >
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              </div>

              {/* Feedback for examiner messages */}
              {msg.role === "examiner" && msg.feedback && (
                <div className="ml-11 bg-dark-700/50 border border-dark-500/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    {qualityIcon(msg.quality)}
                    <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                      Feedback on your answer
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {msg.feedback}
                  </p>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Examiner is thinking...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-dark-500/30 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer..."
              rows={2}
              className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-none"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="bg-brand-orange hover:bg-orange-600 text-white p-2.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Tab 3: Presentation Builder                                        */
/* ================================================================== */

function PresentationBuilder() {
  const [form, setForm] = useState({
    thesis_title: "",
    abstract: "",
    time_limit: 15,
    slide_style: "minimal" as string,
  });
  const [provider, setProvider] = useState("claude");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PresentationResult | null>(null);

  const updateField = (key: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.thesis_title.trim()) {
      toast.error("Please enter your thesis title");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost<PresentationResult>(
        "/api/defense/presentation-outline",
        { ...form, provider }
      );
      setResult(data);
      toast.success("Presentation outline generated");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate outline");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-dark-800 border border-dark-500/30 rounded-xl p-4 sm:p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">Thesis Title</label>
          <input
            type="text"
            value={form.thesis_title}
            onChange={(e) => updateField("thesis_title", e.target.value)}
            placeholder="The full title of your thesis..."
            className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1.5">Abstract</label>
          <textarea
            value={form.abstract}
            onChange={(e) => updateField("abstract", e.target.value)}
            placeholder="Paste your thesis abstract..."
            rows={4}
            className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Time Limit (minutes)</label>
            <div className="relative">
              <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="number"
                min="5"
                max="60"
                value={form.time_limit.toString()}
                onChange={(e) => updateField("time_limit", parseInt(e.target.value) || 15)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-10 pr-4 py-3 text-white focus:border-brand-blue focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Slide Style</label>
            <div className="relative">
              <Layout size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <select
                value={form.slide_style}
                onChange={(e) => updateField("slide_style", e.target.value)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-10 pr-10 py-3 text-white focus:border-brand-blue focus:outline-none appearance-none"
              >
                <option value="minimal">Minimal</option>
                <option value="detailed">Detailed</option>
                <option value="visual">Visual</option>
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="claude">Claude</option>
            <option value="deepseek">DeepSeek</option>
            <option value="gpt4o">GPT-4o</option>
            <option value="gemini">Gemini</option>
          </select>

          <button
            type="submit"
            disabled={loading || !form.thesis_title.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Presentation size={16} />
                Generate Outline
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-dark-800 border border-dark-500/30 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Presentation size={16} className="text-brand-orange" />
                <span className="text-sm font-medium text-white">
                  {result.slides.length} Slides
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-gray-400" />
                <span className="text-sm text-gray-400">
                  {result.total_time || result.slides.reduce((s, sl) => s + sl.time_minutes, 0)} min total
                </span>
              </div>
            </div>
          </div>

          {/* Slides */}
          <div className="space-y-4">
            {result.slides.map((slide) => (
              <div
                key={slide.slide_number}
                className="bg-dark-800 border border-dark-500/30 rounded-xl overflow-hidden"
              >
                {/* Slide header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-500/20">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-brand-orange/20 text-brand-orange text-xs font-bold flex items-center justify-center">
                      {slide.slide_number}
                    </span>
                    <h4 className="text-sm font-semibold text-white">{slide.title}</h4>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={12} />
                    {slide.time_minutes} min
                  </span>
                </div>

                {/* Slide content */}
                <div className="px-4 py-3 space-y-3">
                  {/* Content bullets */}
                  {slide.content && slide.content.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">
                        Content
                      </p>
                      <ul className="space-y-1">
                        {slide.content.map((item, ci) => (
                          <li key={ci} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange mt-1.5 flex-shrink-0" />
                            <p className="text-sm text-gray-300">{item}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Speaker notes */}
                  {slide.speaker_notes && (
                    <div className="bg-dark-700/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                        <StickyNote size={10} />
                        Speaker Notes
                      </p>
                      <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">
                        {slide.speaker_notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
