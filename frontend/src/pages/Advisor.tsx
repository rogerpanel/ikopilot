import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap,
  Send,
  MessageSquare,
  Loader2,
  Sparkles,
  ChevronRight,
  BookOpen,
  Lightbulb,
  ArrowRight,
  Paperclip,
  X,
  FileText,
  Image,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { apiFetch, apiPost } from "../utils/api";
import { getStoredUser } from "../utils/auth";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RecommendedTool {
  name: string;
  path: string;
  reason: string;
}

interface AdvisorResponse {
  response: string;
  recommended_tools: RecommendedTool[];
  follow_up_questions: string[];
}

interface ChatMessage {
  role: "user" | "advisor";
  content: string;
  recommended_tools?: RecommendedTool[];
  follow_up_questions?: string[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FIELDS = [
  "Computer Science",
  "Medicine",
  "Biological Sciences",
  "Humanities & History",
  "Management & Economics",
  "Engineering",
  "Social Sciences",
  "Education",
  "Environmental Science",
  "Mathematics",
  "Law",
  "Arts & Design",
];

const LEVELS = [
  { id: "BSc", label: "BSc" },
  { id: "MSc", label: "MSc" },
  { id: "PhD", label: "PhD" },
];

const WELCOME_MESSAGE =
  "Hello! I'm your iKo Advisor. Tell me about your research challenge \u2014 whether it's choosing a topic, designing methodology, analyzing data, or preparing for your defense. I'm here to help guide you.";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Advisor() {
  const navigate = useNavigate();
  const user = getStoredUser();

  /* State */
  const [field, setField] = useState("");
  const [level, setLevel] = useState("");
  const [messages, setChatMessages] = useState<ChatMessage[]>([]);
  const [tips, setTips] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* File upload */
  const [attachedFiles, setAttachedFiles] = useState<
    { id: string; name: string; type: string; extracted_text: string; is_image: boolean }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---------------------------------------------------------------- */
  /*  Tips                                                             */
  /* ---------------------------------------------------------------- */

  const loadTips = async () => {
    if (!field) {
      toast.error("Please select a research field first");
      return;
    }
    setTipsLoading(true);
    setTips([]);
    try {
      const slug = field.toLowerCase().replace(/[&\s]+/g, "-");
      const data = await apiFetch<{ tips: string[] }>(`/api/advisor/tips/${slug}`);
      setTips(data.tips || []);
      toast.success("Tips loaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to load tips");
    } finally {
      setTipsLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  File upload                                                      */
  /* ---------------------------------------------------------------- */

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      setAttachedFiles((prev) => [...prev, data]);
      toast.success(`Attached ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Send message                                                     */
  /* ---------------------------------------------------------------- */

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    let fullContent = text;
    if (attachedFiles.length > 0) {
      const fileContextParts = attachedFiles.map((f) => {
        if (f.is_image) return `[Attached image: ${f.name}]`;
        if (f.extracted_text)
          return `[Attached file: ${f.name}]\n${f.extracted_text.slice(0, 10000)}`;
        return `[Attached file: ${f.name}]`;
      });
      fullContent = fileContextParts.join("\n\n") + "\n\n" + text;
    }

    const userMsg: ChatMessage = { role: "user", content: fullContent };
    setChatMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachedFiles([]);
    setLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role === "advisor" ? "assistant" : "user",
        content: m.content,
      }));

      const data = await apiPost<AdvisorResponse>("/api/advisor/consult", {
        messages: history,
        field: field || undefined,
        level: level || undefined,
      });

      const advisorMsg: ChatMessage = {
        role: "advisor",
        content: data.response,
        recommended_tools: data.recommended_tools || [],
        follow_up_questions: data.follow_up_questions || [],
      };

      setChatMessages((prev) => [...prev, advisorMsg]);
    } catch (err: any) {
      toast.error(err.message || "Failed to get advisor response");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-full">
      {/* ============================================================ */}
      {/*  LEFT SIDEBAR — hidden on mobile unless toggled               */}
      {/* ============================================================ */}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-60 bg-dark-800 border-r border-dark-500/30 flex flex-col
          transform transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Sidebar header */}
        <div className="p-4 border-b border-dark-500/30">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <GraduationCap size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-sm">iKo Advisor</h2>
              <p className="text-[10px] text-gray-500">Your Research Supervisor</p>
            </div>
          </div>
        </div>

        {/* Sidebar controls */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Field selector */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Research Field</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-blue focus:outline-none appearance-none"
            >
              <option value="">Select field...</option>
              {FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Level selector */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Academic Level</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-blue focus:outline-none appearance-none"
            >
              <option value="">Select level...</option>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Tips button */}
          <button
            onClick={loadTips}
            disabled={tipsLoading || !field}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 text-blue-300 px-3 py-2 rounded-lg text-sm font-medium hover:border-blue-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tipsLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Lightbulb size={14} />
                Quick Tips
              </>
            )}
          </button>

          {/* Tips list */}
          {tips.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Lightbulb size={10} />
                Tips for {field}
              </p>
              <div className="space-y-2">
                {tips.map((tip, i) => (
                  <div
                    key={i}
                    className="bg-dark-700/50 border border-dark-500/20 rounded-lg p-2.5"
                  >
                    <p className="text-xs text-gray-300 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/*  MAIN CHAT AREA                                               */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — mobile toggle + title */}
        <div className="min-h-[3.5rem] flex items-center gap-3 px-3 sm:px-4 lg:px-6 py-2 border-b border-dark-500/30 bg-dark-800/50 backdrop-blur-sm">
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden flex items-center gap-1 text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-dark-700 transition-colors"
          >
            <BookOpen size={18} />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GraduationCap size={18} className="text-purple-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white truncate">iKo Advisor</span>
            {field && (
              <span className="hidden sm:inline-flex items-center text-[10px] bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20">
                {field}
              </span>
            )}
            {level && (
              <span className="hidden sm:inline-flex items-center text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/20">
                {level}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500 hidden sm:block">
              {messages.filter((m) => m.role === "user").length} messages
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
          {/* Welcome state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4">
                <GraduationCap size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">iKo Advisor</h2>
              <p className="text-gray-400 max-w-lg text-sm leading-relaxed mb-6">
                {WELCOME_MESSAGE}
              </p>

              {/* Starter suggestions */}
              <div className="grid gap-2 w-full max-w-lg sm:grid-cols-2">
                {[
                  "How do I choose a strong research topic?",
                  "What methodology suits qualitative research?",
                  "Help me structure my literature review",
                  "How should I prepare for my thesis defense?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="text-left bg-dark-700/50 border border-dark-500/20 rounded-xl px-4 py-3 text-sm text-gray-300 hover:border-purple-500/30 hover:bg-dark-700 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-purple-400 flex-shrink-0" />
                      <span className="line-clamp-2">{q}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <div key={i} className="space-y-2">
              <div
                className={`flex gap-2 sm:gap-3 ${
                  msg.role === "user" ? "justify-end" : ""
                }`}
              >
                {/* Advisor avatar */}
                {msg.role === "advisor" && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <GraduationCap size={14} className="text-white" />
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={`max-w-[85%] sm:max-w-[80%] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 ${
                    msg.role === "user"
                      ? "bg-brand-orange/10 border border-brand-orange/20 text-white"
                      : "bg-dark-700/50 border border-purple-500/20 text-gray-200"
                  }`}
                >
                  {msg.role === "advisor" ? (
                    <div className="prose-chat text-sm leading-relaxed">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>

                {/* User avatar */}
                {msg.role === "user" && (
                  <div
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                    style={{
                      backgroundColor: user?.avatar_color || "#3B82F6",
                    }}
                  >
                    {user?.full_name?.charAt(0) || "U"}
                  </div>
                )}
              </div>

              {/* Recommended Tools */}
              {msg.role === "advisor" &&
                msg.recommended_tools &&
                msg.recommended_tools.length > 0 && (
                  <div className="ml-9 sm:ml-11 space-y-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
                      <Sparkles size={10} />
                      Recommended Tools
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.recommended_tools.map((tool, ti) => (
                        <button
                          key={ti}
                          onClick={() => navigate(tool.path)}
                          className="flex items-center gap-2 bg-dark-700/50 border border-dark-500/30 rounded-lg px-3 py-2 text-xs hover:border-purple-500/40 hover:bg-dark-700 transition-colors group"
                        >
                          <ChevronRight
                            size={12}
                            className="text-purple-400 group-hover:translate-x-0.5 transition-transform"
                          />
                          <div className="text-left">
                            <p className="text-white font-medium">{tool.name}</p>
                            <p className="text-gray-500 text-[10px]">{tool.reason}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {/* Follow-up Questions */}
              {msg.role === "advisor" &&
                msg.follow_up_questions &&
                msg.follow_up_questions.length > 0 && (
                  <div className="ml-9 sm:ml-11 space-y-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
                      <MessageSquare size={10} />
                      Follow-up Questions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.follow_up_questions.map((q, qi) => (
                        <button
                          key={qi}
                          onClick={() => handleSend(q)}
                          disabled={loading}
                          className="flex items-center gap-1.5 bg-dark-700/30 border border-dark-500/20 rounded-full px-3 py-1.5 text-xs text-gray-300 hover:border-blue-500/30 hover:text-white transition-colors disabled:opacity-50"
                        >
                          <ArrowRight size={10} className="text-blue-400" />
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-gray-500 text-sm pl-9 sm:pl-11">
              <Loader2 size={14} className="animate-spin" />
              Advisor is thinking...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-dark-500/30 bg-dark-800/50 p-3 sm:p-4 lg:px-6 safe-bottom">
          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 max-w-4xl mx-auto">
              {attachedFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-1.5 bg-dark-700 border border-dark-500/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-300"
                >
                  {f.is_image ? (
                    <Image size={12} className="text-green-400" />
                  ) : (
                    <FileText size={12} className="text-brand-blue" />
                  )}
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    onClick={() =>
                      setAttachedFiles((prev) => prev.filter((x) => x.id !== f.id))
                    }
                    className="text-gray-500 hover:text-red-400 inline-btn"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 sm:gap-3 max-w-4xl mx-auto">
            {/* File attach */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              accept=".pdf,.csv,.txt,.docx,.doc,.xlsx,.md,.tex,.bib,.png,.jpg,.jpeg,.gif,.svg,.webp,.pptx,.ppt"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-gray-400 hover:text-white p-2.5 sm:p-3 rounded-xl hover:bg-dark-700 transition-colors disabled:opacity-50 flex-shrink-0"
              title="Attach file (PDF, DOCX, image, slides, LaTeX)"
            >
              {uploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                attachedFiles.length > 0
                  ? "Ask about the attached file..."
                  : "Describe your research challenge..."
              }
              rows={1}
              className="flex-1 bg-dark-700 border border-dark-500 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none max-h-36"
              style={{ minHeight: "44px" }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white p-2.5 sm:p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
