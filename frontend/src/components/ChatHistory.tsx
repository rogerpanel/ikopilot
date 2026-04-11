import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  MessageSquare,
  Trash2,
  Download,
  Clock,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiFetch, apiDelete } from "../utils/api";

interface ConversationItem {
  id: number;
  title: string;
  provider: string | null;
  message_count: number;
  created_at: string | null;
  preview?: string;
}

interface ChatHistoryProps {
  currentId?: number;
  onSelect: (id: number) => void;
}

const PROVIDER_BADGE: Record<string, string> = {
  claude: "bg-orange-500/20 text-orange-400",
  gpt4o: "bg-green-500/20 text-green-400",
  gemini: "bg-blue-500/20 text-blue-400",
  deepseek: "bg-purple-500/20 text-purple-400",
};

export default function ChatHistory({ currentId, onSelect }: ChatHistoryProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  const loadConversations = async () => {
    try {
      const data = await apiFetch("/api/chat/conversations?limit=30");
      setConversations(data);
    } catch {
      // Silent fail
    }
  };

  const searchConversations = async (q: string) => {
    if (!q.trim()) {
      loadConversations();
      return;
    }
    setSearching(true);
    try {
      const data = await apiFetch(
        `/api/history/search?q=${encodeURIComponent(q)}`
      );
      setConversations(data);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchConversations(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiDelete(`/api/chat/conversations/${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentId === id) navigate("/chat");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExport = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/history/export/${id}?format=md`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("ikopilot_token")}`,
        },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") ||
        "conversation.md";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return "Today";
    if (diff < 172800000) return "Yesterday";
    if (diff < 604800000) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-8 pr-8 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white inline-btn"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {conversations.length === 0 ? (
          <p className="text-center text-gray-500 text-xs py-8">
            {searchQuery ? "No results found" : "No conversations yet"}
          </p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                currentId === conv.id
                  ? "bg-brand-orange/10 border border-brand-orange/20"
                  : "hover:bg-dark-700 border border-transparent"
              }`}
            >
              <MessageSquare size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{conv.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {conv.provider && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        PROVIDER_BADGE[conv.provider] || "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {conv.provider}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500">
                    {formatDate(conv.created_at)}
                  </span>
                </div>
                {conv.preview && (
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {conv.preview}
                  </p>
                )}
              </div>
              <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => handleExport(conv.id, e)}
                  className="p-1 text-gray-500 hover:text-brand-blue rounded inline-btn"
                  title="Export"
                >
                  <Download size={12} />
                </button>
                <button
                  onClick={(e) => handleDelete(conv.id, e)}
                  className="p-1 text-gray-500 hover:text-red-400 rounded inline-btn"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
