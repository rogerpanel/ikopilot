import { useState } from "react";
import {
  Search,
  BookOpen,
  Plus,
  ExternalLink,
  Loader2,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiFetch, apiPost } from "../utils/api";

interface PaperResult {
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
}

interface ScholarSearchProps {
  projectId?: number | null;
}

const SOURCE_OPTIONS = [
  { value: "openalex", label: "OpenAlex", desc: "200M+ works" },
  { value: "semanticscholar", label: "Semantic Scholar", desc: "CS/AI focus" },
  { value: "crossref", label: "CrossRef", desc: "130M+ DOIs" },
];

export default function ScholarSearch({ projectId }: ScholarSearchProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("openalex");
  const [results, setResults] = useState<PaperResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const data = await apiFetch(
        `/api/scholar/search?q=${encodeURIComponent(query)}&source=${source}&limit=10`
      );
      setResults(data);
      if (data.length === 0) toast("No papers found", { icon: "i" });
    } catch (err: any) {
      toast.error(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCitation = async (paper: PaperResult) => {
    if (!projectId) {
      toast.error("Select a project first to save citations");
      return;
    }
    try {
      await apiPost("/api/scholar/citations/add", {
        project_id: projectId,
        paper_id: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        doi: paper.doi,
        url: paper.url,
        journal: paper.journal,
        abstract: paper.abstract,
      });
      toast.success("Added to project citations");
    } catch (err: any) {
      toast.error(err.message || "Failed to add citation");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search form */}
      <form onSubmit={handleSearch} className="p-3 space-y-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search papers..."
            className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
          >
            {SOURCE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-brand-blue hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Search"}
          </button>
        </div>
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-3">
        {results.map((paper) => {
          const isExpanded = expandedId === paper.id;
          return (
            <div
              key={paper.id}
              className="bg-dark-700/50 border border-dark-500/20 rounded-lg p-3"
            >
              <div
                className="cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : paper.id)}
              >
                <h4 className="text-sm font-medium text-white leading-tight">
                  {paper.title}
                </h4>
                <p className="text-[11px] text-gray-400 mt-1">
                  {paper.authors.slice(0, 3).join(", ")}
                  {paper.authors.length > 3 ? " et al." : ""}
                  {paper.year ? ` (${paper.year})` : ""}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                  {paper.journal && (
                    <span className="truncate max-w-[120px]">{paper.journal}</span>
                  )}
                  <span>{paper.citation_count} citations</span>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-dark-500/20">
                  {paper.abstract && (
                    <p className="text-xs text-gray-400 mb-2 line-clamp-4">
                      {paper.abstract}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    {projectId && (
                      <button
                        onClick={() => handleAddCitation(paper)}
                        className="flex items-center gap-1 text-xs bg-brand-orange/10 text-brand-orange px-2 py-1 rounded hover:bg-brand-orange/20 inline-btn"
                      >
                        <Plus size={12} />
                        Add to project
                      </button>
                    )}
                    {paper.doi && (
                      <a
                        href={`https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-brand-blue hover:underline inline-link"
                      >
                        <ExternalLink size={12} />
                        DOI
                      </a>
                    )}
                    {paper.url && !paper.doi && (
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-brand-blue hover:underline inline-link"
                      >
                        <ExternalLink size={12} />
                        View
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {results.length === 0 && !loading && (
          <div className="text-center py-8">
            <BookOpen size={32} className="mx-auto text-gray-600 mb-2" />
            <p className="text-xs text-gray-500">
              Search 200M+ academic papers
            </p>
            <p className="text-[10px] text-gray-600 mt-1">
              OpenAlex, Semantic Scholar, CrossRef
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
