import { useState, useRef } from "react";
import {
  FlaskConical, Upload, BarChart3, LineChart, Brain,
  Loader2, FileSpreadsheet, Sparkles, ChevronRight,
  PieChart, ScatterChart, TableProperties, X,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, apiFetch } from "../utils/api";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface ColInfo { name: string; type: string; dtype: string; missing: number; unique: number; }

export default function DataLab() {
  const [tab, setTab] = useState<"upload"|"explore"|"visualize"|"analyze"|"ml">("upload");
  const [uploading, setUploading] = useState(false);
  const [dataset, setDataset] = useState<{ filename: string; rows: number; columns: ColInfo[]; preview: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [corrChart, setCorrChart] = useState("");
  const [chartImg, setChartImg] = useState("");
  const [statsResult, setStatsResult] = useState<any>(null);
  const [mlResult, setMlResult] = useState<any>(null);
  const [interpretation, setInterpretation] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Viz state
  const [chartType, setChartType] = useState("histogram");
  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");

  // Stats state
  const [testType, setTestType] = useState("ttest");
  const [testCols, setTestCols] = useState<string[]>([]);
  const [groupCol, setGroupCol] = useState("");

  // ML state
  const [mlTask, setMlTask] = useState("classify");
  const [targetCol, setTargetCol] = useState("");
  const [mlModel, setMlModel] = useState("random_forest");
  const [nClusters, setNClusters] = useState(3);

  const numericCols = dataset?.columns.filter(c => c.type === "numeric").map(c => c.name) || [];
  const catCols = dataset?.columns.filter(c => c.type === "categorical").map(c => c.name) || [];
  const allCols = dataset?.columns.map(c => c.name) || [];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch(`${API_BASE}/api/datalab/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Upload failed"); }
      const data = await res.json();
      setDataset(data);
      if (data.columns?.length) { setXCol(data.columns[0].name); if (data.columns.length > 1) setYCol(data.columns[1].name); }
      toast.success(`${data.filename} loaded — ${data.rows} rows, ${data.columns.length} columns`);
      setTab("explore");
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const loadSummary = async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([apiFetch("/api/datalab/summary"), apiFetch("/api/datalab/correlations").catch(() => null)]);
      setSummary(s);
      if (c?.chart) setCorrChart(c.chart);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const generateChart = async () => {
    setLoading(true);
    try {
      const res = await apiPost("/api/datalab/visualize", { chart_type: chartType, x_column: xCol, y_column: yCol });
      setChartImg(res.chart);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const runTest = async () => {
    setLoading(true);
    try {
      const res = await apiPost("/api/datalab/stats-test", { test: testType, columns: testCols, group_column: groupCol });
      setStatsResult(res);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const runML = async () => {
    setLoading(true);
    try {
      const res = await apiPost("/api/datalab/ml", { task: mlTask, target_column: targetCol, model_type: mlModel, n_clusters: nClusters });
      setMlResult(res);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const interpret = async (context: string, results: any) => {
    setInterpreting(true);
    try {
      const res = await apiPost("/api/datalab/interpret", { context, results, provider: "deepseek" });
      setInterpretation(res.interpretation);
    } catch { toast.error("Interpretation failed"); }
    finally { setInterpreting(false); }
  };

  const tabs = [
    { id: "upload", label: "Upload", icon: Upload },
    { id: "explore", label: "Explore", icon: TableProperties },
    { id: "visualize", label: "Visualize", icon: BarChart3 },
    { id: "analyze", label: "Analyze", icon: LineChart },
    { id: "ml", label: "ML", icon: Brain },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-dark-500/30 bg-dark-800/50 px-6 py-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FlaskConical size={22} className="text-brand-orange" /> iKo DataLab
        </h1>
        <p className="text-sm text-gray-400 mt-1">Upload data, explore, analyze, visualize, and train ML models</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-dark-500/30">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { if (t.id === "explore" && !summary) loadSummary(); setTab(t.id as any); }}
            disabled={t.id !== "upload" && !dataset}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-brand-orange text-brand-orange" : "border-transparent text-gray-500 hover:text-gray-300"} disabled:opacity-30 disabled:cursor-not-allowed`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">

          {/* UPLOAD */}
          {tab === "upload" && (
            <div className="space-y-6">
              <div className="bg-dark-800 rounded-xl border-2 border-dashed border-dark-500 p-12 text-center hover:border-brand-orange/50 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.xlsx,.xls" onChange={handleUpload} className="hidden" />
                {uploading ? <Loader2 size={48} className="mx-auto animate-spin text-brand-orange mb-4" /> : <FileSpreadsheet size={48} className="mx-auto text-gray-600 mb-4" />}
                <h3 className="text-lg font-semibold text-white mb-2">{uploading ? "Processing..." : "Upload Your Dataset"}</h3>
                <p className="text-sm text-gray-400">CSV, TSV, or Excel (.xlsx) — up to 50 MB</p>
              </div>

              {dataset && (
                <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white flex items-center gap-2"><FileSpreadsheet size={16} className="text-brand-orange" /> {dataset.filename}</h3>
                    <span className="text-xs text-gray-500">{dataset.rows} rows × {dataset.columns.length} columns</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    {dataset.columns.map(c => (
                      <div key={c.name} className="bg-dark-700 rounded-lg px-3 py-2">
                        <p className="text-xs text-white font-medium truncate">{c.name}</p>
                        <p className="text-[10px] text-gray-500">{c.type} • {c.missing} missing</p>
                      </div>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-gray-300">
                      <thead><tr className="border-b border-dark-500">{allCols.map(c => <th key={c} className="px-2 py-1 text-left text-gray-500 font-medium">{c}</th>)}</tr></thead>
                      <tbody>{dataset.preview.slice(0, 5).map((row, i) => <tr key={i} className="border-b border-dark-500/30">{allCols.map(c => <td key={c} className="px-2 py-1 truncate max-w-[120px]">{String(row[c] ?? "")}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                  <button onClick={() => { loadSummary(); setTab("explore"); }} className="mt-4 flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-medium">
                    Explore Data <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* EXPLORE */}
          {tab === "explore" && (
            <div className="space-y-6">
              {loading && !summary && <div className="text-center py-12"><Loader2 size={32} className="animate-spin mx-auto text-brand-orange" /></div>}
              {summary && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-dark-800 rounded-xl p-4 border border-dark-500/30 text-center">
                      <p className="text-2xl font-bold text-white">{summary.shape.rows}</p><p className="text-xs text-gray-500">Rows</p>
                    </div>
                    <div className="bg-dark-800 rounded-xl p-4 border border-dark-500/30 text-center">
                      <p className="text-2xl font-bold text-white">{summary.shape.columns}</p><p className="text-xs text-gray-500">Columns</p>
                    </div>
                    <div className="bg-dark-800 rounded-xl p-4 border border-dark-500/30 text-center">
                      <p className="text-2xl font-bold text-yellow-400">{summary.missing_total}</p><p className="text-xs text-gray-500">Missing Values</p>
                    </div>
                    <div className="bg-dark-800 rounded-xl p-4 border border-dark-500/30 text-center">
                      <p className="text-2xl font-bold text-brand-blue">{summary.numeric_columns.length}</p><p className="text-xs text-gray-500">Numeric Cols</p>
                    </div>
                  </div>

                  {summary.numeric_stats && (
                    <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                      <h3 className="text-sm font-semibold text-gray-300 mb-3">Descriptive Statistics</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-gray-300">
                          <thead><tr className="border-b border-dark-500"><th className="px-2 py-1 text-left text-gray-500">Stat</th>
                            {Object.keys(summary.numeric_stats).map(col => <th key={col} className="px-2 py-1 text-left text-gray-500">{col}</th>)}</tr></thead>
                          <tbody>{["count", "mean", "std", "min", "25%", "50%", "75%", "max"].map(stat => (
                            <tr key={stat} className="border-b border-dark-500/20"><td className="px-2 py-1 font-medium text-gray-400">{stat}</td>
                              {Object.keys(summary.numeric_stats).map(col => <td key={col} className="px-2 py-1">{summary.numeric_stats[col]?.[stat] != null ? Number(summary.numeric_stats[col][stat]).toFixed(2) : "-"}</td>)}</tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {corrChart && (
                    <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                      <h3 className="text-sm font-semibold text-gray-300 mb-3">Correlation Matrix</h3>
                      <img src={`data:image/png;base64,${corrChart}`} alt="Correlation" className="w-full max-w-2xl mx-auto rounded" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* VISUALIZE */}
          {tab === "visualize" && (
            <div className="space-y-6">
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Chart Type</label>
                    <select value={chartType} onChange={e => setChartType(e.target.value)} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="histogram">Histogram</option><option value="scatter">Scatter</option><option value="bar">Bar</option>
                      <option value="box">Box Plot</option><option value="line">Line</option><option value="pie">Pie</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">X Column</label>
                    <select value={xCol} onChange={e => setXCol(e.target.value)} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      {allCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Y Column</label>
                    <select value={yCol} onChange={e => setYCol(e.target.value)} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="">None</option>{allCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={generateChart} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />} Generate
                    </button>
                  </div>
                </div>
              </div>
              {chartImg && (
                <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                  <img src={`data:image/png;base64,${chartImg}`} alt="Chart" className="w-full max-w-3xl mx-auto rounded" />
                </div>
              )}
            </div>
          )}

          {/* ANALYZE */}
          {tab === "analyze" && (
            <div className="space-y-6">
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Statistical Tests</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Test</label>
                    <select value={testType} onChange={e => setTestType(e.target.value)} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="ttest">T-Test</option><option value="anova">ANOVA</option><option value="chi_square">Chi-Square</option>
                      <option value="correlation_test">Correlation</option><option value="normality">Normality</option><option value="mannwhitney">Mann-Whitney U</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Column(s)</label>
                    <select value={testCols[0] || ""} onChange={e => setTestCols(e.target.value ? [e.target.value, ...(testCols[1] ? [testCols[1]] : [])] : [])} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="">Select...</option>{numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{["correlation_test", "chi_square"].includes(testType) ? "2nd Column" : "Group Column"}</label>
                    <select value={["correlation_test", "chi_square"].includes(testType) ? (testCols[1] || "") : groupCol}
                      onChange={e => ["correlation_test", "chi_square"].includes(testType) ? setTestCols([testCols[0] || "", e.target.value]) : setGroupCol(e.target.value)}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="">Select...</option>{(["correlation_test"].includes(testType) ? numericCols : allCols).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={runTest} disabled={loading || !testCols.length} className="w-full flex items-center justify-center gap-2 bg-brand-blue hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <LineChart size={14} />} Run Test
                    </button>
                  </div>
                </div>
              </div>
              {statsResult && (
                <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300">Results: {statsResult.test.replace("_", " ").toUpperCase()}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(statsResult).filter(([k]) => !["test", "columns", "group_column"].includes(k)).map(([k, v]) => (
                      <div key={k} className="bg-dark-700 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-gray-500">{k.replace(/_/g, " ")}</p>
                        <p className={`text-sm font-semibold ${k === "significant" ? (v ? "text-green-400" : "text-red-400") : k === "p_value" || k.includes("_p") ? ((v as number) < 0.05 ? "text-green-400" : "text-yellow-400") : "text-white"}`}>
                          {typeof v === "boolean" ? (v ? "Yes (p < 0.05)" : "No (p ≥ 0.05)") : typeof v === "number" ? v.toFixed ? v.toFixed(4) : v : String(v)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => interpret(`Statistical test: ${statsResult.test}`, statsResult)} disabled={interpreting}
                    className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-white px-4 py-2 rounded-lg text-sm border border-dark-500/30 disabled:opacity-50">
                    {interpreting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Interpret with AI
                  </button>
                  {interpretation && <div className="bg-dark-700/50 rounded-lg p-4 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{interpretation}</div>}
                </div>
              )}
            </div>
          )}

          {/* ML */}
          {tab === "ml" && (
            <div className="space-y-6">
              <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Machine Learning</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Task</label>
                    <select value={mlTask} onChange={e => setMlTask(e.target.value)} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="classify">Classification</option><option value="regress">Regression</option>
                      <option value="cluster">Clustering</option><option value="pca">PCA</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{mlTask === "cluster" ? "Clusters" : "Target Column"}</label>
                    {mlTask === "cluster" ? (
                      <input type="number" value={nClusters} onChange={e => setNClusters(parseInt(e.target.value) || 3)} min={2} max={20}
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                    ) : mlTask === "pca" ? (
                      <span className="text-xs text-gray-500 block py-2">Auto-detect</span>
                    ) : (
                      <select value={targetCol} onChange={e => setTargetCol(e.target.value)} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                        <option value="">Select...</option>{allCols.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Model</label>
                    <select value={mlModel} onChange={e => setMlModel(e.target.value)} className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                      <option value="random_forest">Random Forest</option>
                      <option value="linear">{mlTask === "classify" ? "Logistic Regression" : "Linear Regression"}</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={runML} disabled={loading || (["classify", "regress"].includes(mlTask) && !targetCol)}
                      className="w-full flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />} Train Model
                    </button>
                  </div>
                </div>
              </div>
              {mlResult && (
                <div className="bg-dark-800 rounded-xl p-5 border border-dark-500/30 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">Results: {mlResult.task.toUpperCase()}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(mlResult).filter(([k]) => !["task", "features", "chart", "feature_importances", "loadings", "classes", "cluster_sizes", "explained_variance"].includes(k)).map(([k, v]) => (
                      <div key={k} className="bg-dark-700 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-gray-500">{k.replace(/_/g, " ")}</p>
                        <p className="text-sm font-semibold text-white">{typeof v === "number" ? (v as number).toFixed(4) : String(v)}</p>
                      </div>
                    ))}
                  </div>
                  {mlResult.chart && <img src={`data:image/png;base64,${mlResult.chart}`} alt="ML Result" className="w-full max-w-2xl mx-auto rounded" />}
                  {mlResult.feature_importances && (
                    <div><p className="text-xs text-gray-400 mb-2">Feature Importances</p>
                      <div className="space-y-1">{Object.entries(mlResult.feature_importances).slice(0, 10).map(([f, v]) => (
                        <div key={f} className="flex items-center gap-2"><span className="text-xs text-gray-300 w-32 truncate">{f}</span>
                          <div className="flex-1 h-2 bg-dark-700 rounded-full"><div className="h-full bg-brand-orange rounded-full" style={{ width: `${(v as number) * 100}%` }} /></div>
                          <span className="text-xs text-gray-500 w-12 text-right">{((v as number) * 100).toFixed(1)}%</span></div>
                      ))}</div>
                    </div>
                  )}
                  <button onClick={() => interpret(`ML task: ${mlResult.task}, model: ${mlResult.model || "auto"}`, mlResult)} disabled={interpreting}
                    className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-white px-4 py-2 rounded-lg text-sm border border-dark-500/30 disabled:opacity-50">
                    {interpreting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Interpret with AI
                  </button>
                  {interpretation && <div className="bg-dark-700/50 rounded-lg p-4 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{interpretation}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
