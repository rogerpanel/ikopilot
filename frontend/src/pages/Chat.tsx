import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Send,
  Bot,
  User,
  Loader2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { streamChat, apiFetch } from "../utils/api";
import { getStoredUser } from "../utils/auth";
import Logo from "../components/Logo";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState("deepseek");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [researchMode, setResearchMode] = useState<string | null>(null);
  const [researchModes, setResearchModes] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const user = getStoredUser();

  useEffect(() => {
    apiFetch("/api/chat/providers")
      .then((res) => {
        setProviders(res.providers);
        // Set default to first available provider
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
      apiFetch(`/api/chat/conversations/${conversationId}`)
        .then((res) => {
          setMessages(res.messages || []);
          if (res.provider) setProvider(res.provider);
        })
        .catch(() => toast.error("Failed to load conversation"));
    }
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    await streamChat(
      {
        provider,
        messages: [...messages, userMsg],
        conversation_id: conversationId ? parseInt(conversationId) : null,
        research_mode: researchMode,
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
        // Remove the empty assistant message on error
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === "assistant" && !updated[updated.length - 1].content) {
            updated.pop();
          }
          return updated;
        });
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="min-h-[3.5rem] flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 lg:px-6 py-2 border-b border-dark-500/30 bg-dark-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Provider selector */}
          <div className="relative">
            <button
              onClick={() => setShowProviderMenu(!showProviderMenu)}
              className="flex items-center gap-1.5 bg-dark-700 border border-dark-500 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm hover:border-dark-400 transition-colors"
            >
              <Sparkles size={14} className={PROVIDER_COLORS[provider] || "text-gray-400"} />
              <span>{PROVIDER_LABELS[provider] || provider}</span>
              <ChevronDown size={14} />
            </button>
            {showProviderMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProviderMenu(false)} />
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
                      <Sparkles size={14} className={PROVIDER_COLORS[p.id] || "text-gray-400"} />
                      {PROVIDER_LABELS[p.id] || p.id}
                      {!p.available && (
                        <span className="ml-auto text-xs text-gray-500">upgrade</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Research mode selector */}
          {researchModes.length > 0 && (
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
          )}
        </div>

        <div className="text-xs text-gray-500 hidden sm:block">
          {user?.tokens_used_today?.toLocaleString() || 0} tokens today
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="mb-4">
              <Logo size="xl" />
            </div>
            <p className="text-gray-400 max-w-md">
              Your AI research assistant. Ask about methodology, analyze literature,
              get writing feedback, or explore statistical results.
            </p>
            {researchModes.length > 0 && (
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-2">
                {researchModes.slice(0, 4).map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setResearchMode(mode.id)}
                    className="bg-dark-800 border border-dark-500/30 rounded-lg px-3 py-2 text-xs text-gray-400 hover:border-brand-blue/50 hover:text-white transition-colors"
                  >
                    {mode.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-brand-blue/20 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-brand-blue" />
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
                  <ReactMarkdown>{msg.content || (streaming && i === messages.length - 1 ? "..." : "")}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                style={{ backgroundColor: user?.avatar_color || "#3B82F6" }}
              >
                {user?.full_name?.charAt(0) || "U"}
              </div>
            )}
          </div>
        ))}

        {streaming && (
          <div className="flex items-center gap-2 text-gray-500 text-sm pl-11">
            <Loader2 size={14} className="animate-spin" />
            Generating...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-dark-500/30 bg-dark-800/50 p-3 sm:p-4 lg:px-6">
        <div className="flex items-end gap-2 sm:gap-3 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a research question..."
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
  );
}
