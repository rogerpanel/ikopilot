import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Send,
  Bot,
  Loader2,
  ChevronDown,
  Sparkles,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  FileCode,
  Paperclip,
  FileText,
  Image,
  Download,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { streamChat, apiFetch } from "../utils/api";
import { getStoredUser } from "../utils/auth";
import Logo from "../components/Logo";
import ChatHistory from "../components/ChatHistory";
import ResearchModePanel from "../components/ResearchModePanel";
import ResearchWorkspace from "../components/ResearchWorkspace";
import ScholarSearch from "../components/ScholarSearch";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Provider {
  id: string;
  model: string;
  available: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  gpt4o: "GPT-4o",
  gemini: "Gemini",
  deepseek: "DeepSeek",
};

const PROVIDER_COLORS: Record<string, string> = {
  claude: "text-orange-400",
  gpt4o: "text-green-400",
  gemini: "text-blue-400",
  deepseek: "text-purple-400",
};

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState("deepseek");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [researchMode, setResearchMode] = useState<string | null>(null);
  const [researchModes, setResearchModes] = useState<any[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [responseFormat, setResponseFormat] = useState<"markdown" | "latex">("markdown");
  const [convId, setConvId] = useState<number | null>(
    conversationId ? parseInt(conversationId) : null
  );
  const [attachedFiles, setAttachedFiles] = useState<
    { id: string; name: string; type: string; extracted_text: string; is_image: boolean }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const user = getStoredUser();

  useEffect(() => {
    apiFetch("/api/chat/providers")
      .then((res) => {
        setProviders(res.providers);
        const avail = res.providers.find((p: Provider) => p.available);
        if (avail) setProvider(avail.id);
      })
      .catch(() => {});

    apiFetch("/api/research-modes/")
      .then(setResearchModes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (conversationId) {
      setConvId(parseInt(conversationId));
      apiFetch(`/api/chat/conversations/${conversationId}`)
        .then((res) => {
          setMessages(res.messages || []);
          if (res.provider) setProvider(res.provider);
        })
        .catch(() => toast.error("Failed to load conversation"));
    } else {
      setConvId(null);
      setMessages([]);
    }
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectConversation = (id: number) => {
    navigate(`/chat/${id}`);
    setShowHistory(false);
  };

  const handleNewChat = () => {
    navigate("/chat");
    setMessages([]);
    setConvId(null);
    setShowHistory(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    // Build message with file context
    let fullContent = text;
    if (attachedFiles.length > 0) {
      const fileContextParts = attachedFiles.map((f) => {
        if (f.is_image) return `[Attached image: ${f.name}]`;
        if (f.extracted_text) return `[Attached file: ${f.name}]\n${f.extracted_text.slice(0, 10000)}`;
        return `[Attached file: ${f.name}]`;
      });
      fullContent = fileContextParts.join("\n\n") + "\n\n" + text;
    }

    const userMsg: Message = { role: "user", content: fullContent };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachedFiles([]);
    setStreaming(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    await streamChat(
      {
        provider,
        messages: [...messages, userMsg],
        conversation_id: convId,
        research_mode: researchMode,
        response_format: responseFormat === "latex" ? "latex" : undefined,
      },
      (chunk) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            last.content += chunk;
          }
          return [...updated];
        });
      },
      () => {
        setStreaming(false);
      },
      (error) => {
        toast.error(error);
        setStreaming(false);
        setMessages((prev) => {
          const updated = [...prev];
          if (
            updated[updated.length - 1]?.role === "assistant" &&
            !updated[updated.length - 1].content
          ) {
            updated.pop();
          }
          return updated;
        });
      }
    );
  };

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

  const handleExportChat = () => {
    if (!messages || messages.length === 0) { toast.error("No messages to export"); return; }
    let md = `# Chat Conversation\n\n`;
    messages.forEach((m: any) => {
      const role = m.role === "user" ? "**You**" : "**iKoPilot.com**";
      md += `${role}:\n${m.content}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chat_conversation.md";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chat exported as Markdown");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full">
      {/* History sidebar */}
      {showHistory && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setShowHistory(false)}
          />
          <div className="fixed lg:static inset-y-0 left-0 z-40 w-72 bg-dark-800 border-r border-dark-500/30 flex flex-col">
            <div className="h-12 flex items-center justify-between px-3 border-b border-dark-500/30">
              <span className="text-sm font-medium text-gray-300">Chat History</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleNewChat}
                  className="text-xs bg-brand-orange/10 text-brand-orange px-2 py-1 rounded hover:bg-brand-orange/20 inline-btn"
                >
                  + New
                </button>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-gray-500 hover:text-white p-1 inline-btn"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <ChatHistory
              currentId={convId || undefined}
              onSelect={handleSelectConversation}
            />
          </div>
        </>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="min-h-[3.5rem] flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 lg:px-6 py-2 border-b border-dark-500/30 bg-dark-800/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 flex-wrap">
            {/* History toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-dark-700 transition-colors"
              title="Chat history"
            >
              {showHistory ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>

            {/* Provider selector */}
            <div className="relative">
              <button
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                className="flex items-center gap-1.5 bg-dark-700 border border-dark-500 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm hover:border-dark-400 transition-colors"
              >
                <Sparkles
                  size={14}
                  className={PROVIDER_COLORS[provider] || "text-gray-400"}
                />
                <span>{PROVIDER_LABELS[provider] || provider}</span>
                <ChevronDown size={14} />
              </button>
              {showProviderMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProviderMenu(false)}
                  />
                  <div className="absolute top-full mt-1 left-0 bg-dark-700 border border-dark-500 rounded-lg shadow-xl z-50 min-w-[180px]">
                    {providers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (p.available) {
                            setProvider(p.id);
                            setShowProviderMenu(false);
                          }
                        }}
                        disabled={!p.available}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 ${
                          p.available
                            ? "hover:bg-dark-600 text-white"
                            : "text-gray-500 cursor-not-allowed"
                        } ${p.id === provider ? "bg-dark-600" : ""}`}
                      >
                        <Sparkles
                          size={14}
                          className={PROVIDER_COLORS[p.id] || "text-gray-400"}
                        />
                        {PROVIDER_LABELS[p.id] || p.id}
                        {!p.available && (
                          <span className="ml-auto text-xs text-gray-500">
                            upgrade
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Research mode quick select */}
            <select
              value={researchMode || ""}
              onChange={(e) => setResearchMode(e.target.value || null)}
              className="bg-dark-700 border border-dark-500 rounded-lg px-2 py-1.5 text-xs sm:text-sm text-gray-300 focus:outline-none max-w-[140px] sm:max-w-none"
            >
              <option value="">General chat</option>
              {researchModes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </select>

            {/* LaTeX toggle */}
            <button
              onClick={() =>
                setResponseFormat(responseFormat === "latex" ? "markdown" : "latex")
              }
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition-colors ${
                responseFormat === "latex"
                  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  : "bg-dark-700 border-dark-500 text-gray-400 hover:text-white"
              }`}
              title={responseFormat === "latex" ? "LaTeX mode ON" : "Switch to LaTeX output"}
            >
              <FileCode size={14} />
              <span className="hidden sm:inline">LaTeX</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Export chat */}
            <button onClick={handleExportChat} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white bg-dark-700 border border-dark-500 rounded-lg px-2 py-1 transition-colors" title="Export chat">
              <Download size={12} /> Export
            </button>
            {/* Scholar search toggle */}
            <button
              onClick={() => setShowTools(!showTools)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                showTools
                  ? "bg-brand-blue/10 text-brand-blue"
                  : "text-gray-400 hover:text-white hover:bg-dark-700"
              }`}
              title="Paper search"
            >
              <BookOpen size={14} />
              <span className="hidden sm:inline">Papers</span>
            </button>
            <div className="text-xs text-gray-500 hidden sm:block">
              {user?.tokens_used_today?.toLocaleString() || 0} tokens today
            </div>
          </div>
        </div>

        {/* Research Workspace (when a mode is opened) */}
        {activeWorkspace && messages.length === 0 && (
          <ResearchWorkspace
            modeId={activeWorkspace}
            onSendMessage={(msg) => {
              setActiveWorkspace(null);
              setInput(msg);
              // Auto-send after a tick
              setTimeout(() => {
                const fakeEvent = { key: "Enter", shiftKey: false, preventDefault: () => {} };
                // Set input and trigger send
                setInput("");
                const userMsg: Message = { role: "user", content: msg };
                setMessages([userMsg, { role: "assistant", content: "" }]);
                setStreaming(true);
                streamChat(
                  {
                    provider,
                    messages: [userMsg],
                    conversation_id: convId,
                    research_mode: researchMode,
                    response_format: responseFormat === "latex" ? "latex" : undefined,
                  },
                  (chunk) => {
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last.role === "assistant") last.content += chunk;
                      return [...updated];
                    });
                  },
                  () => setStreaming(false),
                  (error) => {
                    toast.error(error);
                    setStreaming(false);
                  }
                );
              }, 100);
            }}
            onClose={() => {
              setActiveWorkspace(null);
              setResearchMode(null);
            }}
          />
        )}

        {/* Messages */}
        {(!activeWorkspace || messages.length > 0) && (
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="mb-4">
                <Logo size="xl" />
              </div>
              <p className="text-gray-400 max-w-md mb-6">
                Your Intelligent Research Co-Pilot. Ask about methodology, analyze
                literature, get writing feedback, or explore statistical results.
              </p>
              {researchModes.length > 0 && (
                <div className="w-full max-w-2xl">
                  <p className="text-xs text-gray-500 mb-3">
                    Choose a research mode to get started:
                  </p>
                  <ResearchModePanel
                    modes={researchModes}
                    activeMode={researchMode}
                    onSelect={(modeId) => {
                      if (modeId) {
                        setActiveWorkspace(modeId);
                        setResearchMode(modeId);
                      } else {
                        setActiveWorkspace(null);
                        setResearchMode(null);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 sm:gap-3 ${
                msg.role === "user" ? "justify-end" : ""
              }`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-blue/20 flex items-center justify-center flex-shrink-0">
                  <Bot size={14} className="text-brand-blue" />
                </div>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 ${
                  msg.role === "user"
                    ? "bg-brand-orange/10 border border-brand-orange/20 text-white"
                    : "bg-dark-700/50 border border-dark-500/20 text-gray-200"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose-chat text-sm leading-relaxed">
                    <ReactMarkdown>
                      {msg.content ||
                        (streaming && i === messages.length - 1 ? "..." : "")}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
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
          ))}

          {streaming && (
            <div className="flex items-center gap-2 text-gray-500 text-sm pl-9 sm:pl-11">
              <Loader2 size={14} className="animate-spin" />
              Generating...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        )}

        {/* Input */}
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
                    onClick={() => setAttachedFiles((prev) => prev.filter((x) => x.id !== f.id))}
                    className="text-gray-500 hover:text-red-400 inline-btn"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 sm:gap-3 max-w-4xl mx-auto">
            {/* File attach button */}
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
              placeholder={attachedFiles.length > 0 ? "Ask about the attached file..." : "Ask a research question..."}
              rows={1}
              className="flex-1 bg-dark-700 border border-dark-500 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-none max-h-36"
              style={{ minHeight: "44px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="bg-brand-orange hover:bg-orange-600 text-white p-2.5 sm:p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Research tools panel (right side) */}
      {showTools && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setShowTools(false)}
          />
          <div className="fixed lg:static inset-y-0 right-0 z-40 w-80 bg-dark-800 border-l border-dark-500/30 flex flex-col">
            <div className="h-12 flex items-center justify-between px-3 border-b border-dark-500/30">
              <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <BookOpen size={14} />
                Paper Search
              </span>
              <button
                onClick={() => setShowTools(false)}
                className="text-gray-500 hover:text-white p-1 inline-btn"
              >
                <X size={16} />
              </button>
            </div>
            <ScholarSearch projectId={null} />
          </div>
        </>
      )}
    </div>
  );
}
