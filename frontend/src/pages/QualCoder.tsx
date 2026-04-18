import { useState, useEffect } from "react";
import { FileSearch, Upload, Code2, Layers, Loader2, Plus, Sparkles, ChevronRight, Tag } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, apiFetch } from "../utils/api";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function QualCoder() {
  const [view, setView] = useState<"projects"|"detail">("projects");
  const [projects, setProjects] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [provider, setProvider] = useState("deepseek");
  const [approach, setApproach] = useState("inductive");
  const [themes, setThemes] = useState<any>(null);

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    try { const res = await apiFetch("/api/qualcoder/projects"); setProjects(res); }
    catch { toast.error("Failed to load projects"); }
  };

  const createProject = async () => {
    if (!newTitle.trim()) return;
    try { await apiPost("/api/qualcoder/projects", { title: newTitle }); setNewTitle(""); loadProjects(); toast.success("Project created"); }
    catch { toast.error("Failed to create"); }
  };

  const openProject = async (id: number) => {
    setLoading(true);
    try { const res = await apiFetch(`/api/qualcoder/projects/${id}`); setProject(res); setView("detail"); }
    catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };

  const uploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !project) return;
    const formData = new FormData(); formData.append("file", file);
    const token = localStorage.getItem("ikopilot_token");
    try {
      const res = await fetch(`${API_BASE}/api/qualcoder/projects/${project.id}/upload`, {
        method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("Document uploaded"); openProject(project.id);
    } catch { toast.error("Upload failed"); }
  };

  const autoCode = async () => {
    if (!project) return; setLoading(true);
    try {
      const res = await apiPost("/api/qualcoder/auto-code", { project_id: project.id, approach, provider });
      toast.success(`${res.codes_found} codes found, ${res.segments_coded} segments coded`);
      openProject(project.id);
    } catch (err: any) { toast.error(err.message || "Auto-coding failed"); }
    finally { setLoading(false); }
  };

  const genThemes = async () => {
    if (!project) return; setLoading(true);
    try { const res = await apiPost("/api/qualcoder/generate-themes", { project_id: project.id, provider }); setThemes(res); toast.success("Themes generated"); }
    catch { toast.error("Theme generation failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-dark-500/30 bg-dark-800/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><FileSearch size={22} className="text-brand-orange" />
            <div><h1 className="text-xl font-bold text-white">iKo QualCoder</h1><p className="text-xs text-gray-400">Qualitative data analysis — coding, themes, codebooks</p></div>
          </div>
          {view === "detail" && <button onClick={() => setView("projects")} className="text-sm text-gray-400 hover:text-white">← All Projects</button>}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6"><div className="max-w-5xl mx-auto">
        {view === "projects" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="New project title..."
                className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none" />
              <button onClick={createProject} disabled={!newTitle.trim()} className="bg-brand-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"><Plus size={16} /></button>
            </div>
            {projects.map((p: any) => (
              <div key={p.id} onClick={() => openProject(p.id)} className="bg-dark-800 rounded-xl p-4 border border-dark-500/30 cursor-pointer hover:border-brand-orange/30">
                <h3 className="font-semibold text-white">{p.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{p.doc_count} docs • {p.code_count} codes • {p.segment_count} segments</p>
              </div>
            ))}
            {projects.length === 0 && <p className="text-center text-gray-600 py-12">Create a project to start coding qualitative data.</p>}
          </div>
        )}

        {view === "detail" && project && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-white">{project.title}</h2>

            {/* Documents */}
            <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Documents ({project.documents.length})</h3>
                <label className="flex items-center gap-1 text-xs text-brand-blue cursor-pointer hover:underline">
                  <Upload size={12} /> Upload<input type="file" accept=".txt,.pdf,.docx" onChange={uploadDoc} className="hidden" />
                </label>
              </div>
              {project.documents.map((d: any) => (
                <div key={d.id} className="bg-dark-700/50 rounded-lg p-3 mb-2">
                  <p className="text-sm text-white">{d.name}</p><p className="text-xs text-gray-500">{d.word_count} words</p>
                </div>
              ))}
            </div>

            {/* Auto-code controls */}
            <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Auto-Code with AI</h3>
              <div className="flex gap-3 flex-wrap">
                <select value={approach} onChange={e => setApproach(e.target.value)} className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                  <option value="inductive">Inductive</option><option value="deductive">Deductive</option><option value="hybrid">Hybrid</option>
                </select>
                <select value={provider} onChange={e => setProvider(e.target.value)} className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                  <option value="deepseek">DeepSeek</option><option value="claude">Claude</option><option value="gpt4o">GPT-4o</option>
                </select>
                <button onClick={autoCode} disabled={loading || !project.documents.length} className="flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Code2 size={14} />} Auto-Code
                </button>
                <button onClick={genThemes} disabled={loading || !project.coded_segments.length} className="flex items-center gap-2 bg-brand-blue hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />} Generate Themes
                </button>
              </div>
            </div>

            {/* Codebook */}
            {project.codebook.length > 0 && (
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Codebook ({project.codebook.length} codes)</h3>
                <div className="flex flex-wrap gap-2">
                  {project.codebook.map((c: any) => (
                    <span key={c.id} className="px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: c.color, color: c.color, backgroundColor: `${c.color}15` }}>
                      <Tag size={10} className="inline mr-1" />{c.code}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Coded Segments */}
            {project.coded_segments.length > 0 && (
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Coded Segments ({project.coded_segments.length})</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {project.coded_segments.slice(0, 20).map((s: any, i: number) => (
                    <div key={i} className="bg-dark-700/50 rounded-lg p-3 border-l-2 border-brand-orange">
                      <p className="text-sm text-gray-200 italic">"{s.text}"</p>
                      <div className="flex gap-1 mt-1">{(s.codes || []).map((c: string, j: number) => (
                        <span key={j} className="text-[10px] bg-brand-orange/20 text-brand-orange px-1.5 py-0.5 rounded">{c}</span>
                      ))}</div>
                      {s.memo && <p className="text-xs text-gray-500 mt-1">Memo: {s.memo}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Themes */}
            {themes && themes.themes?.length > 0 && (
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Themes</h3>
                {themes.themes.map((t: any, i: number) => (
                  <div key={i} className="bg-dark-700/50 rounded-lg p-4 mb-3">
                    <h4 className="font-semibold text-white">{t.name}</h4>
                    <p className="text-sm text-gray-300 mt-1">{t.description}</p>
                    <div className="flex gap-1 mt-2">{(t.codes || []).map((c: string, j: number) => (
                      <span key={j} className="text-[10px] bg-brand-blue/20 text-brand-blue px-1.5 py-0.5 rounded">{c}</span>
                    ))}</div>
                  </div>
                ))}
                {themes.thematic_map && <div className="bg-dark-700/30 rounded-lg p-3 mt-3"><p className="text-xs text-gray-400 mb-1">Thematic Map</p><p className="text-sm text-gray-200">{themes.thematic_map}</p></div>}
              </div>
            )}
          </div>
        )}
      </div></div>
    </div>
  );
}
