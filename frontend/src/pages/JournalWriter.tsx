import { useState, useRef } from "react";
import {
  BookMarked, PenLine, Sparkles, ClipboardCheck,
  ChevronRight, ChevronLeft, Download, FileDown, FileText,
  Loader2, CheckCircle2, XCircle, Award, Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, apiFetch } from "../utils/api";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface Journal {
  id: string; name: string; field: string; impact_factor: string;
  sections: string[]; abstract_limit: number; word_limit: number | null;
  reference_style: string; guidelines: string;
}
interface ConferenceEvent {
  id: string; name: string; field: string; page_limit: number;
  format: string; sections: string[]; reference_style: string;
  review_criteria: string; guidelines: string;
}
interface TemplateInfo extends Record<string, any> {
  name: string; sections: string[]; publisher: string; template_type: string;
}
interface CheckItem { item: string; status: string; detail: string; }

function StepBar({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "Template", icon: BookMarked },
    { n: 2, label: "Write", icon: PenLine },
    { n: 3, label: "Generate", icon: Sparkles },
    { n: 4, label: "Review", icon: ClipboardCheck },
  ];
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {steps.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${done ? "bg-green-500/20 border-green-500 text-green-400" : active ? "bg-brand-orange/20 border-brand-orange text-brand-orange" : "bg-dark-700 border-dark-500 text-gray-500"}`}>
                {done ? <CheckCircle2 size={18} /> : <s.icon size={18} />}
              </div>
              <span className={`text-[10px] mt-1 ${active ? "text-brand-orange" : done ? "text-green-400" : "text-gray-600"}`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`w-12 h-0.5 mx-1 mb-4 ${current > s.n ? "bg-green-500/50" : "bg-dark-600"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function JournalWriter() {
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState<"journals" | "conferences">("journals");
  const [publishers, setPublishers] = useState<Record<string, any>>({});
  const [conferences, setConferences] = useState<Record<string, any>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [selectedType, setSelectedType] = useState<"journal" | "conference">("journal");
  const [expandedPub, setExpandedPub] = useState<string | null>(null);

  // Step 2
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [title, setTitle] = useState("");
  const [abstractText, setAbstractText] = useState("");
  const [keywords, setKeywords] = useState("");
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("claude");

  // Step 3
  const [generating, setGenerating] = useState(false);
  const [articleContent, setArticleContent] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const contentRef = useRef("");

  // Step 4
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [reviewScore, setReviewScore] = useState(0);
  const [reviewSummary, setReviewSummary] = useState("");
  const [missingElements, setMissingElements] = useState<string[]>([]);
  const [reviewerConcerns, setReviewerConcerns] = useState<string[]>([]);
  const [exporting, setExporting] = useState("");

  // Load data on first render
  const loadData = async () => {
    if (Object.keys(publishers).length) return;
    setLoadingData(true);
    try {
      const [pubRes, confRes] = await Promise.all([
        apiFetch("/api/journal/publishers"),
        apiFetch("/api/journal/conferences"),
      ]);
      setPublishers(pubRes.publishers || {});
      setConferences(confRes.conferences || {});
    } catch (err: any) {
      toast.error("Failed to load templates");
    } finally {
      setLoadingData(false);
    }
  };
  if (!Object.keys(publishers).length && !loadingData) loadData();

  const selectTemplate = async (id: string, type: "journal" | "conference") => {
    setSelectedId(id);
    setSelectedType(type);
  };

  const goToWrite = async () => {
    if (!selectedId) return toast.error("Select a template first");
    try {
      const t = await apiFetch(`/api/journal/template/${selectedId}?type=${selectedType}`);
      setTemplate(t);
      setSectionDrafts({});
      setStep(2);
    } catch (err: any) {
      toast.error("Failed to load template details");
    }
  };

  // Step 3: Generate
  const handleGenerate = async () => {
    if (!title.trim()) return toast.error("Enter a title");
    setStep(3);
    setGenerating(true);
    setArticleContent("");
    contentRef.current = "";
    setWordCount(0);
    try {
      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch(`${API_BASE}/api/journal/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          template_type: selectedType, template_id: selectedId, title,
          content_per_section: sectionDrafts, provider,
          abstract_text: abstractText, keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Failed"); }
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
          try {
            const ev = JSON.parse(line.slice(6).trim());
            if (ev.error) throw new Error(ev.error);
            if (ev.content) { contentRef.current += ev.content; setArticleContent(contentRef.current); }
            if (ev.done) setWordCount(ev.word_count || 0);
          } catch (e: any) { if (e.message && !e.message.includes("JSON")) throw e; }
        }
      }
      toast.success("Article generated!");
    } catch (err: any) {
      toast.error(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // Step 4: Review check
  const handleReviewCheck = async () => {
    setStep(4);
    setChecking(true);
    setChecks([]);
    try {
      const res = await apiPost("/api/journal/review-check", {
        template_type: selectedType, template_id: selectedId,
        content: articleContent, provider,
      });
      setChecks(res.checks || []);
      setReviewScore(res.score || 0);
      setReviewSummary(res.summary || "");
      setMissingElements(res.missing_elements || []);
      setReviewerConcerns(res.reviewer_concerns || []);
    } catch (err: any) {
      toast.error("Review check failed");
    } finally {
      setChecking(false);
    }
  };

  // Export
  const handleExport = async (format: string) => {
    setExporting(format);
    try {
      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch(`${API_BASE}/api/journal/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ title, content: articleContent, template_name: template?.name || "", format }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `article.${format === "docx" ? "docx" : format === "latex" ? "tex" : "pdf"}`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch { toast.error("Export failed"); }
    finally { setExporting(""); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-dark-500/30 bg-dark-800/50 px-6 py-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <BookMarked size={22} className="text-brand-orange" /> iKo Journal
        </h1>
        <p className="text-sm text-gray-400 mt-1">Write for specific journals &amp; conferences with reviewer-aware guidance</p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">
          <StepBar current={step} />

          {/* STEP 1: Select Template */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2 mb-4">
                {(["journals", "conferences"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? "bg-brand-orange text-white" : "bg-dark-700 text-gray-400 hover:text-white"}`}>
                    {t}
                  </button>
                ))}
              </div>

              {loadingData && <div className="flex justify-center py-12"><Loader2 size={32} className="animate-spin text-brand-orange" /></div>}

              {tab === "journals" && !loadingData && Object.entries(publishers).map(([key, pub]: [string, any]) => (
                <div key={key} className="bg-dark-800 rounded-xl border border-dark-500/30 overflow-hidden">
                  <button onClick={() => setExpandedPub(expandedPub === key ? null : key)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-dark-700/50 transition-colors text-left">
                    <span className="font-semibold text-white">{pub.name}</span>
                    <span className="text-xs text-gray-500">{pub.journals?.length} journals</span>
                  </button>
                  {expandedPub === key && (
                    <div className="border-t border-dark-500/20 px-3 pb-3 space-y-2">
                      {pub.journals?.map((j: any) => (
                        <div key={j.id} onClick={() => selectTemplate(j.id, "journal")}
                          className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedId === j.id ? "border-2 border-brand-orange bg-brand-orange/5" : "border border-dark-500/30 hover:border-dark-400 bg-dark-700/30"}`}>
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-white">{j.name}</h4>
                            <span className="text-[10px] bg-brand-blue/20 text-brand-blue px-2 py-0.5 rounded">IF: {j.impact_factor}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{j.field}</p>
                          <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
                            <span>Abstract: {j.abstract_limit} words</span>
                            {j.word_limit && <span>Limit: {j.word_limit} words</span>}
                            <span>{j.reference_style}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {tab === "conferences" && !loadingData && Object.entries(conferences).map(([key, grp]: [string, any]) => (
                <div key={key} className="bg-dark-800 rounded-xl border border-dark-500/30 overflow-hidden">
                  <button onClick={() => setExpandedPub(expandedPub === key ? null : key)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-dark-700/50 transition-colors text-left">
                    <span className="font-semibold text-white">{grp.name}</span>
                    <span className="text-xs text-gray-500">{grp.events?.length} conferences</span>
                  </button>
                  {expandedPub === key && (
                    <div className="border-t border-dark-500/20 px-3 pb-3 space-y-2">
                      {grp.events?.map((ev: any) => (
                        <div key={ev.id} onClick={() => selectTemplate(ev.id, "conference")}
                          className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedId === ev.id ? "border-2 border-brand-orange bg-brand-orange/5" : "border border-dark-500/30 hover:border-dark-400 bg-dark-700/30"}`}>
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-white">{ev.name}</h4>
                            <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded">{ev.page_limit} pages</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{ev.field}</p>
                          <p className="text-[10px] text-gray-500 mt-1">{ev.format} — {ev.reference_style}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex justify-end pt-4">
                <button onClick={goToWrite} disabled={!selectedId}
                  className="flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Write Sections */}
          {step === 2 && template && (
            <div className="space-y-6">
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold text-white flex items-center gap-2"><Award size={16} className="text-brand-orange" /> {template.name}</h2>
                  <span className="text-xs text-gray-500">{template.publisher}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                  {template.abstract_limit && <span>Abstract: {template.abstract_limit} words</span>}
                  {template.word_limit && <span>Word limit: {template.word_limit}</span>}
                  {template.page_limit && <span>Page limit: {template.page_limit}</span>}
                  <span>Ref: {template.reference_style}</span>
                </div>
                {template.guidelines && <p className="text-xs text-gray-500 mt-2 bg-dark-700/50 rounded px-3 py-2">{template.guidelines}</p>}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Article Title</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                    placeholder="Enter your article title..." />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Keywords (comma-separated)</label>
                  <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)}
                    className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                    placeholder="machine learning, healthcare, prediction model..." />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-gray-300">Abstract</label>
                    <span className={`text-xs ${(abstractText.split(/\s+/).filter(Boolean).length) > (template.abstract_limit || 250) ? "text-red-400" : "text-gray-500"}`}>
                      {abstractText.split(/\s+/).filter(Boolean).length} / {template.abstract_limit || 250} words
                    </span>
                  </div>
                  <textarea value={abstractText} onChange={e => setAbstractText(e.target.value)} rows={4}
                    className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
                    placeholder="Write or paste your abstract..." />
                </div>

                {template.sections.filter(s => !s.toLowerCase().includes("abstract") && !s.toLowerCase().includes("reference")).map(section => (
                  <div key={section}>
                    <label className="block text-sm text-gray-300 mb-1">{section}</label>
                    <textarea value={sectionDrafts[section] || ""} onChange={e => setSectionDrafts(prev => ({ ...prev, [section]: e.target.value }))} rows={3}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y text-sm"
                      placeholder={`Enter draft or notes for ${section}... (optional — LLM will expand)`} />
                  </div>
                ))}

                <div>
                  <label className="block text-sm text-gray-300 mb-1">LLM Provider</label>
                  <select value={provider} onChange={e => setProvider(e.target.value)}
                    className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="claude">Claude</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="gpt4o">GPT-4o</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-white flex items-center gap-1"><ChevronLeft size={14} /> Back</button>
                <button onClick={handleGenerate} disabled={!title.trim()}
                  className="flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  <Sparkles size={16} /> Generate Article
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Generated Output */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-dark-800 rounded-xl border border-dark-500/30 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-dark-500/20">
                  <h2 className="text-sm font-semibold text-gray-300">
                    {template?.name} — Generated Article
                    {generating && <Loader2 size={14} className="inline animate-spin ml-2 text-brand-orange" />}
                  </h2>
                  {!generating && wordCount > 0 && <span className="text-xs text-gray-500">{wordCount} words</span>}
                </div>
                <div className="p-6 prose-chat text-gray-200 text-sm leading-relaxed max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
                  {articleContent || (
                    <div className="text-center py-12">
                      <Loader2 size={32} className="animate-spin mx-auto text-brand-orange mb-3" />
                      <p className="text-gray-500">Generating your article...</p>
                    </div>
                  )}
                </div>
              </div>
              {!generating && articleContent && (
                <div className="flex items-center justify-between">
                  <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-white flex items-center gap-1"><ChevronLeft size={14} /> Edit Sections</button>
                  <div className="flex gap-3">
                    <button onClick={handleReviewCheck}
                      className="flex items-center gap-2 bg-brand-blue hover:bg-blue-600 text-white font-medium px-5 py-2 rounded-lg transition-colors">
                      <ClipboardCheck size={16} /> Check Compliance
                    </button>
                    {["pdf", "docx", "latex"].map(fmt => (
                      <button key={fmt} onClick={() => handleExport(fmt)} disabled={!!exporting}
                        className="flex items-center gap-1.5 bg-dark-700 hover:bg-dark-600 text-white px-3 py-2 rounded-lg text-sm border border-dark-500/30 disabled:opacity-50">
                        {exporting === fmt ? <Loader2 size={14} className="animate-spin" /> : fmt === "pdf" ? <FileDown size={14} /> : fmt === "docx" ? <Download size={14} /> : <FileText size={14} />}
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Review & Compliance */}
          {step === 4 && (
            <div className="space-y-6">
              {checking && (
                <div className="text-center py-12">
                  <Loader2 size={32} className="animate-spin mx-auto text-brand-orange mb-3" />
                  <p className="text-gray-400">Checking compliance with {template?.name} requirements...</p>
                </div>
              )}
              {!checking && checks.length > 0 && (
                <>
                  <div className="flex items-center gap-6 bg-dark-800 rounded-xl px-6 py-4 border border-dark-500/30">
                    <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center font-bold text-xl ${reviewScore >= 80 ? "border-green-500 bg-green-500/10 text-green-400" : reviewScore >= 50 ? "border-yellow-500 bg-yellow-500/10 text-yellow-400" : "border-red-500 bg-red-500/10 text-red-400"}`}>
                      {reviewScore}%
                    </div>
                    <div>
                      <p className="text-white font-semibold">Compliance Score</p>
                      <p className="text-sm text-gray-400">{reviewSummary}</p>
                    </div>
                  </div>

                  <div className="bg-dark-800 rounded-xl border border-dark-500/30 p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">Compliance Checklist</h3>
                    {checks.map((c, i) => (
                      <div key={i} className="flex items-start gap-3 py-2 border-b border-dark-500/10 last:border-0">
                        {c.status === "pass" ? <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" /> : <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />}
                        <div>
                          <p className="text-sm text-white">{c.item}</p>
                          <p className="text-xs text-gray-500">{c.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {missingElements.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-red-400 mb-2">Missing Elements</h4>
                      <ul className="space-y-1">{missingElements.map((m, i) => <li key={i} className="text-xs text-gray-300">- {m}</li>)}</ul>
                    </div>
                  )}
                  {reviewerConcerns.length > 0 && (
                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-yellow-400 mb-2">Reviewer Concerns</h4>
                      <ul className="space-y-1">{reviewerConcerns.map((c, i) => <li key={i} className="text-xs text-gray-300">- {c}</li>)}</ul>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-white flex items-center gap-1"><ChevronLeft size={14} /> Back to Edit</button>
                    <div className="flex gap-3">
                      {["pdf", "docx", "latex"].map(fmt => (
                        <button key={fmt} onClick={() => handleExport(fmt)} disabled={!!exporting}
                          className="flex items-center gap-1.5 bg-dark-700 hover:bg-dark-600 text-white px-3 py-2 rounded-lg text-sm border border-dark-500/30 disabled:opacity-50">
                          {exporting === fmt ? <Loader2 size={14} className="animate-spin" /> : fmt === "pdf" ? <FileDown size={14} /> : fmt === "docx" ? <Download size={14} /> : <FileText size={14} />}
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
