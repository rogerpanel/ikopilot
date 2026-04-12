import { useState, useRef } from "react";
import {
  Code,
  GitBranch,
  Image,
  Layout,
  Sparkles,
  MessageSquare,
  Copy,
  Download,
  Paperclip,
  X,
  Loader2,
  Send,
  PanelRightClose,
  PanelRightOpen,
  FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const MODES = [
  { id: "tikz", name: "TikZ Code", desc: "LaTeX diagrams for papers", icon: Code, color: "border-orange-500/30", activeColor: "border-orange-500 bg-orange-500/10", textColor: "text-orange-400" },
  { id: "mermaid", name: "Mermaid Diagram", desc: "Flowcharts & sequences", icon: GitBranch, color: "border-blue-500/30", activeColor: "border-blue-500 bg-blue-500/10", textColor: "text-blue-400" },
  { id: "image_gen", name: "AI Image Gen", desc: "DALL-E illustrations", icon: Image, color: "border-green-500/30", activeColor: "border-green-500 bg-green-500/10", textColor: "text-green-400" },
  { id: "drawio", name: "Draw.io XML", desc: "Editable architectures", icon: Layout, color: "border-purple-500/30", activeColor: "border-purple-500 bg-purple-500/10", textColor: "text-purple-400" },
];

export default function Framework() {
  const [activeMode, setActiveMode] = useState("tikz");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [generating, setGenerating] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [refining, setRefining] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; extracted_text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const modeConfig = MODES.find((m) => m.id === activeMode)!;
  const ModeIcon = modeConfig.icon;

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setGenerating(true);
    try {
      const res = await apiPost("/api/framework/generate", {
        mode: activeMode,
        prompt: input,
        context: "",
        conversation_history: chatHistory.map((m) => ({ role: m.role, content: m.content })),
        uploaded_file_context: uploadedFile?.extracted_text || "",
      });
      setOutput(res.content);
      setChatHistory([
        { role: "user", content: input },
        { role: "assistant", content: res.content },
      ]);
      setShowChat(true);
    } catch (err: any) {
      toast.error(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!chatInput.trim() || !output) return;
    setRefining(true);
    const newHistory = [...chatHistory, { role: "user" as const, content: chatInput }];
    setChatHistory(newHistory);
    setChatInput("");
    try {
      const res = await apiPost("/api/framework/refine", {
        mode: activeMode,
        original_output: output,
        refinement: chatInput,
        conversation_history: newHistory.map((m) => ({ role: m.role, content: m.content })),
      });
      setOutput(res.content);
      setChatHistory([...newHistory, { role: "assistant", content: res.content }]);
    } catch (err: any) {
      toast.error(err.message || "Refinement failed");
    } finally {
      setRefining(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    toast.success("Copied to clipboard");
  };

  const handleExport = async (format: string) => {
    try {
      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch("/api/framework/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: activeMode, content: output, format }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Export failed" }));
        throw new Error(body.detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = activeMode === "tikz" ? "tex" : activeMode === "mermaid" ? "mmd" : activeMode === "drawio" ? "drawio" : format;
      a.download = `ikopilot-diagram.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported");
    } catch (err: any) {
      toast.error(err.message);
    }
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
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setUploadedFile({ name: data.name, extracted_text: data.extracted_text || "" });
      toast.success(`Attached ${file.name}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full">
      {/* LEFT: Design modes */}
      <div className="hidden sm:flex w-56 lg:w-64 border-r border-dark-500/30 flex-col bg-dark-800/50">
        <div className="p-4 border-b border-dark-500/30">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Layout size={18} className="text-brand-orange" />
            iKo Framework
          </h2>
          <p className="text-[10px] text-gray-500 mt-1">Research Diagrams & Illustrations</p>
        </div>

        <div className="flex-1 p-3 space-y-2">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => { setActiveMode(mode.id); setOutput(""); setChatHistory([]); setInput(""); }}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  isActive ? mode.activeColor : `${mode.color} hover:bg-dark-700`
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} className={isActive ? mode.textColor : "text-gray-400"} />
                  <span className={`text-sm font-medium ${isActive ? "text-white" : "text-gray-300"}`}>{mode.name}</span>
                </div>
                <p className="text-[10px] text-gray-500">{mode.desc}</p>
              </button>
            );
          })}

          {/* File upload */}
          <div className="pt-3 border-t border-dark-500/20">
            <input ref={fileRef} type="file" onChange={handleFileUpload} className="hidden"
              accept=".pdf,.docx,.txt,.csv,.png,.jpg,.jpeg,.tex,.md" />
            {uploadedFile ? (
              <div className="flex items-center gap-1.5 bg-dark-700 rounded-lg px-2.5 py-2 text-xs text-gray-300">
                <FileText size={12} className="text-brand-blue" />
                <span className="truncate flex-1">{uploadedFile.name}</span>
                <button onClick={() => setUploadedFile(null)} className="text-gray-500 hover:text-red-400 inline-btn"><X size={12} /></button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 bg-dark-700 border border-dashed border-dark-400 rounded-lg px-3 py-2.5 text-xs text-gray-400 hover:border-brand-blue hover:text-white transition-colors"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                Attach reference file
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CENTER: Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mode header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-dark-500/30 bg-dark-800/50">
          <div className="flex items-center gap-2">
            <ModeIcon size={16} className={modeConfig.textColor} />
            <span className="text-sm font-medium text-white">{modeConfig.name}</span>
            <span className="text-xs text-gray-500 hidden sm:inline">— {modeConfig.desc}</span>
          </div>
          <button
            onClick={() => setShowChat(!showChat)}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-dark-700"
            title="Design chat"
          >
            {showChat ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>

        {/* Output area */}
        <div className="flex-1 overflow-y-auto p-4">
          {!output ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ModeIcon size={48} className="text-gray-600 mb-4" />
              <p className="text-gray-400 mb-1">Describe your diagram or framework</p>
              <p className="text-xs text-gray-500 max-w-md">
                {activeMode === "tikz" && "Generates compilable LaTeX TikZ code for research papers"}
                {activeMode === "mermaid" && "Generates Mermaid.js syntax for flowcharts and diagrams"}
                {activeMode === "image_gen" && "Creates scientific illustrations via DALL-E image generation"}
                {activeMode === "drawio" && "Generates draw.io XML you can import and edit"}
              </p>
            </div>
          ) : (
            <div>
              {/* Code output */}
              {activeMode !== "image_gen" ? (
                <div className="relative">
                  <div className="bg-dark-900 border border-dark-500/30 rounded-xl p-4 overflow-x-auto">
                    <pre className="text-sm font-mono text-green-400 whitespace-pre-wrap leading-relaxed">{output}</pre>
                  </div>
                  <button onClick={handleCopy}
                    className="absolute top-3 right-3 text-gray-500 hover:text-white p-1.5 bg-dark-700 rounded-lg inline-btn"
                    title="Copy code">
                    <Copy size={14} />
                  </button>
                </div>
              ) : (
                <div className="bg-dark-900 border border-dark-500/30 rounded-xl p-6 text-center">
                  <Image size={48} className="mx-auto text-green-400/50 mb-3" />
                  <p className="text-sm text-gray-300 mb-2">DALL-E Prompt Ready</p>
                  <p className="text-xs text-gray-400 max-w-lg mx-auto bg-dark-800 rounded-lg p-3">{output}</p>
                  <button
                    onClick={() => handleExport("png")}
                    className="mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 mx-auto"
                  >
                    <Sparkles size={14} />
                    Generate & Download Image
                  </button>
                </div>
              )}

              {/* Export bar */}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {activeMode !== "image_gen" && (
                  <>
                    <button onClick={handleCopy} className="flex items-center gap-1 text-xs bg-dark-700 hover:bg-dark-600 text-white px-3 py-1.5 rounded-lg">
                      <Copy size={12} /> Copy Code
                    </button>
                    <button onClick={() => handleExport(activeMode === "tikz" ? "tex" : activeMode === "mermaid" ? "mmd" : "drawio")}
                      className="flex items-center gap-1 text-xs bg-dark-700 hover:bg-dark-600 text-white px-3 py-1.5 rounded-lg">
                      <Download size={12} />
                      Download .{activeMode === "tikz" ? "tex" : activeMode === "mermaid" ? "mmd" : "drawio"}
                    </button>
                  </>
                )}
                {activeMode === "image_gen" && (
                  <>
                    <button onClick={() => handleExport("png")} className="flex items-center gap-1 text-xs bg-dark-700 hover:bg-dark-600 text-white px-3 py-1.5 rounded-lg">
                      <Download size={12} /> PNG
                    </button>
                    <button onClick={() => handleExport("jpg")} className="flex items-center gap-1 text-xs bg-dark-700 hover:bg-dark-600 text-white px-3 py-1.5 rounded-lg">
                      <Download size={12} /> JPG
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        {!output && (
          <div className="border-t border-dark-500/30 bg-dark-800/50 p-3 sm:p-4 safe-bottom">
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                placeholder="Describe the diagram, framework, or illustration you need..."
                rows={3}
                className="flex-1 bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-none"
              />
              <button
                onClick={handleGenerate}
                disabled={!input.trim() || generating}
                className="bg-brand-orange hover:bg-orange-600 text-white p-3 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Chat panel */}
      {showChat && output && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setShowChat(false)} />
          <div className="fixed lg:static inset-y-0 right-0 z-40 w-80 bg-dark-800 border-l border-dark-500/30 flex flex-col">
            <div className="h-12 flex items-center justify-between px-3 border-b border-dark-500/30">
              <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <MessageSquare size={14} /> Design Chat
              </span>
              <button onClick={() => setShowChat(false)} className="text-gray-500 hover:text-white p-1 inline-btn lg:hidden"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`text-xs ${msg.role === "user" ? "text-brand-orange" : "text-gray-400"}`}>
                  <span className="font-medium">{msg.role === "user" ? "You" : "AI"}:</span>
                  <p className="mt-0.5 whitespace-pre-wrap line-clamp-6">{msg.content.slice(0, 500)}</p>
                </div>
              ))}
              {refining && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 size={12} className="animate-spin" /> Refining...
                </div>
              )}
            </div>

            <div className="p-3 border-t border-dark-500/30">
              <div className="flex items-end gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
                  placeholder="Refine the design..."
                  rows={2}
                  className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-none"
                />
                <button
                  onClick={handleRefine}
                  disabled={!chatInput.trim() || refining}
                  className="bg-brand-blue hover:bg-blue-600 text-white p-2 rounded-lg disabled:opacity-50 flex-shrink-0"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
