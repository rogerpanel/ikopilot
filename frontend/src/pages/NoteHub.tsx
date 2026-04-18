import { useState, useEffect } from "react";
import { Notebook, Plus, Link2, Sparkles, Search, Tag, Loader2, Trash2, X, Edit3 } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, apiFetch, apiDelete } from "../utils/api";

const TYPE_COLORS: Record<string, string> = { idea: "#F97316", literature: "#3B82F6", method: "#10B981", finding: "#8B5CF6", question: "#EF4444" };

export default function NoteHub() {
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newType, setNewType] = useState("idea");
  const [newSource, setNewSource] = useState("");
  const [provider, setProvider] = useState("deepseek");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [genText, setGenText] = useState("");
  const [showGen, setShowGen] = useState(false);

  useEffect(() => { loadNotes(); }, [search, filterType]);

  const loadNotes = async () => {
    try { const res = await apiFetch(`/api/notehub/notes?search=${search}&note_type=${filterType}`); setNotes(res.notes || []); }
    catch { toast.error("Failed to load notes"); }
  };

  const openNote = async (id: number) => {
    try { const res = await apiFetch(`/api/notehub/notes/${id}`); setSelectedNote(res); }
    catch { toast.error("Failed to load note"); }
  };

  const createNote = async () => {
    if (!newTitle.trim()) return;
    try {
      await apiPost("/api/notehub/notes", { title: newTitle, content: newContent, tags: newTags.split(",").map(t => t.trim()).filter(Boolean), note_type: newType, source: newSource });
      setNewTitle(""); setNewContent(""); setNewTags(""); setShowCreate(false); loadNotes(); toast.success("Note created");
    } catch { toast.error("Failed to create note"); }
  };

  const deleteNote = async (id: number) => {
    try { await apiDelete(`/api/notehub/notes/${id}`); setSelectedNote(null); loadNotes(); toast.success("Deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  const suggestLinks = async () => {
    if (!selectedNote) return; setLoading(true);
    try { const res = await apiPost("/api/notehub/suggest-links", { note_id: selectedNote.id, provider }); setSuggestions(res.suggestions || []); }
    catch { toast.error("Failed"); }
    finally { setLoading(false); }
  };

  const synthesize = async (noteIds: number[]) => {
    if (noteIds.length < 2) return toast.error("Select at least 2 notes"); setLoading(true);
    try { const res = await apiPost("/api/notehub/synthesize", { note_ids: noteIds, provider }); toast.success("Synthesis note created"); loadNotes(); openNote(res.note_id); }
    catch { toast.error("Failed"); }
    finally { setLoading(false); }
  };

  const generateFromText = async () => {
    if (!genText.trim()) return; setLoading(true);
    try { const res = await apiPost("/api/notehub/generate-from-text", { text: genText, provider }); toast.success(`${res.notes_created} notes generated`); setGenText(""); setShowGen(false); loadNotes(); }
    catch { toast.error("Generation failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-dark-500/30 bg-dark-800/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><Notebook size={22} className="text-brand-orange" />
            <div><h1 className="text-xl font-bold text-white">iKo NoteHub</h1><p className="text-xs text-gray-400">Zettelkasten knowledge base with AI-powered linking</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowGen(!showGen)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-700 text-gray-400 hover:text-white"><Sparkles size={12} className="inline mr-1" />Auto-Generate</button>
            <button onClick={() => setShowCreate(!showCreate)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-orange text-white"><Plus size={12} className="inline mr-1" />New Note</button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Note List */}
        <div className="w-1/3 border-r border-dark-500/30 flex flex-col">
          <div className="p-3 space-y-2 border-b border-dark-500/20">
            <div className="flex gap-2">
              <div className="flex-1 relative"><Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes..."
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none" /></div>
            </div>
            <div className="flex gap-1 flex-wrap">
              {["", "idea", "literature", "method", "finding", "question"].map(t => (
                <button key={t} onClick={() => setFilterType(t)} className={`px-2 py-1 rounded text-[10px] font-medium capitalize ${filterType === t ? "bg-brand-orange text-white" : "bg-dark-700 text-gray-500"}`}>
                  {t || "All"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notes.map(n => (
              <div key={n.id} onClick={() => openNote(n.id)}
                className={`px-4 py-3 border-b border-dark-500/20 cursor-pointer hover:bg-dark-700/50 ${selectedNote?.id === n.id ? "bg-dark-700/50 border-l-2 border-l-brand-orange" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[n.note_type] || "#666" }} />
                  <h4 className="text-sm font-medium text-white truncate">{n.title}</h4>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.content}</p>
                {n.tags?.length > 0 && <div className="flex gap-1 mt-1">{n.tags.slice(0, 3).map((t: string, i: number) => (
                  <span key={i} className="text-[9px] text-gray-600 bg-dark-600 px-1 rounded">{t}</span>
                ))}</div>}
              </div>
            ))}
            {notes.length === 0 && <p className="text-center text-gray-600 py-8 text-sm">No notes yet</p>}
          </div>
        </div>

        {/* Right: Note Detail / Create */}
        <div className="flex-1 overflow-y-auto p-6">
          {showCreate && (
            <div className="max-w-2xl space-y-3 mb-6 bg-dark-800 rounded-xl p-5 border border-dark-500/30">
              <h3 className="font-semibold text-white">New Note</h3>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title"
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none" />
              <textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={4} placeholder="Content — one idea per note"
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none resize-y" />
              <div className="flex gap-2">
                <input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="Tags (comma-separated)"
                  className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                <select value={newType} onChange={e => setNewType(e.target.value)}
                  className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                  <option value="idea">Idea</option><option value="literature">Literature</option><option value="method">Method</option>
                  <option value="finding">Finding</option><option value="question">Question</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={createNote} className="bg-brand-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Save Note</button>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white text-sm">Cancel</button>
              </div>
            </div>
          )}

          {showGen && (
            <div className="max-w-2xl space-y-3 mb-6 bg-dark-800 rounded-xl p-5 border border-dark-500/30">
              <h3 className="font-semibold text-white">Auto-Generate Notes from Text</h3>
              <textarea value={genText} onChange={e => setGenText(e.target.value)} rows={4} placeholder="Paste paper abstract, lecture notes, or any text..."
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none resize-y" />
              <button onClick={generateFromText} disabled={loading} className="flex items-center gap-2 bg-brand-orange text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Atomic Notes
              </button>
            </div>
          )}

          {selectedNote && (
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[selectedNote.note_type] || "#666" }} />
                  <h2 className="text-lg font-bold text-white">{selectedNote.title}</h2>
                </div>
                <button onClick={() => deleteNote(selectedNote.id)} className="text-gray-500 hover:text-red-400"><Trash2 size={16} /></button>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{selectedNote.content}</p>
              {selectedNote.tags?.length > 0 && (
                <div className="flex gap-1 flex-wrap">{selectedNote.tags.map((t: string, i: number) => (
                  <span key={i} className="text-xs bg-dark-700 text-gray-400 px-2 py-1 rounded-lg"><Tag size={10} className="inline mr-1" />{t}</span>
                ))}</div>
              )}
              {selectedNote.source && <p className="text-xs text-gray-600">Source: {selectedNote.source}</p>}

              {/* Links */}
              {(selectedNote.linked_notes?.length > 0 || selectedNote.backlinks?.length > 0) && (
                <div className="bg-dark-800 rounded-xl p-4 border border-dark-500/30">
                  <h4 className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Link2 size={12} /> Connections</h4>
                  {selectedNote.linked_notes?.map((l: any) => (
                    <button key={l.id} onClick={() => openNote(l.id)} className="text-sm text-brand-blue hover:underline block">→ {l.title}</button>
                  ))}
                  {selectedNote.backlinks?.map((l: any) => (
                    <button key={l.id} onClick={() => openNote(l.id)} className="text-sm text-green-400 hover:underline block">← {l.title}</button>
                  ))}
                </div>
              )}

              <button onClick={suggestLinks} disabled={loading} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 disabled:opacity-50">
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Suggest Links
              </button>
              {suggestions.length > 0 && (
                <div className="space-y-1">{suggestions.map((s: any, i: number) => (
                  <div key={i} className="bg-dark-700/50 rounded-lg p-2 text-xs"><span className="text-brand-blue">Note #{s.id}</span>: {s.reason}</div>
                ))}</div>
              )}
            </div>
          )}

          {!selectedNote && !showCreate && !showGen && (
            <div className="text-center py-16"><Notebook size={48} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500">Select a note or create a new one</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
