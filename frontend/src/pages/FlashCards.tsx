import { useState, useEffect } from "react";
import { BookOpen, Plus, RotateCcw, ChevronRight, Loader2, Brain, Sparkles, Check, X, Layers } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, apiFetch } from "../utils/api";

interface Card { id: number; front: string; back: string; deck: string; repetitions: number; interval: number; ease_factor: number; }
interface Deck { name: string; total_cards: number; due_cards: number; }

export default function FlashCards() {
  const [view, setView] = useState<"decks"|"review"|"generate">("decks");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [genText, setGenText] = useState("");
  const [genDeck, setGenDeck] = useState("General");
  const [genType, setGenType] = useState("concept");
  const [genCount, setGenCount] = useState(10);
  const [provider, setProvider] = useState("deepseek");
  const [reviewDeck, setReviewDeck] = useState("");
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });

  useEffect(() => { loadDecks(); }, []);

  const loadDecks = async () => {
    try { const res = await apiFetch("/api/flashcards/decks"); setDecks(res.decks || []); }
    catch { toast.error("Failed to load decks"); }
  };

  const startReview = async (deck: string) => {
    setLoading(true); setReviewDeck(deck); setSessionStats({ reviewed: 0, correct: 0 });
    try {
      const res = await apiFetch(`/api/flashcards/review?deck=${encodeURIComponent(deck)}&limit=20`);
      setCards(res.cards || []); setCardIdx(0); setFlipped(false); setView("review");
      if (!res.cards?.length) toast("No cards due for review!", { icon: "✓" });
    } catch { toast.error("Failed to load cards"); }
    finally { setLoading(false); }
  };

  const submitReview = async (quality: number) => {
    const card = cards[cardIdx];
    try { await apiPost("/api/flashcards/review", { card_id: card.id, quality }); }
    catch { toast.error("Review failed"); }
    setSessionStats(prev => ({ reviewed: prev.reviewed + 1, correct: prev.correct + (quality >= 3 ? 1 : 0) }));
    if (cardIdx + 1 < cards.length) { setCardIdx(cardIdx + 1); setFlipped(false); }
    else { toast.success(`Session complete! ${sessionStats.reviewed + 1} cards reviewed`); setView("decks"); loadDecks(); }
  };

  const handleGenerate = async () => {
    if (!genText.trim()) return toast.error("Paste some text first");
    setLoading(true);
    try {
      const res = await apiPost("/api/flashcards/generate", { text: genText, deck: genDeck, count: genCount, card_type: genType, provider });
      toast.success(`${res.cards_created} flashcards created!`);
      setGenText(""); loadDecks(); setView("decks");
    } catch (err: any) { toast.error(err.message || "Generation failed"); }
    finally { setLoading(false); }
  };

  const current = cards[cardIdx];

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-dark-500/30 bg-dark-800/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain size={22} className="text-brand-orange" />
            <div><h1 className="text-xl font-bold text-white">iKo FlashCards</h1>
              <p className="text-xs text-gray-400">Spaced repetition study system</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView("decks")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === "decks" ? "bg-brand-orange text-white" : "bg-dark-700 text-gray-400"}`}><Layers size={12} className="inline mr-1" />Decks</button>
            <button onClick={() => setView("generate")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === "generate" ? "bg-brand-orange text-white" : "bg-dark-700 text-gray-400"}`}><Plus size={12} className="inline mr-1" />Generate</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">

          {view === "decks" && (
            <div className="space-y-4">
              {decks.length === 0 && !loading && (
                <div className="text-center py-16"><BookOpen size={48} className="mx-auto text-gray-700 mb-3" />
                  <p className="text-gray-500">No flashcards yet. Generate some from your study material!</p>
                  <button onClick={() => setView("generate")} className="mt-4 bg-brand-orange hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-medium"><Plus size={14} className="inline mr-1" />Generate Cards</button>
                </div>
              )}
              {decks.map(d => (
                <div key={d.name} className="bg-dark-800 rounded-xl p-5 border border-dark-500/30 flex items-center justify-between">
                  <div><h3 className="font-semibold text-white">{d.name}</h3>
                    <p className="text-xs text-gray-500">{d.total_cards} cards • {d.due_cards} due for review</p></div>
                  <button onClick={() => startReview(d.name)} disabled={d.due_cards === 0}
                    className="flex items-center gap-1.5 bg-brand-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-30">
                    <RotateCcw size={14} /> Review ({d.due_cards})
                  </button>
                </div>
              ))}
            </div>
          )}

          {view === "review" && current && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{reviewDeck} — Card {cardIdx + 1}/{cards.length}</span>
                <span className="text-xs text-gray-500">Correct: {sessionStats.correct}/{sessionStats.reviewed}</span>
              </div>
              <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                <div className="h-full bg-brand-orange transition-all" style={{ width: `${((cardIdx + 1) / cards.length) * 100}%` }} />
              </div>

              <div onClick={() => setFlipped(!flipped)}
                className="bg-dark-800 rounded-xl p-8 border-2 border-dark-500/30 min-h-[250px] flex items-center justify-center cursor-pointer hover:border-brand-orange/30 transition-colors">
                <div className="text-center">
                  <p className="text-[10px] text-gray-600 mb-3">{flipped ? "ANSWER" : "QUESTION"}</p>
                  <p className="text-lg text-white leading-relaxed">{flipped ? current.back : current.front}</p>
                  {!flipped && <p className="text-xs text-gray-600 mt-4">Tap to reveal answer</p>}
                </div>
              </div>

              {flipped && (
                <div className="flex justify-center gap-3">
                  <button onClick={() => submitReview(1)} className="flex flex-col items-center gap-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-5 py-3 rounded-xl border border-red-500/30">
                    <X size={20} /><span className="text-[10px]">Forgot</span></button>
                  <button onClick={() => submitReview(3)} className="flex flex-col items-center gap-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 px-5 py-3 rounded-xl border border-yellow-500/30">
                    <RotateCcw size={20} /><span className="text-[10px]">Hard</span></button>
                  <button onClick={() => submitReview(4)} className="flex flex-col items-center gap-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-5 py-3 rounded-xl border border-blue-500/30">
                    <Check size={20} /><span className="text-[10px]">Good</span></button>
                  <button onClick={() => submitReview(5)} className="flex flex-col items-center gap-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-5 py-3 rounded-xl border border-green-500/30">
                    <Sparkles size={20} /><span className="text-[10px]">Easy</span></button>
                </div>
              )}
            </div>
          )}

          {view === "generate" && (
            <div className="space-y-4">
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30 space-y-4">
                <h2 className="font-semibold text-white">Generate Flashcards from Text</h2>
                <textarea value={genText} onChange={e => setGenText(e.target.value)} rows={6}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y"
                  placeholder="Paste paper abstract, lecture notes, thesis chapter, or any study material..." />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className="text-xs text-gray-400 block mb-1">Deck</label>
                    <input value={genDeck} onChange={e => setGenDeck(e.target.value)}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" /></div>
                  <div><label className="text-xs text-gray-400 block mb-1">Card Type</label>
                    <select value={genType} onChange={e => setGenType(e.target.value)}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="concept">Concepts</option><option value="definition">Definitions</option>
                      <option value="methodology">Methodology</option><option value="defense_prep">Defense Prep</option>
                    </select></div>
                  <div><label className="text-xs text-gray-400 block mb-1">Count</label>
                    <input type="number" value={genCount} onChange={e => setGenCount(parseInt(e.target.value) || 10)} min={1} max={30}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" /></div>
                  <div><label className="text-xs text-gray-400 block mb-1">LLM</label>
                    <select value={provider} onChange={e => setProvider(e.target.value)}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="deepseek">DeepSeek</option><option value="claude">Claude</option>
                      <option value="gpt4o">GPT-4o</option><option value="gemini">Gemini</option>
                    </select></div>
                </div>
                <button onClick={handleGenerate} disabled={loading || !genText.trim()}
                  className="flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg font-medium disabled:opacity-50">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {loading ? "Generating..." : "Generate Cards"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
