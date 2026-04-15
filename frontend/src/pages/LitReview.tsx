import { useState, useRef } from "react";
import {
  BookOpen,
  Search,
  Settings,
  FileText,
  Download,
  ChevronRight,
  ChevronLeft,
  X,
  Loader2,
  CheckCircle2,
  ExternalLink,
  FileDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ---------- Types ----------

interface Breakdown {
  title: string;
  description: string;
  search_query: string;
}

interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  citation_count: number;
  doi: string | null;
  url: string;
  journal: string;
  source: string;
  pdf_url: string | null;
  breakdown?: string;
}

interface ReviewSpecs {
  num_pages: number;
  citation_style: string;
  exclude_sections: string[];
  additional_instructions: string;
  language: string;
}

// ---------- Step Indicator ----------

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "Topic", icon: BookOpen },
    { n: 2, label: "Papers", icon: Search },
    { n: 3, label: "Specs", icon: Settings },
    { n: 4, label: "Review", icon: FileText },
  ];
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {steps.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  done
                    ? "bg-green-500/20 border-green-500 text-green-400"
                    : active
                    ? "bg-brand-orange/20 border-brand-orange text-brand-orange"
                    : "bg-dark-700 border-dark-500 text-gray-500"
                }`}
              >
                {done ? <CheckCircle2 size={18} /> : <s.icon size={18} />}
              </div>
              <span
                className={`text-[10px] mt-1 ${
                  active ? "text-brand-orange" : done ? "text-green-400" : "text-gray-600"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-1 mb-4 ${
                  current > s.n ? "bg-green-500/50" : "bg-dark-600"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Main Component ----------

export default function LitReview() {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [provider, setProvider] = useState("deepseek");
  const [genProvider, setGenProvider] = useState("deepseek");
  const [loading, setLoading] = useState(false);
  const [searchingIdx, setSearchingIdx] = useState<number | null>(null);

  // Step 1
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([]);

  // Step 2
  const [papersByBreakdown, setPapersByBreakdown] = useState<Record<string, Paper[]>>({});
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set());
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  const [searchSource, setSearchSource] = useState("openalex");

  // Step 3
  const [specs, setSpecs] = useState<ReviewSpecs>({
    num_pages: 5,
    citation_style: "apa",
    exclude_sections: [],
    additional_instructions: "",
    language: "English",
  });

  // Step 4
  const [reviewContent, setReviewContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [references, setReferences] = useState<any[]>([]);
  const [exporting, setExporting] = useState("");
  const contentRef = useRef("");

  // ---- Step 1: Suggest breakdowns ----
  const handleSuggestBreakdowns = async () => {
    if (!topic.trim()) return toast.error("Enter a research topic");
    setLoading(true);
    try {
      const res = await apiPost("/api/litreview/breakdowns", { topic, provider });
      setBreakdowns(res.breakdowns || []);
      if (res.breakdowns?.length) {
        toast.success(`${res.breakdowns.length} breakdowns suggested`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  };

  // ---- Step 2: Search papers per breakdown ----
  const searchPapersForBreakdown = async (bd: Breakdown, idx: number) => {
    setSearchingIdx(idx);
    try {
      const res = await apiPost("/api/litreview/search", {
        query: bd.search_query,
        source: searchSource,
        limit: 15,
      });
      const papers = (res.papers || []).map((p: Paper) => ({ ...p, breakdown: bd.title }));
      setPapersByBreakdown((prev) => ({ ...prev, [bd.title]: papers }));
    } catch (err: any) {
      toast.error(`Search failed for "${bd.title}"`);
    } finally {
      setSearchingIdx(null);
    }
  };

  const searchAllBreakdowns = async () => {
    for (let i = 0; i < breakdowns.length; i++) {
      await searchPapersForBreakdown(breakdowns[i], i);
    }
    setStep(2);
  };

  const togglePaper = (id: string) => {
    setSelectedPapers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openPdf = (paper: Paper) => {
    const url =
      paper.pdf_url || (paper.doi ? `https://doi.org/${paper.doi}` : paper.url);
    if (url) {
      setPdfUrl(url);
      setPdfTitle(paper.title);
    } else {
      toast.error("No PDF available for this paper");
    }
  };

  // ---- Step 4: Generate review (SSE) ----
  const handleGenerate = async () => {
    const allPapers = Object.values(papersByBreakdown).flat();
    const selected = allPapers.filter((p) => selectedPapers.has(p.id));
    if (!selected.length) return toast.error("Select at least one paper");

    setStep(4);
    setGenerating(true);
    setReviewContent("");
    contentRef.current = "";
    setWordCount(0);
    setReferences([]);

    try {
      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch(`${API_BASE}/api/litreview/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          topic,
          papers: selected,
          specs,
          provider: genProvider,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Generation failed" }));
        throw new Error(err.detail || "Generation failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw);
            if (event.error) throw new Error(event.error);
            if (event.content) {
              contentRef.current += event.content;
              setReviewContent(contentRef.current);
            }
            if (event.done) {
              setWordCount(event.word_count || 0);
              setReferences(event.references || []);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }
      toast.success("Literature review generated!");
    } catch (err: any) {
      toast.error(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // ---- Export ----
  const handleExport = async (format: string) => {
    setExporting(format);
    try {
      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch(`${API_BASE}/api/litreview/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: topic,
          content: reviewContent,
          references,
          format,
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "docx" ? "docx" : format === "latex" ? "tex" : "pdf";
      a.download = `literature_review.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${ext.toUpperCase()}`);
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setExporting("");
    }
  };

  const allPapers = Object.values(papersByBreakdown).flat();
  const selectedCount = selectedPapers.size;

  // ---------- RENDER ----------

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-dark-500/30 bg-dark-800/50 px-6 py-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <BookOpen size={22} className="text-brand-orange" />
          iKo Lit-Review
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Automated literature review — from topic to export
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">
          <StepIndicator current={step} />

          {/* ==================== STEP 1: Topic ==================== */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-dark-800 rounded-xl p-6 border border-dark-500/30">
                <h2 className="text-lg font-semibold mb-4">
                  Enter your research topic
                </h2>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={3}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-none"
                  placeholder="e.g. The impact of artificial intelligence on early disease detection in Sub-Saharan Africa"
                />
                <div className="flex items-center gap-3 mt-4">
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    <option value="deepseek">DeepSeek</option>
                    <option value="claude">Claude</option>
                    <option value="gpt4o">GPT-4o</option>
                    <option value="gemini">Gemini</option>
                  </select>
                  <button
                    onClick={handleSuggestBreakdowns}
                    disabled={loading || !topic.trim()}
                    className="flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Search size={16} />
                    )}
                    {loading ? "Analyzing..." : "Suggest Breakdowns"}
                  </button>
                </div>
              </div>

              {/* Breakdown cards */}
              {breakdowns.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                    Suggested Sub-Topic Breakdowns
                  </h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    {breakdowns.map((bd, i) => (
                      <div
                        key={i}
                        className="bg-dark-800 rounded-xl p-5 border border-dark-500/30 hover:border-brand-orange/40 transition-colors"
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <span className="w-6 h-6 rounded-full bg-brand-orange/20 text-brand-orange flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <h4 className="font-semibold text-white text-sm">
                            {bd.title}
                          </h4>
                        </div>
                        <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                          {bd.description}
                        </p>
                        <div className="text-[10px] text-gray-600 bg-dark-700 rounded px-2 py-1">
                          Search: {bd.search_query}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={searchSource}
                      onChange={(e) => setSearchSource(e.target.value)}
                      className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                      <option value="openalex">OpenAlex</option>
                      <option value="semanticscholar">Semantic Scholar</option>
                      <option value="crossref">CrossRef</option>
                    </select>
                    <button
                      onClick={searchAllBreakdowns}
                      disabled={searchingIdx !== null}
                      className="flex items-center gap-2 bg-brand-blue hover:bg-blue-600 text-white font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {searchingIdx !== null ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Search size={16} />
                      )}
                      {searchingIdx !== null
                        ? `Searching ${searchingIdx + 1}/${breakdowns.length}...`
                        : "Search Papers for All Breakdowns"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== STEP 2: Papers ==================== */}
          {step === 2 && (
            <div className="flex gap-0 relative">
              {/* Paper list panel */}
              <div
                className={`transition-all duration-300 ${
                  pdfUrl ? "w-[55%] pr-3" : "w-full"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">
                    Select Papers ({selectedCount} selected)
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStep(1)}
                      className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      <ChevronLeft size={14} /> Back
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedCount)
                          return toast.error("Select at least one paper");
                        setStep(3);
                      }}
                      className="flex items-center gap-1 bg-brand-orange hover:bg-orange-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Source tabs */}
                <div className="flex gap-2 mb-4">
                  {["openalex", "semanticscholar", "crossref"].map((src) => (
                    <button
                      key={src}
                      onClick={async () => {
                        setSearchSource(src);
                        // Re-search all breakdowns with new source
                        for (let i = 0; i < breakdowns.length; i++) {
                          setSearchingIdx(i);
                          try {
                            const res = await apiPost("/api/litreview/search", {
                              query: breakdowns[i].search_query,
                              source: src,
                              limit: 15,
                            });
                            const papers = (res.papers || []).map((p: Paper) => ({
                              ...p,
                              breakdown: breakdowns[i].title,
                            }));
                            setPapersByBreakdown((prev) => ({
                              ...prev,
                              [breakdowns[i].title]: papers,
                            }));
                          } catch {}
                        }
                        setSearchingIdx(null);
                      }}
                      disabled={searchingIdx !== null}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        searchSource === src
                          ? "bg-brand-orange/20 text-brand-orange"
                          : "bg-dark-700 text-gray-400 hover:text-white"
                      }`}
                    >
                      {src === "openalex"
                        ? "OpenAlex"
                        : src === "semanticscholar"
                        ? "Semantic Scholar"
                        : "CrossRef"}
                    </button>
                  ))}
                  {searchingIdx !== null && (
                    <Loader2 size={14} className="animate-spin text-gray-400 ml-2 mt-1" />
                  )}
                </div>

                {/* Papers by breakdown */}
                <div className="space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                  {breakdowns.map((bd) => {
                    const papers = papersByBreakdown[bd.title] || [];
                    return (
                      <div key={bd.title}>
                        <h3 className="text-sm font-semibold text-brand-blue mb-2 flex items-center gap-2">
                          <BookOpen size={14} />
                          {bd.title}
                          <span className="text-gray-500 font-normal">
                            ({papers.length} papers)
                          </span>
                        </h3>
                        <div className="space-y-2">
                          {papers.map((paper) => (
                            <div
                              key={paper.id}
                              className={`bg-dark-800 rounded-lg p-3 border transition-colors cursor-pointer ${
                                selectedPapers.has(paper.id)
                                  ? "border-brand-orange/50 bg-brand-orange/5"
                                  : "border-dark-500/30 hover:border-dark-400"
                              }`}
                              onClick={() => togglePaper(paper.id)}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={selectedPapers.has(paper.id)}
                                  onChange={() => togglePaper(paper.id)}
                                  className="mt-1 shrink-0 accent-orange-500"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-medium text-white leading-tight">
                                    {paper.title}
                                  </h4>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {paper.authors.slice(0, 3).join(", ")}
                                    {paper.authors.length > 3 && " et al."}
                                    {paper.year && ` (${paper.year})`}
                                    {paper.journal && ` — ${paper.journal}`}
                                  </p>
                                  {paper.abstract && (
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                      {paper.abstract}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[10px] text-gray-500">
                                      Cited: {paper.citation_count}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPdf(paper);
                                      }}
                                      className="text-[10px] text-brand-blue hover:underline flex items-center gap-1"
                                    >
                                      <ExternalLink size={10} /> View PDF
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {papers.length === 0 && (
                            <p className="text-xs text-gray-600 italic py-2">
                              No papers found for this breakdown.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PDF Preview Panel */}
              {pdfUrl && (
                <div className="w-[45%] border-l border-dark-500/30 pl-3 flex flex-col fixed right-0 top-0 bottom-0 z-40 bg-dark-900 lg:static lg:z-auto">
                  <div className="flex items-center justify-between py-2 px-2 border-b border-dark-500/30 bg-dark-800 rounded-t-lg">
                    <h4 className="text-xs font-medium text-gray-300 truncate pr-2">
                      {pdfTitle}
                    </h4>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-blue hover:underline flex items-center gap-1"
                      >
                        <ExternalLink size={10} /> Open
                      </a>
                      <button
                        onClick={() => setPdfUrl(null)}
                        className="text-gray-400 hover:text-white"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <iframe
                    src={pdfUrl}
                    className="flex-1 w-full bg-white rounded-b-lg"
                    title="Paper PDF"
                  />
                </div>
              )}
            </div>
          )}

          {/* ==================== STEP 3: Specs ==================== */}
          {step === 3 && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-dark-800 rounded-xl p-6 border border-dark-500/30">
                <h2 className="text-lg font-semibold mb-1">Review Specifications</h2>
                <p className="text-sm text-gray-400 mb-6">
                  {selectedCount} paper{selectedCount !== 1 ? "s" : ""} selected
                  for review
                </p>

                <div className="space-y-5">
                  {/* Number of pages */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Target length (pages)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={specs.num_pages}
                      onChange={(e) =>
                        setSpecs({
                          ...specs,
                          num_pages: parseInt(e.target.value) || 5,
                        })
                      }
                      className="w-32 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-blue"
                    />
                    <span className="text-xs text-gray-500 ml-2">
                      (~{specs.num_pages * 300} words)
                    </span>
                  </div>

                  {/* Citation style */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Citation style
                    </label>
                    <div className="flex gap-3">
                      {["apa", "ieee", "harvard"].map((style) => (
                        <label
                          key={style}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                            specs.citation_style === style
                              ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                              : "border-dark-500 bg-dark-700 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          <input
                            type="radio"
                            name="citestyle"
                            value={style}
                            checked={specs.citation_style === style}
                            onChange={() =>
                              setSpecs({ ...specs, citation_style: style })
                            }
                            className="hidden"
                          />
                          {style.toUpperCase()}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Exclude sections */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Sections to exclude (optional)
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        "Introduction",
                        "Conclusion",
                        "Research Gaps",
                        "Future Directions",
                      ].map((section) => (
                        <label
                          key={section}
                          className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={specs.exclude_sections.includes(section)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...specs.exclude_sections, section]
                                : specs.exclude_sections.filter(
                                    (s) => s !== section
                                  );
                              setSpecs({ ...specs, exclude_sections: next });
                            }}
                            className="accent-orange-500"
                          />
                          {section}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Additional instructions */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Additional instructions (optional)
                    </label>
                    <textarea
                      value={specs.additional_instructions}
                      onChange={(e) =>
                        setSpecs({
                          ...specs,
                          additional_instructions: e.target.value,
                        })
                      }
                      rows={3}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-none"
                      placeholder="e.g. Focus on studies from 2020 onwards, emphasize methodology comparison..."
                    />
                  </div>

                  {/* Provider */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      LLM for generation
                    </label>
                    <select
                      value={genProvider}
                      onChange={(e) => setGenProvider(e.target.value)}
                      className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                      <option value="deepseek">DeepSeek</option>
                      <option value="claude">Claude</option>
                      <option value="gpt4o">GPT-4o</option>
                      <option value="gemini">Gemini</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> Back to papers
                </button>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
                >
                  <FileText size={16} />
                  Generate Literature Review
                </button>
              </div>
            </div>
          )}

          {/* ==================== STEP 4: Output ==================== */}
          {step === 4 && (
            <div className="space-y-6">
              {/* Stats bar */}
              {!generating && reviewContent && (
                <div className="flex items-center gap-6 bg-dark-800 rounded-xl px-6 py-3 border border-dark-500/30">
                  <div>
                    <span className="text-xs text-gray-500">Words</span>
                    <p className="text-white font-semibold">{wordCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Papers cited</span>
                    <p className="text-white font-semibold">{references.length}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Est. pages</span>
                    <p className="text-white font-semibold">
                      {Math.ceil(wordCount / 300)}
                    </p>
                  </div>
                </div>
              )}

              {/* Review content */}
              <div className="bg-dark-800 rounded-xl border border-dark-500/30 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-dark-500/20">
                  <h2 className="text-sm font-semibold text-gray-300">
                    Literature Review
                    {generating && (
                      <Loader2
                        size={14}
                        className="inline animate-spin ml-2 text-brand-orange"
                      />
                    )}
                  </h2>
                  {generating && (
                    <span className="text-xs text-gray-500 animate-pulse">
                      Generating...
                    </span>
                  )}
                </div>
                <div className="p-6 prose-chat text-gray-200 text-sm leading-relaxed max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
                  {reviewContent || (
                    <div className="text-center py-12">
                      <Loader2
                        size={32}
                        className="animate-spin mx-auto text-brand-orange mb-3"
                      />
                      <p className="text-gray-500">
                        Generating your literature review...
                      </p>
                      <p className="text-gray-600 text-xs mt-1">
                        This may take a minute for longer reviews.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Export & actions */}
              {!generating && reviewContent && (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setStep(1);
                      setReviewContent("");
                      setBreakdowns([]);
                      setPapersByBreakdown({});
                      setSelectedPapers(new Set());
                      setTopic("");
                      setWordCount(0);
                      setReferences([]);
                    }}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    Start Over
                  </button>
                  <div className="flex items-center gap-3">
                    {[
                      { fmt: "pdf", label: "PDF", icon: FileDown },
                      { fmt: "docx", label: "DOCX", icon: Download },
                      { fmt: "latex", label: "LaTeX", icon: FileText },
                    ].map(({ fmt, label, icon: Icon }) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        disabled={!!exporting}
                        className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-white px-4 py-2 rounded-lg text-sm font-medium border border-dark-500/30 transition-colors disabled:opacity-50"
                      >
                        {exporting === fmt ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Icon size={14} />
                        )}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
