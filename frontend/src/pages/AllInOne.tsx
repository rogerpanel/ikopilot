import { useState, useEffect, useRef } from "react";
import {
  Target,
  BookOpen,
  FlaskConical,
  BarChart3,
  MessageSquare,
  FileText,
  Quote,
  PenTool,
  ChevronRight,
  CheckCircle,
  Loader2,
  Sparkles,
  Download,
  ArrowLeft,
  Lock,
  Zap,
  Paperclip,
  Upload,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { apiFetch, apiPost } from "../utils/api";
import { getStoredUser } from "../utils/auth";
import Logo from "../components/Logo";

interface StageConfig {
  id: string;
  name: string;
  description: string;
  llm: string;
  icon: string;
  user_inputs: {
    id: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
  }[];
}

interface Session {
  id: string;
  title: string;
  current_stage: string;
  stages_completed: string[];
  stage_outputs: Record<string, string>;
  created_at: string;
}

const ICONS: Record<string, any> = {
  Target,
  BookOpen,
  FlaskConical,
  BarChart3,
  MessageSquare,
  FileText,
  Quote,
  PenTool,
};

const LLM_LABELS: Record<string, { name: string; color: string }> = {
  claude: { name: "Claude", color: "text-orange-400" },
  gpt4o: { name: "GPT-4o", color: "text-green-400" },
  gemini: { name: "Gemini", color: "text-blue-400" },
  deepseek: { name: "DeepSeek", color: "text-purple-400" },
};

const STAGE_DECISIONS: Record<
  string,
  { id: string; label: string; action: "proceed" | "revise" | "redirect" }[]
> = {
  topic: [
    { id: "proceed", label: "Proceed as is", action: "proceed" },
    { id: "narrow", label: "Narrow the question further", action: "revise" },
    { id: "change", label: "Change direction entirely", action: "redirect" },
  ],
  methodology: [
    { id: "approve", label: "Approve methodology", action: "proceed" },
    { id: "modify", label: "Modify sampling/instruments", action: "revise" },
    { id: "different", label: "Try different approach", action: "redirect" },
  ],
  data_analysis: [
    { id: "proceed", label: "Proceed to discussion", action: "proceed" },
    { id: "additional", label: "Run additional tests", action: "revise" },
    { id: "upload_data", label: "Upload actual data for re-analysis", action: "redirect" },
  ],
  conclusion: [
    { id: "proceed", label: "Proceed to references", action: "proceed" },
    { id: "revise_prev", label: "Revise a previous chapter", action: "revise" },
    { id: "humanize", label: "Run humanizer on completed sections", action: "redirect" },
  ],
};

export default function AllInOne() {
  const user = getStoredUser();
  const navigate = useNavigate();
  const isPremium = ["pro", "lab_group"].includes(user?.subscription_tier || "");
  const [stages, setStages] = useState<StageConfig[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [stageInputs, setStageInputs] = useState<Record<string, string>>({});
  const [stageOutput, setStageOutput] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; extracted_text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch("/api/orchestrator/stages").then(setStages).catch(() => {});
    apiFetch("/api/orchestrator/sessions").then(setSessions).catch(() => {});
  }, []);

  const startNewSession = async () => {
    try {
      const s = await apiPost("/api/orchestrator/sessions/start", { title: "" });
      setSession(s);
      setActiveStageIdx(0);
      setStageOutput("");
      setStageInputs({});
      setShowOutput(false);
      setUploadedFile(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const loadSession = async (id: string) => {
    try {
      const s = await apiFetch(`/api/orchestrator/sessions/${id}`);
      setSession(s);
      const completedCount = s.stages_completed.length;
      setActiveStageIdx(Math.min(completedCount, stages.length - 1));
      if (completedCount > 0) {
        const lastCompleted = s.stages_completed[completedCount - 1];
        setStageOutput(s.stage_outputs?.[lastCompleted] || "");
        setShowOutput(true);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const executeStage = async () => {
    if (!session || !stages[activeStageIdx]) return;

    const stage = stages[activeStageIdx];

    // Validate required fields
    for (const field of stage.user_inputs) {
      if (field.required && !stageInputs[field.id]?.trim()) {
        toast.error(`Please fill in: ${field.label}`);
        return;
      }
    }

    setProcessing(true);
    setStageOutput("");
    setShowOutput(true);

    try {
      const inputs = { ...stageInputs };
      if (uploadedFile?.extracted_text) {
        inputs._attached_file_text = uploadedFile.extracted_text;
      }

      const result = await apiPost(`/api/orchestrator/sessions/${session.id}/execute`, {
        session_id: session.id,
        stage_id: stage.id,
        inputs,
      });

      setStageOutput(result.output);
      setSession(result.session);
      toast.success(`${stage.name} completed using ${LLM_LABELS[result.llm_used]?.name || result.llm_used}`);
    } catch (err: any) {
      toast.error(err.message || "Stage execution failed");
      setShowOutput(false);
    } finally {
      setProcessing(false);
    }
  };

  const goToNextStage = () => {
    if (activeStageIdx < stages.length - 1) {
      setActiveStageIdx(activeStageIdx + 1);
      setStageInputs({});
      setStageOutput("");
      setShowOutput(false);
      setUploadedFile(null);
    }
  };

  const goToPrevStage = () => {
    if (activeStageIdx > 0) {
      setActiveStageIdx(activeStageIdx - 1);
      const prevStageId = stages[activeStageIdx - 1]?.id;
      if (prevStageId && session?.stage_outputs?.[prevStageId]) {
        setStageOutput(session.stage_outputs[prevStageId]);
        setShowOutput(true);
      } else {
        setStageOutput("");
        setShowOutput(false);
      }
      setStageInputs({});
    }
  };

  const handleExport = async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/orchestrator/sessions/${session.id}/export?format=md`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("ikopilot_token")}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.title || "research"}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Document exported");
    } catch {
      toast.error("Export failed");
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch("/api/files/chat-upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(body.detail);
      }
      const data = await res.json();
      setUploadedFile({ name: data.name || file.name, extracted_text: data.extracted_text || "" });
      toast.success(`Attached ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDecision = (action: "proceed" | "revise" | "redirect") => {
    if (action === "proceed") {
      goToNextStage();
    } else {
      // revise or redirect — re-open input form for current stage
      setShowOutput(false);
      setStageInputs({});
    }
  };

  // Gate for non-premium users
  if (!isPremium) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-md">
          <Lock size={48} className="mx-auto text-gray-600 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">iKo-All-in-One</h2>
          <p className="text-gray-400 mb-4">
            The complete research paper pipeline — from topic to submission-ready
            document — requires a Pro or Lab Group plan.
          </p>
          <a
            href="/billing"
            className="inline-flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg transition-colors"
          >
            <Zap size={16} />
            Upgrade Now
          </a>
        </div>
      </div>
    );
  }

  // No active session — show start screen
  if (!session) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Sparkles size={28} className="text-brand-orange" />
            <h1 className="text-2xl font-bold text-white">iKo-All-in-One</h1>
          </div>
          <p className="text-gray-400">
            Complete research paper pipeline — from topic to polished document
          </p>
        </div>

        {/* Pipeline preview */}
        <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-6 mb-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">
            The AI guides you through 8 stages:
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stages.map((stage, i) => {
              const Icon = ICONS[stage.icon] || FileText;
              const llm = LLM_LABELS[stage.llm];
              return (
                <div
                  key={stage.id}
                  className="bg-dark-700/50 border border-dark-500/20 rounded-lg p-3 text-center"
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <span className="text-[10px] text-gray-600 font-bold">{i + 1}</span>
                    <Icon size={16} className="text-gray-400" />
                  </div>
                  <p className="text-xs font-medium text-white">{stage.name}</p>
                  <p className={`text-[10px] mt-0.5 ${llm?.color || "text-gray-500"}`}>
                    {llm?.name || stage.llm}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={startNewSession}
          className="w-full bg-brand-orange hover:bg-orange-600 text-white py-3 rounded-xl font-medium text-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Sparkles size={20} />
          Start New Research Project
        </button>

        {/* Previous sessions */}
        {sessions.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Continue a project:</h3>
            <div className="space-y-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className="w-full text-left bg-dark-800 border border-dark-500/30 rounded-lg px-4 py-3 hover:border-dark-400/50 transition-colors"
                >
                  <p className="text-sm font-medium text-white">{s.title || "Untitled"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.stages_completed.length}/{stages.length} stages · Started{" "}
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active session — show pipeline
  const currentStage = stages[activeStageIdx];
  const isCompleted = session.stages_completed.includes(currentStage?.id);
  const StageIcon = ICONS[currentStage?.icon] || FileText;
  const stageLlm = LLM_LABELS[currentStage?.llm];

  return (
    <div className="flex h-full">
      {/* Stage progress sidebar */}
      <div className="hidden lg:flex w-56 border-r border-dark-500/30 flex-col bg-dark-800/50">
        <div className="p-3 border-b border-dark-500/30">
          <p className="text-xs font-medium text-gray-400 truncate">{session.title || "Research Project"}</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {stages.map((stage, i) => {
            const Icon = ICONS[stage.icon] || FileText;
            const completed = session.stages_completed.includes(stage.id);
            const active = i === activeStageIdx;
            return (
              <button
                key={stage.id}
                onClick={() => {
                  setActiveStageIdx(i);
                  if (session.stage_outputs?.[stage.id]) {
                    setStageOutput(session.stage_outputs[stage.id]);
                    setShowOutput(true);
                  } else {
                    setStageOutput("");
                    setShowOutput(false);
                  }
                  setStageInputs({});
                }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors ${
                  active
                    ? "bg-brand-orange/10 text-brand-orange border-l-2 border-l-brand-orange"
                    : completed
                    ? "text-green-400 hover:bg-dark-700"
                    : "text-gray-500 hover:bg-dark-700"
                }`}
              >
                {completed ? (
                  <CheckCircle size={14} className="flex-shrink-0" />
                ) : (
                  <Icon size={14} className="flex-shrink-0" />
                )}
                <span className="truncate">{stage.name}</span>
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t border-dark-500/30">
          <button
            onClick={handleExport}
            disabled={session.stages_completed.length === 0}
            className="w-full flex items-center justify-center gap-1 text-xs bg-dark-700 hover:bg-dark-600 text-white py-2 rounded-lg disabled:opacity-50"
          >
            <Download size={12} />
            Export Document
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Stage header */}
        <div className="px-4 sm:px-6 py-4 border-b border-dark-500/30 bg-dark-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                Stage {activeStageIdx + 1}/{stages.length}
              </span>
              <StageIcon size={20} className="text-brand-orange" />
              <div>
                <h2 className="font-semibold text-white">{currentStage?.name}</h2>
                <p className="text-xs text-gray-400">{currentStage?.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${stageLlm?.color || "text-gray-400"}`}>
                Powered by {stageLlm?.name || currentStage?.llm}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex gap-1 mt-3">
            {stages.map((s, i) => (
              <div
                key={s.id}
                className={`h-1 flex-1 rounded-full ${
                  session.stages_completed.includes(s.id)
                    ? "bg-green-500"
                    : i === activeStageIdx
                    ? "bg-brand-orange"
                    : "bg-dark-600"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Stage content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {showOutput && stageOutput ? (
            /* Output view */
            <div>
              <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={16} className="text-green-400" />
                  <span className="text-sm font-medium text-green-400">
                    {currentStage?.name} — Output
                  </span>
                </div>
                <div className="prose-chat text-sm text-gray-200 leading-relaxed">
                  <ReactMarkdown>{stageOutput}</ReactMarkdown>
                </div>
              </div>

              {/* Decision checkpoint */}
              {STAGE_DECISIONS[currentStage?.id] && (
                <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-5 mb-4">
                  <p className="text-sm font-medium text-gray-300 mb-3">
                    How would you like to proceed?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {STAGE_DECISIONS[currentStage.id].map((decision) => (
                      <button
                        key={decision.id}
                        onClick={() => handleDecision(decision.action)}
                        className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
                          decision.action === "proceed"
                            ? "bg-brand-orange/10 border-brand-orange/40 text-brand-orange hover:bg-brand-orange/20"
                            : decision.action === "revise"
                            ? "bg-blue-500/10 border-blue-500/40 text-blue-400 hover:bg-blue-500/20"
                            : "bg-purple-500/10 border-purple-500/40 text-purple-400 hover:bg-purple-500/20"
                        }`}
                      >
                        {decision.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                {activeStageIdx > 0 && (
                  <button
                    onClick={goToPrevStage}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white px-4 py-2 rounded-lg border border-dark-500 hover:border-dark-400"
                  >
                    <ArrowLeft size={14} />
                    Previous
                  </button>
                )}
                {activeStageIdx < stages.length - 1 && (
                  <button
                    onClick={goToNextStage}
                    className="flex items-center gap-1 text-sm bg-brand-orange hover:bg-orange-600 text-white px-6 py-2 rounded-lg"
                  >
                    Next: {stages[activeStageIdx + 1]?.name}
                    <ChevronRight size={14} />
                  </button>
                )}
                {activeStageIdx === stages.length - 1 && (
                  <>
                    <button
                      onClick={handleExport}
                      className="flex items-center gap-1 text-sm bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg"
                    >
                      <Download size={14} />
                      Export Complete Document
                    </button>
                    <button
                      onClick={() => {
                        sessionStorage.setItem("iko_writer_text", stageOutput);
                        navigate("/humanizer");
                      }}
                      className="flex items-center gap-1 text-sm bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg"
                    >
                      <PenTool size={14} />
                      Open in iKo Writer
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setShowOutput(false);
                    setStageInputs({});
                  }}
                  className="text-sm text-brand-blue hover:underline ml-auto"
                >
                  Re-run this stage
                </button>
              </div>
            </div>
          ) : (
            /* Input form */
            <div className="max-w-2xl">
              {/* Uploaded file chip */}
              {uploadedFile && (
                <div className="mb-4 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-dark-700 border border-dark-500 rounded-full px-3 py-1 text-xs text-gray-300">
                    <Paperclip size={12} className="text-brand-orange" />
                    {uploadedFile.name}
                    <button
                      onClick={() => setUploadedFile(null)}
                      className="ml-1 text-gray-500 hover:text-white"
                    >
                      &times;
                    </button>
                  </span>
                </div>
              )}

              <div className="space-y-4">
                {currentStage?.user_inputs.map((field) => (
                  <div key={field.id}>
                    <label className="block text-sm text-gray-300 mb-1.5">
                      {field.label}
                      {field.required && (
                        <span className="text-brand-orange ml-1">*</span>
                      )}
                    </label>
                    {field.type === "select" ? (
                      <select
                        value={stageInputs[field.id] || ""}
                        onChange={(e) =>
                          setStageInputs((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
                      >
                        <option value="">Select...</option>
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        value={stageInputs[field.id] || ""}
                        onChange={(e) =>
                          setStageInputs((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        rows={4}
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={stageInputs[field.id] || ""}
                        onChange={(e) =>
                          setStageInputs((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                      />
                    )}
                  </div>
                ))}

                {/* File upload */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-dashed border-dark-500 hover:border-dark-400 rounded-lg px-4 py-2.5 transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        Attach a file (PDF, DOCX, TXT)
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6">
                {activeStageIdx > 0 && (
                  <button
                    onClick={goToPrevStage}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white px-4 py-2.5 rounded-lg border border-dark-500"
                  >
                    <ArrowLeft size={14} />
                    Back
                  </button>
                )}
                <button
                  onClick={executeStage}
                  disabled={processing}
                  className="flex-1 bg-brand-orange hover:bg-orange-600 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {stageLlm?.name || "AI"} is working...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Generate with {stageLlm?.name || "AI"}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile stage nav */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-t border-dark-500/30 bg-dark-800/50">
          <span className="text-xs text-gray-500">
            {session.stages_completed.length}/{stages.length} completed
          </span>
          <button
            onClick={handleExport}
            disabled={session.stages_completed.length === 0}
            className="text-xs text-brand-blue disabled:text-gray-600"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
