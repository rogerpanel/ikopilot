import { useState, useRef } from "react";
import {
  PenTool,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Copy,
  Loader2,
  BarChart3,
  Paperclip,
  FileText,
  Download,
  X,
  FileDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";

const API_BASE = import.meta.env.VITE_API_URL || "";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Intensity = "light" | "medium" | "heavy";
type FocusMode = "all" | "ai_patterns" | "grammar" | "flow" | "hedging";

interface AIPattern {
  pattern: string;
  count: number;
  severity: "low" | "medium" | "high";
}

interface DiffSegment {
  type: "equal" | "delete" | "insert";
  text: string;
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
/*  Diff Renderer (Writefull-style)                                    */
/* ------------------------------------------------------------------ */

function DiffView({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="text-sm leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.type === "equal") {
          return (
            <span key={i} className="text-gray-200">
              {seg.text}{" "}
            </span>
          );
        }
        if (seg.type === "delete") {
          return (
            <span
              key={i}
              className="bg-red-500/15 text-red-400 line-through decoration-red-400/60 px-0.5 rounded-sm"
              title="Removed"
            >
              {seg.text}
            </span>
          );
        }
        if (seg.type === "insert") {
          return (
            <span
              key={i}
              className="bg-green-500/15 text-green-400 underline decoration-green-400/60 px-0.5 rounded-sm"
              title="Added"
            >
              {seg.text}{" "}
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Humanizer() {
  const [inputText, setInputText] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [focus, setFocus] = useState<FocusMode>("all");
  const [provider, setProvider] = useState("claude");
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [humanizing, setHumanizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState("");

  // Analysis
  const [analysis, setAnalysis] = useState<{
    ai_score: number;
    patterns: AIPattern[];
    sentence_stats: { total: number; long_sentences: number; repetitive_starts: number };
    recommendation: string;
  } | null>(null);

  // Humanize result
  const [revisedText, setRevisedText] = useState("");
  const [changesSummary, setChangesSummary] = useState("");
  const [wordCountOrig, setWordCountOrig] = useState(0);
  const [wordCountRevised, setWordCountRevised] = useState(0);

  // Diff segments for Writefull view
  const [diffSegments, setDiffSegments] = useState<DiffSegment[]>([]);
  const [diffStats, setDiffStats] = useState<{ deletions: number; insertions: number } | null>(null);
  const [viewTab, setViewTab] = useState<"corrections" | "clean">("corrections");

  /* ---- File Upload ------------------------------------------------ */

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "tex", "latex"].includes(ext || "")) {
      toast.error("Upload PDF, DOCX, or .tex files only");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch(`${API_BASE}/api/humanizer/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }

      const data = await res.json();
      setInputText(data.text);
      setUploadedFile(data.filename);
      toast.success(`${data.filename} loaded (${data.word_count} words)`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* ---- Analyze ---------------------------------------------------- */

  const handleAnalyze = async () => {
    if (!inputText.trim()) return toast.error("Paste or upload text first");
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const data = await apiPost("/api/humanizer/detect-ai-patterns", { text: inputText });
      setAnalysis({
        ai_score: data.estimated_ai_score,
        patterns: data.ai_patterns_found || [],
        sentence_stats: {
          total: data.total_sentences,
          long_sentences: data.long_sentences,
          repetitive_starts:
            (data.repetitive_starts?.the || 0) + (data.repetitive_starts?.this || 0),
        },
        recommendation: data.recommendation,
      });
      toast.success("Analysis complete");
    } catch (err: any) {
      toast.error(err.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  /* ---- Humanize --------------------------------------------------- */

  const handleHumanize = async () => {
    if (!inputText.trim()) return toast.error("Paste or upload text first");
    setHumanizing(true);
    setRevisedText("");
    setDiffSegments([]);
    setDiffStats(null);
    try {
      const data = await apiPost("/api/humanizer/humanize", {
        text: inputText,
        intensity,
        focus,
        provider,
      });
      setRevisedText(data.revised_text);
      setChangesSummary(data.changes_summary);
      setWordCountOrig(data.word_count_original);
      setWordCountRevised(data.word_count_revised);

      // Compute diff for Writefull view
      const diffData = await apiPost("/api/humanizer/diff", {
        original: inputText,
        revised: data.revised_text,
      });
      setDiffSegments(diffData.segments || []);
      setDiffStats(diffData.stats || null);

      toast.success("Text humanized — see corrections on the right");
    } catch (err: any) {
      toast.error(err.message || "Humanizing failed");
    } finally {
      setHumanizing(false);
    }
  };

  /* ---- Copy ------------------------------------------------------- */

  const handleCopy = async () => {
    if (!revisedText) return;
    try {
      await navigator.clipboard.writeText(revisedText);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  /* ---- Export Corrected Document ---------------------------------- */

  const handleExport = async (format: string) => {
    if (!revisedText) return;
    setExporting(format);
    try {
      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch(`${API_BASE}/api/humanizer/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          original: inputText,
          revised: revisedText,
          format,
          filename: uploadedFile?.replace(/\.[^.]+$/, "") || "corrected_document",
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `corrected.${format === "tex" ? "tex" : "docx"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setExporting("");
    }
  };

  /* ---- Render ----------------------------------------------------- */

  const hasResult = revisedText.length > 0;
  const hasDiff = diffSegments.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-dark-500/30 bg-dark-800/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <PenTool size={24} className="text-brand-orange" />
          <div>
            <h1 className="text-xl font-bold text-white">iKo Writer</h1>
            <p className="text-xs text-gray-400">
              Writefull-style Academic Writing Polisher
            </p>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ========== LEFT PANEL: Input ========== */}
        <div className="lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-dark-500/30 overflow-y-auto">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            {/* File upload + textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-gray-300">
                  Paste your text or upload a file
                </label>
                <div className="flex items-center gap-2">
                  {uploadedFile && (
                    <span className="text-xs text-brand-blue flex items-center gap-1">
                      <FileText size={12} />
                      {uploadedFile}
                      <button
                        onClick={() => {
                          setUploadedFile(null);
                          setInputText("");
                        }}
                        className="text-gray-500 hover:text-white ml-1"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.tex,.latex"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Paperclip size={12} />
                    )}
                    {uploading ? "Uploading..." : "Attach File"}
                  </button>
                </div>
              </div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste your academic text here, or attach a PDF / DOCX / LaTeX file..."
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
                style={{ minHeight: "200px" }}
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">
                  {inputText.trim()
                    ? `${inputText.trim().split(/\s+/).length} words`
                    : "0 words"}
                </p>
                <p className="text-xs text-gray-600">
                  PDF, DOCX, .tex — max 20 MB
                </p>
              </div>
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

            {/* Focus mode */}
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

            {/* LLM Provider */}
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                LLM Provider
              </label>
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
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleAnalyze}
                disabled={analyzing || !inputText.trim()}
                className="flex-1 flex items-center justify-center gap-2 bg-dark-700 border border-dark-500 hover:border-dark-400 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {analyzing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <BarChart3 size={16} />
                )}
                {analyzing ? "Analyzing..." : "Analyze"}
              </button>
              <button
                onClick={handleHumanize}
                disabled={humanizing || !inputText.trim()}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {humanizing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {humanizing ? "Humanizing..." : "Humanize"}
              </button>
            </div>

            {/* Analysis results */}
            {analysis && (
              <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 size={16} className="text-brand-blue" />
                  Analysis Results
                </h3>
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
                      {analysis.recommendation}
                    </p>
                  </div>
                </div>
                {analysis.patterns.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">
                      Detected AI Patterns
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
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
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-dark-700/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-white">
                      {analysis.sentence_stats.total}
                    </p>
                    <p className="text-[10px] text-gray-400">Sentences</p>
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
            )}
          </div>
        </div>

        {/* ========== RIGHT PANEL: Corrections View ========== */}
        <div className="lg:w-1/2 flex flex-col overflow-y-auto">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            {/* Empty state */}
            {!hasResult && !humanizing && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <PenTool size={40} className="text-gray-600 mb-3" />
                <p className="text-gray-500 text-sm">
                  Paste text or upload a file, then click{" "}
                  <strong>Humanize</strong> to see corrections here.
                </p>
                <p className="text-gray-600 text-xs mt-2">
                  Corrections appear inline — deletions in{" "}
                  <span className="text-red-400 line-through">red</span>,
                  additions in{" "}
                  <span className="text-green-400 underline">green</span>
                </p>
              </div>
            )}

            {/* Loading */}
            {humanizing && (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2
                  size={32}
                  className="animate-spin text-brand-orange mb-3"
                />
                <p className="text-gray-400 text-sm">Humanizing your text...</p>
              </div>
            )}

            {/* Results */}
            {hasResult && (
              <>
                {/* Stats bar */}
                <div className="flex items-center gap-3 flex-wrap">
                  {diffStats && (
                    <>
                      <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
                        <span className="text-red-400 text-xs font-semibold">
                          {diffStats.deletions}
                        </span>
                        <span className="text-red-400/70 text-[10px]">
                          removed
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
                        <span className="text-green-400 text-xs font-semibold">
                          {diffStats.insertions}
                        </span>
                        <span className="text-green-400/70 text-[10px]">
                          added
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-1.5 bg-dark-700 rounded-lg px-3 py-1.5">
                    <span className="text-white text-xs font-semibold">
                      {wordCountOrig}
                    </span>
                    <span className="text-gray-500 text-[10px]">→</span>
                    <span className="text-white text-xs font-semibold">
                      {wordCountRevised}
                    </span>
                    <span className="text-gray-500 text-[10px]">words</span>
                  </div>
                </div>

                {/* Tab: Diff view vs Clean view */}
                <div className="flex gap-2 border-b border-dark-500/30 pb-0">
                  {["corrections", "clean"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() =>
                        setViewTab(tab as "corrections" | "clean")
                      }
                      className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize ${
                        viewTab === tab
                          ? "border-brand-orange text-brand-orange"
                          : "border-transparent text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {tab === "corrections"
                        ? "Tracked Changes"
                        : "Clean Text"}
                    </button>
                  ))}
                </div>

                {/* Document view */}
                <div className="bg-dark-700 border border-dark-500 rounded-lg p-5 max-h-[55vh] overflow-y-auto">
                  {viewTab === "corrections" && hasDiff ? (
                    <DiffView segments={diffSegments} />
                  ) : (
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {revisedText}
                    </p>
                  )}
                </div>

                {/* Changes summary */}
                {changesSummary && (
                  <div className="bg-dark-800 border border-dark-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">
                      Changes Summary
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {changesSummary}
                    </p>
                  </div>
                )}

                {/* Action buttons: Copy + Export */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 bg-dark-700 border border-dark-500 hover:border-dark-400 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Copy size={14} />
                    Copy Clean Text
                  </button>
                  <button
                    onClick={() => handleExport("docx")}
                    disabled={!!exporting}
                    className="flex items-center gap-2 bg-dark-700 border border-dark-500 hover:border-dark-400 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {exporting === "docx" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    Export DOCX
                  </button>
                  <button
                    onClick={() => handleExport("tex")}
                    disabled={!!exporting}
                    className="flex items-center gap-2 bg-dark-700 border border-dark-500 hover:border-dark-400 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {exporting === "tex" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FileDown size={14} />
                    )}
                    Export LaTeX
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
