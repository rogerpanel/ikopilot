import { useState } from "react";
import { Calculator, Sparkles, Loader2, BookOpen, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, apiFetch } from "../utils/api";

export default function MathLab() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("auto");
  const [provider, setProvider] = useState("deepseek");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [formulaView, setFormulaView] = useState(false);
  const [formulas, setFormulas] = useState<any>(null);
  const [lookupTopic, setLookupTopic] = useState("");
  const [lookupResult, setLookupResult] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  const handleSolve = async () => {
    if (!query.trim()) return toast.error("Enter a math problem");
    setLoading(true); setResult(null);
    try {
      const res = await apiPost("/api/mathlab/solve", { query, mode, provider });
      setResult(res);
    } catch (err: any) { toast.error(err.message || "Solve failed"); }
    finally { setLoading(false); }
  };

  const loadFormulas = async () => {
    try { const res = await apiFetch("/api/mathlab/formulas"); setFormulas(res.formulas); setFormulaView(true); }
    catch { toast.error("Failed to load formulas"); }
  };

  const handleLookup = async () => {
    if (!lookupTopic.trim()) return;
    setLookupLoading(true);
    try { const res = await apiPost("/api/mathlab/formula-lookup", { topic: lookupTopic }); setLookupResult(res.content); }
    catch { toast.error("Lookup failed"); }
    finally { setLookupLoading(false); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-dark-500/30 bg-dark-800/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calculator size={22} className="text-brand-orange" />
            <div><h1 className="text-xl font-bold text-white">iKo MathLab</h1>
              <p className="text-xs text-gray-400">Equations, calculus, statistics — step-by-step solutions</p></div>
          </div>
          <button onClick={loadFormulas} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${formulaView ? "bg-brand-orange text-white" : "bg-dark-700 text-gray-400"}`}>
            <BookOpen size={12} className="inline mr-1" /> Formula Reference
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Input */}
          <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30 space-y-4">
            <textarea value={query} onChange={e => setQuery(e.target.value)} rows={3}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-y font-mono"
              placeholder="e.g. solve x^2 + 3x - 4 = 0&#10;e.g. derivative of x^3 * sin(x)&#10;e.g. integrate 1/(1+x^2) dx&#10;e.g. what is the sample size formula for 95% CI?" />
            <div className="flex items-center gap-3 flex-wrap">
              <select value={mode} onChange={e => setMode(e.target.value)}
                className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="auto">Auto-detect</option><option value="solve">Solve Equation</option>
                <option value="differentiate">Differentiate</option><option value="integrate">Integrate</option>
                <option value="simplify">Simplify</option>
              </select>
              <select value={provider} onChange={e => setProvider(e.target.value)}
                className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="deepseek">DeepSeek</option><option value="claude">Claude</option>
                <option value="gpt4o">GPT-4o</option><option value="gemini">Gemini</option>
              </select>
              <button onClick={handleSolve} disabled={loading || !query.trim()}
                className="flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? "Solving..." : "Solve"}
              </button>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-500/30 space-y-4">
              {result.computed && (
                <div className="bg-dark-700/50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-2">SymPy Result</p>
                  {result.steps?.map((s: string, i: number) => (
                    <p key={i} className="text-sm text-gray-200 font-mono">{s}</p>
                  ))}
                </div>
              )}
              {result.explanation && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Step-by-Step Explanation</p>
                  <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{result.explanation}</div>
                </div>
              )}
            </div>
          )}

          {/* Formula Lookup */}
          {formulaView && (
            <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30 space-y-4">
              <h3 className="font-semibold text-white">Formula Lookup</h3>
              <div className="flex gap-2">
                <input value={lookupTopic} onChange={e => setLookupTopic(e.target.value)}
                  className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none"
                  placeholder="e.g. sample size calculation, ANOVA assumptions, confidence interval" />
                <button onClick={handleLookup} disabled={lookupLoading}
                  className="bg-brand-blue hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                  {lookupLoading ? <Loader2 size={14} className="animate-spin" /> : "Look Up"}
                </button>
              </div>
              {lookupResult && <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap bg-dark-700/50 rounded-lg p-4">{lookupResult}</div>}

              {formulas && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Common Statistical Formulas</p>
                  {Object.values(formulas).map((f: any, i: number) => (
                    <div key={i} className="bg-dark-700/30 rounded-lg p-3 border border-dark-500/20">
                      <p className="text-sm font-medium text-white">{f.name}</p>
                      <p className="text-xs text-brand-orange font-mono mt-1">{f.latex}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {Object.entries(f.variables || {}).map(([k, v]) => (
                          <span key={k} className="text-[10px] text-gray-500">{k} = {v as string}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
