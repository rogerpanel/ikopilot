import { useState, useEffect } from "react";
import {
  Search,
  Loader2,
  Lightbulb,
  HelpCircle,
  FlaskConical,
  BarChart3,
  Swords,
  CheckCircle,
  XCircle,
  ArrowRightLeft,
  Merge,
  Network,
  ChevronDown,
  Link2,
  FolderKanban,
  Download,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, apiFetch } from "../utils/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab = "gaps" | "debate" | "citations";

interface ResearchGap {
  title: string;
  description: string;
  research_question: string;
  methodology: string;
  confidence: number;
}

interface DebateSide {
  paper: string;
  claims: string[];
}

interface DebateResult {
  sides: DebateSide[];
  agreements: string[];
  contradictions: string[];
  synthesis: string;
}

interface ProjectItem {
  id: number;
  title: string;
}

interface Citation {
  id: string;
  title: string;
  authors: string;
  year: number;
  connections: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function confidenceColor(score: number): string {
  if (score >= 80) return "bg-green-500/20 text-green-400 border-green-500/30";
  if (score >= 50) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

const TAB_CONFIG: { id: Tab; label: string; icon: any }[] = [
  { id: "gaps", label: "Gap Finder", icon: Lightbulb },
  { id: "debate", label: "Debate Mode", icon: Swords },
  { id: "citations", label: "Citation Graph", icon: Network },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Discover() {
  const [tab, setTab] = useState<Tab>("gaps");

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search size={24} className="text-brand-orange" />
          iKo Discover
        </h1>
        <p className="text-sm text-gray-400 mt-1">Research Intelligence Tools</p>
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

      {tab === "gaps" && <GapFinder />}
      {tab === "debate" && <DebateMode />}
      {tab === "citations" && <CitationGraph />}
    </div>
  );
}

/* ================================================================== */
/*  Tab 1: Gap Finder                                                  */
/* ================================================================== */

function GapFinder() {
  const [topic, setTopic] = useState("");
  const [papersSummary, setPapersSummary] = useState("");
  const [field, setField] = useState("");
  const [provider, setProvider] = useState("claude");
  const [loading, setLoading] = useState(false);
  const [gaps, setGaps] = useState<ResearchGap[] | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      toast.error("Please enter a research topic");
      return;
    }
    setLoading(true);
    setGaps(null);
    try {
      const data = await apiPost<{ gaps: ResearchGap[] }>(
        "/api/discover/find-gaps",
        { topic, papers_summary: papersSummary, field, provider }
      );
      setGaps(data.gaps || []);
      toast.success("Research gaps identified");
    } catch (err: any) {
      toast.error(err.message || "Failed to find gaps");
    } finally {
      setLoading(false);
    }
  };

  const handleExportGaps = (gapList: ResearchGap[], topicStr: string) => {
    let md = `# Research Gap Analysis\n\n**Topic**: ${topicStr}\n\n`;
    gapList.forEach((g, i) => {
      md += `## Gap ${i + 1}: ${g.title}\n\n`;
      md += `- **Description**: ${g.description}\n`;
      md += `- **Research question**: ${g.research_question}\n`;
      md += `- **Suggested methodology**: ${g.methodology}\n`;
      md += `- **Confidence**: ${g.confidence}%\n\n`;
    });
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "gap_analysis.md"; a.click(); URL.revokeObjectURL(url);
    toast.success("Gap analysis exported");
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-dark-800 border border-dark-500/30 rounded-xl p-4 sm:p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-1.5">Research Topic</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Describe your research area or topic of interest..."
            rows={3}
            className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1.5">Papers Summary</label>
          <textarea
            value={papersSummary}
            onChange={(e) => setPapersSummary(e.target.value)}
            placeholder="Paste summaries of key papers you have reviewed (optional)..."
            rows={4}
            className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1.5">Research Field</label>
          <input
            type="text"
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder="e.g. Computer Science, Psychology, Biology..."
            className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
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
            type="submit"
            disabled={loading || !topic.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Lightbulb size={16} />
                Find Research Gaps
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results */}
      {gaps && gaps.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Lightbulb size={40} className="mx-auto mb-3 text-gray-600" />
          <p>No gaps identified. Try providing more detail or a different topic.</p>
        </div>
      )}

      {gaps && gaps.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">
            {gaps.length} Research Gap{gaps.length !== 1 ? "s" : ""} Identified
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {gaps.map((gap, i) => (
              <div
                key={i}
                className="bg-dark-800 border border-dark-500/30 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-semibold text-white text-sm leading-snug">
                    {gap.title}
                  </h4>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${confidenceColor(
                      gap.confidence
                    )}`}
                  >
                    {gap.confidence}%
                  </span>
                </div>

                <p className="text-sm text-gray-400 leading-relaxed">
                  {gap.description}
                </p>

                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <HelpCircle size={14} className="text-brand-orange mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Research Question</p>
                      <p className="text-sm text-gray-300">{gap.research_question}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <FlaskConical size={14} className="text-brand-blue mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Suggested Methodology</p>
                      <p className="text-sm text-gray-300">{gap.methodology}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => handleExportGaps(gaps, topic)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Download size={12} /> Export Gaps
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Tab 2: Debate Mode                                                 */
/* ================================================================== */

function DebateMode() {
  const [paperA, setPaperA] = useState("");
  const [paperB, setPaperB] = useState("");
  const [topic, setTopic] = useState("");
  const [provider, setProvider] = useState("claude");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebateResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paperA.trim() || !paperB.trim()) {
      toast.error("Please provide content for both papers");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost<DebateResult>("/api/discover/debate", {
        paper_a: paperA,
        paper_b: paperB,
        topic,
        provider,
      });
      setResult(data);
      toast.success("Debate analysis complete");
    } catch (err: any) {
      toast.error(err.message || "Debate analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExportDebate = (debate: DebateResult) => {
    let md = `# Academic Debate Analysis\n\n**Topic**: ${topic || ""}\n\n`;
    debate.sides.forEach((side, idx) => {
      md += `## ${side.paper || `Paper ${idx === 0 ? "A" : "B"}`} Claims\n`;
      side.claims.forEach((claim) => { md += `- ${claim}\n`; });
      md += `\n`;
    });
    md += `## Points of Agreement\n`;
    debate.agreements.forEach((p) => { md += `- ${p}\n`; });
    md += `\n## Contradictions\n`;
    debate.contradictions.forEach((p) => { md += `- ${p}\n`; });
    md += `\n## Synthesis\n${debate.synthesis || ""}\n`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "debate_analysis.md"; a.click(); URL.revokeObjectURL(url);
    toast.success("Debate analysis exported");
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-dark-800 border border-dark-500/30 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Paper A</label>
            <textarea
              value={paperA}
              onChange={(e) => setPaperA(e.target.value)}
              placeholder="Paste the abstract or key arguments of Paper A..."
              rows={6}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Paper B</label>
            <textarea
              value={paperB}
              onChange={(e) => setPaperB(e.target.value)}
              placeholder="Paste the abstract or key arguments of Paper B..."
              rows={6}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1.5">Topic / Focus Area</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Effectiveness of remote learning on student performance"
            className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
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
            type="submit"
            disabled={loading || !paperA.trim() || !paperB.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Swords size={16} />
                Start Debate
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Side-by-side claims */}
          <div className="grid gap-4 md:grid-cols-2">
            {result.sides.map((side, idx) => (
              <div
                key={idx}
                className="bg-dark-800 border border-dark-500/30 rounded-xl p-5"
              >
                <h4 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                  <BarChart3 size={16} className={idx === 0 ? "text-blue-400" : "text-purple-400"} />
                  {side.paper || `Paper ${idx === 0 ? "A" : "B"}`}
                </h4>
                <ul className="space-y-2">
                  {side.claims.map((claim, ci) => (
                    <li key={ci} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 mt-2 flex-shrink-0" />
                      <p className="text-sm text-gray-300 leading-relaxed">{claim}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Agreements */}
          {result.agreements.length > 0 && (
            <div className="bg-dark-800 border border-green-500/20 rounded-xl p-5">
              <h4 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                <CheckCircle size={16} className="text-green-400" />
                Points of Agreement
              </h4>
              <ul className="space-y-2">
                {result.agreements.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-300">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Contradictions */}
          {result.contradictions.length > 0 && (
            <div className="bg-dark-800 border border-red-500/20 rounded-xl p-5">
              <h4 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                <XCircle size={16} className="text-red-400" />
                Contradictions
              </h4>
              <ul className="space-y-2">
                {result.contradictions.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ArrowRightLeft size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-300">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Synthesis */}
          {result.synthesis && (
            <div className="bg-dark-800 border border-brand-orange/20 rounded-xl p-5">
              <h4 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                <Merge size={16} className="text-brand-orange" />
                Synthesis
              </h4>
              <p className="text-sm text-gray-300 leading-relaxed">{result.synthesis}</p>
            </div>
          )}
          <button
            onClick={() => handleExportDebate(result)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Download size={12} /> Export Debate
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Tab 3: Citation Graph (placeholder)                                */
/* ================================================================== */

function CitationGraph() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [citations, setCitations] = useState<Citation[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingCitations, setLoadingCitations] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingProjects(true);
      try {
        const data = await apiFetch<ProjectItem[]>("/api/projects/");
        if (!cancelled) setProjects(data);
      } catch {
        // silently fail — user may not have projects
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleProjectSelect = async (projectId: number) => {
    setSelectedProject(projectId);
    setCitations(null);
    if (!projectId) return;
    setLoadingCitations(true);
    try {
      const data = await apiFetch<{ citations: Citation[] }>(
        `/api/projects/${projectId}/citations`
      );
      setCitations(data.citations || []);
    } catch {
      setCitations([]);
    } finally {
      setLoadingCitations(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-6 text-center space-y-4">
        <Network size={48} className="mx-auto text-gray-600" />
        <div>
          <h3 className="text-lg font-semibold text-white">Citation Graph</h3>
          <p className="text-sm text-gray-400 mt-1">
            Select a project to visualize citation connections
          </p>
        </div>

        {/* Project selector */}
        <div className="max-w-sm mx-auto">
          <div className="relative">
            <FolderKanban size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <select
              value={selectedProject ?? ""}
              onChange={(e) => handleProjectSelect(Number(e.target.value))}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-10 pr-10 py-2.5 text-white focus:border-brand-blue focus:outline-none appearance-none"
            >
              <option value="">Choose a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
          {loadingProjects && (
            <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Loading projects...
            </p>
          )}
        </div>
      </div>

      {/* Citations list */}
      {loadingCitations && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-brand-orange" />
        </div>
      )}

      {citations && citations.length === 0 && !loadingCitations && (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No citations found for this project yet.</p>
          <p className="text-xs mt-1">Upload papers to your project to build the citation graph.</p>
        </div>
      )}

      {citations && citations.length > 0 && (
        <div className="bg-dark-800 border border-dark-500/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-500/30">
            <h4 className="text-sm font-semibold text-white">
              {citations.length} Citation{citations.length !== 1 ? "s" : ""}
            </h4>
          </div>
          <div className="divide-y divide-dark-500/20">
            {citations.map((cit) => (
              <div key={cit.id} className="px-4 py-3 hover:bg-dark-700/50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{cit.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {cit.authors} {cit.year ? `(${cit.year})` : ""}
                    </p>
                  </div>
                  {cit.connections.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded-full flex-shrink-0">
                      <Link2 size={10} />
                      {cit.connections.length} link{cit.connections.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {cit.connections.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cit.connections.map((conn, ci) => (
                      <span
                        key={ci}
                        className="text-[10px] bg-dark-700 border border-dark-500/30 text-gray-400 px-2 py-0.5 rounded"
                      >
                        {conn}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
