import { useState } from "react";
import {
  PenTool,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Copy,
  Loader2,
  BarChart3,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Intensity = "light" | "medium" | "heavy";
type FocusMode = "all" | "ai_patterns" | "grammar" | "flow" | "hedging";

interface AIPattern {
  pattern: string;
  count: number;
  severity: "low" | "medium" | "high";
  examples?: string[];
}

interface AnalysisResult {
  ai_score: number;
  patterns: AIPattern[];
  sentence_stats: {
    total: number;
    long_sentences: number;
    repetitive_starts: number;
  };
  recommendation: string;
}

interface HumanizeResult {
  revised_text: string;
  ai_score: number;
  patterns_found: AIPattern[];
  changes_summary: string;
  original_word_count: number;
  revised_word_count: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  if (score < 30) return "text-green-400";
  if (score <= 60) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score < 30) return "border-green-500/40 bg-green-500/10";
  if (score <= 60) return "border-yellow-500/40 bg-yellow-500/10";
  return "border-red-500/40 bg-red-500/10";
}

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    low: "bg-green-500/20 text-green-400",
    medium: "bg-yellow-500/20 text-yellow-400",
    high: "bg-red-500/20 text-red-400",
  };
  return map[severity] || map.low;
}

const FOCUS_OPTIONS: { value: FocusMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ai_patterns", label: "AI Patterns" },
  { value: "grammar", label: "Grammar" },
  { value: "flow", label: "Flow" },
  { value: "hedging", label: "Hedging" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Humanizer() {
  // Input state
  const [inputText, setInputText] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [focus, setFocus] = useState<FocusMode>("all");

  // Loading states
  const [analyzing, setAnalyzing] = useState(false);
  const [humanizing, setHumanizing] = useState(false);

  // Results
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [result, setResult] = useState<HumanizeResult | null>(null);

  /* ---- Actions --------------------------------------------------- */

  const handleAnalyze = async () => {
    if (!inputText.trim()) {
      toast.error("Please paste some text to analyze");
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const data = await apiPost<AnalysisResult>(
        "/api/humanizer/detect-ai-patterns",
        { text: inputText }
      );
      setAnalysis(data);
      toast.success("Analysis complete");
    } catch (err: any) {
      toast.error(err.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleHumanize = async () => {
    if (!inputText.trim()) {
      toast.error("Please paste some text to humanize");
      return;
    }
    setHumanizing(true);
    setResult(null);
    try {
      const data = await apiPost<HumanizeResult>(
        "/api/humanizer/humanize",
        { text: inputText, intensity, focus }
      );
      setResult(data);
      toast.success("Text humanized successfully");
    } catch (err: any) {
      toast.error(err.message || "Humanizing failed");
    } finally {
      setHumanizing(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.revised_text) return;
    try {
      await navigator.clipboard.writeText(result.revised_text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  /* ---- Render ---------------------------------------------------- */

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-dark-500/30 bg-dark-800/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <PenTool size={24} className="text-brand-orange" />
          <div>
            <h1 className="text-xl font-bold text-white">iKo Writer</h1>
            <p className="text-xs text-gray-400">Academic Writing Polisher</p>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ========== LEFT PANEL: Input ========== */}
        <div className="lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-dark-500/30 overflow-y-auto">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            {/* Textarea */}
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Paste your text
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste your academic text here..."
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
                style={{ minHeight: "200px" }}
              />
              <p className="text-xs text-gray-500 mt-1">
                {inputText.trim()
                  ? `${inputText.trim().split(/\s+/).length} words`
                  : "0 words"}
              </p>
            </div>

            {/* Intensity selector */}
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Intensity
              </label>
              <div className="flex gap-2">
                {(["light", "medium", "heavy"] as Intensity[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => setIntensity(level)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-colors ${
                      intensity === level
                        ? "bg-brand-orange text-white"
                        : "bg-dark-700 border border-dark-500 text-gray-400 hover:text-white hover:border-dark-400"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Focus mode dropdown */}
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Focus Mode
              </label>
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as FocusMode)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
              >
                {FOCUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleAnalyze}
                disabled={analyzing || !inputText.trim()}
                className="flex-1 flex items-center justify-center gap-2 bg-dark-700 border border-dark-500 hover:border-dark-400 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {analyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <BarChart3 size={16} />
                    Analyze
                  </>
                )}
              </button>
              <button
                onClick={handleHumanize}
                disabled={humanizing || !inputText.trim()}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {humanizing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Humanizing...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Humanize
                  </>
                )}
              </button>
            </div>

            {/* ---- Analysis results (shown after Analyze) ---- */}
            {analysis && (
              <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 size={16} className="text-brand-blue" />
                  Analysis Results
                </h3>

                {/* AI Score */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-14 h-14 rounded-full border-2 flex items-center justify-center font-bold text-lg ${scoreBg(
                      analysis.ai_score
                    )} ${scoreColor(analysis.ai_score)}`}
                  >
                    {analysis.ai_score}
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">Estimated AI Score</p>
                    <p className={`text-xs ${scoreColor(analysis.ai_score)}`}>
                      {analysis.ai_score < 30
                        ? "Low AI likelihood"
                        : analysis.ai_score <= 60
                        ? "Moderate AI signals"
                        : "High AI likelihood"}
                    </p>
                  </div>
                </div>

                {/* Detected patterns */}
                {analysis.patterns.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">
                      Detected AI Patterns
                    </p>
                    <div className="space-y-1.5">
                      {analysis.patterns.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-dark-700/50 rounded-lg px-3 py-2"
                        >
                          <span className="text-sm text-gray-200">
                            {p.pattern}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">
                              x{p.count}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${severityBadge(
                                p.severity
                              )}`}
                            >
                              {p.severity}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sentence statistics */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">
                    Sentence Statistics
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-dark-700/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-white">
                        {analysis.sentence_stats.total}
                      </p>
                      <p className="text-[10px] text-gray-400">Total</p>
                    </div>
                    <div className="bg-dark-700/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-yellow-400">
                        {analysis.sentence_stats.long_sentences}
                      </p>
                      <p className="text-[10px] text-gray-400">Long</p>
                    </div>
                    <div className="bg-dark-700/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-red-400">
                        {analysis.sentence_stats.repetitive_starts}
                      </p>
                      <p className="text-[10px] text-gray-400">Repetitive</p>
                    </div>
                  </div>
                </div>

                {/* Recommendation */}
                {analysis.recommendation && (
                  <div className="bg-dark-700/50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400 mb-1">
                      Recommendation
                    </p>
                    <p className="text-sm text-gray-200">
                      {analysis.recommendation}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ========== RIGHT PANEL: Output ========== */}
        <div className="lg:w-1/2 flex flex-col overflow-y-auto">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            {!result && !humanizing && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <PenTool size={40} className="text-gray-600 mb-3" />
                <p className="text-gray-500 text-sm">
                  Paste your text and click <strong>Humanize</strong> to see the
                  revised version here.
                </p>
              </div>
            )}

            {humanizing && (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-brand-orange mb-3" />
                <p className="text-gray-400 text-sm">Humanizing your text...</p>
              </div>
            )}

            {result && (
              <>
                {/* AI Score badge */}
                <div className="flex items-center gap-4">
                  <div
                    className={`w-16 h-16 rounded-full border-2 flex items-center justify-center font-bold text-xl ${scoreBg(
                      result.ai_score
                    )} ${scoreColor(result.ai_score)}`}
                  >
                    {result.ai_score}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      Revised AI Score
                    </p>
                    <p className={`text-xs ${scoreColor(result.ai_score)}`}>
                      {result.ai_score < 30
                        ? "Looks human-written"
                        : result.ai_score <= 60
                        ? "Some AI signals remain"
                        : "Still reads as AI-generated"}
                    </p>
                  </div>
                </div>

                {/* Patterns found */}
                {result.patterns_found && result.patterns_found.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Remaining AI Patterns
                    </p>
                    <div className="space-y-1.5">
                      {result.patterns_found.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-dark-700/50 rounded-lg px-3 py-2"
                        >
                          <span className="text-sm text-gray-200">
                            {p.pattern}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${severityBadge(
                              p.severity
                            )}`}
                          >
                            {p.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.patterns_found && result.patterns_found.length === 0 && (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <CheckCircle size={16} />
                    No AI patterns detected in revised text
                  </div>
                )}

                {/* Revised text */}
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Revised Text</p>
                  <div className="bg-dark-700 border border-dark-500 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {result.revised_text}
                    </p>
                  </div>
                </div>

                {/* Changes summary */}
                {result.changes_summary && (
                  <div className="bg-dark-800 border border-dark-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">
                      Changes Summary
                    </p>
                    <p className="text-sm text-gray-200">
                      {result.changes_summary}
                    </p>
                  </div>
                )}

                {/* Word count comparison */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-dark-700/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-white">
                      {result.original_word_count}
                    </p>
                    <p className="text-[10px] text-gray-400">Original Words</p>
                  </div>
                  <div className="flex-1 bg-dark-700/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-white">
                      {result.revised_word_count}
                    </p>
                    <p className="text-[10px] text-gray-400">Revised Words</p>
                  </div>
                  <div className="flex-1 bg-dark-700/50 rounded-lg p-3 text-center">
                    <p
                      className={`text-lg font-bold ${
                        result.revised_word_count - result.original_word_count >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {result.revised_word_count - result.original_word_count >= 0
                        ? "+"
                        : ""}
                      {result.revised_word_count - result.original_word_count}
                    </p>
                    <p className="text-[10px] text-gray-400">Difference</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleCopy}
                    className="flex-1 flex items-center justify-center gap-2 bg-dark-700 border border-dark-500 hover:border-dark-400 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Copy size={16} />
                    Copy Revised Text
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
