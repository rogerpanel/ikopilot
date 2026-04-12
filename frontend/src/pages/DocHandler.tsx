import { useState, useRef, useCallback, type DragEvent } from "react";
import {
  FileText,
  Layers,
  Scissors,
  Minimize2,
  Image,
  RotateCw,
  Lock,
  ArrowLeft,
  Upload,
  Loader2,
  Download,
  Files,
  X,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ToolDef {
  id: string;
  name: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  accepts: string;
  multiple?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Tool Definitions                                                   */
/* ------------------------------------------------------------------ */

const TOOLS: ToolDef[] = [
  { id: "pdf-to-word", name: "PDF to Word", desc: "Convert PDF to editable DOCX", icon: FileText, color: "blue", accepts: ".pdf" },
  { id: "word-to-pdf", name: "Word to PDF", desc: "Convert DOCX to PDF", icon: FileText, color: "red", accepts: ".docx,.doc" },
  { id: "merge-pdfs", name: "Merge PDFs", desc: "Combine multiple PDFs into one", icon: Layers, color: "green", accepts: ".pdf", multiple: true },
  { id: "split-pdf", name: "Split PDF", desc: "Split PDF into separate files", icon: Scissors, color: "orange", accepts: ".pdf" },
  { id: "compress-pdf", name: "Compress PDF", desc: "Reduce PDF file size", icon: Minimize2, color: "purple", accepts: ".pdf" },
  { id: "image-to-pdf", name: "Images to PDF", desc: "Convert images to PDF", icon: Image, color: "cyan", accepts: ".png,.jpg,.jpeg", multiple: true },
  { id: "pdf-to-images", name: "PDF to Images", desc: "Extract pages as PNG/JPG", icon: Image, color: "pink", accepts: ".pdf" },
  { id: "rotate-pages", name: "Rotate Pages", desc: "Rotate PDF pages", icon: RotateCw, color: "yellow", accepts: ".pdf" },
  { id: "add-watermark", name: "Add Watermark", desc: "Add text watermark to PDF", icon: FileText, color: "indigo", accepts: ".pdf" },
  { id: "protect-pdf", name: "Protect PDF", desc: "Add password to PDF", icon: Lock, color: "red", accepts: ".pdf" },
];

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

const COLOR_MAP: Record<string, { border: string; bg: string; text: string; hoverBorder: string }> = {
  blue:   { border: "border-blue-500/40",   bg: "bg-blue-500/10",   text: "text-blue-400",   hoverBorder: "hover:border-blue-400" },
  red:    { border: "border-red-500/40",    bg: "bg-red-500/10",    text: "text-red-400",    hoverBorder: "hover:border-red-400" },
  green:  { border: "border-green-500/40",  bg: "bg-green-500/10",  text: "text-green-400",  hoverBorder: "hover:border-green-400" },
  orange: { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-400", hoverBorder: "hover:border-orange-400" },
  purple: { border: "border-purple-500/40", bg: "bg-purple-500/10", text: "text-purple-400", hoverBorder: "hover:border-purple-400" },
  cyan:   { border: "border-cyan-500/40",   bg: "bg-cyan-500/10",   text: "text-cyan-400",   hoverBorder: "hover:border-cyan-400" },
  pink:   { border: "border-pink-500/40",   bg: "bg-pink-500/10",   text: "text-pink-400",   hoverBorder: "hover:border-pink-400" },
  yellow: { border: "border-yellow-500/40", bg: "bg-yellow-500/10", text: "text-yellow-400", hoverBorder: "hover:border-yellow-400" },
  indigo: { border: "border-indigo-500/40", bg: "bg-indigo-500/10", text: "text-indigo-400", hoverBorder: "hover:border-indigo-400" },
};

function getColor(color: string) {
  return COLOR_MAP[color] || COLOR_MAP.blue;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DocHandler() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState<string>("");
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentTool = TOOLS.find((t) => t.id === activeTool) || null;

  /* ---- Tool selection --------------------------------------------- */

  const selectTool = (toolId: string) => {
    setActiveTool(toolId);
    setFiles([]);
    setOptions({});
    setResultBlob(null);
    setResultName("");
    setResultSize(null);
  };

  const goBack = () => {
    setActiveTool(null);
    setFiles([]);
    setOptions({});
    setResultBlob(null);
    setResultName("");
    setResultSize(null);
  };

  /* ---- File handling ---------------------------------------------- */

  const handleFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || !currentTool) return;
      const arr = Array.from(incoming);
      if (currentTool.multiple) {
        setFiles((prev) => [...prev, ...arr]);
      } else {
        setFiles(arr.slice(0, 1));
      }
      setResultBlob(null);
      setResultName("");
      setResultSize(null);
    },
    [currentTool]
  );

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  /* ---- Option helpers --------------------------------------------- */

  const setOption = (key: string, value: string) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  /* ---- Process ---------------------------------------------------- */

  const processFile = async () => {
    if (!currentTool || files.length === 0) {
      toast.error("Please add at least one file");
      return;
    }

    setProcessing(true);
    setResultBlob(null);
    setResultName("");
    setResultSize(null);

    try {
      const formData = new FormData();
      if (currentTool.multiple) {
        files.forEach((f) => formData.append("files", f));
      } else {
        formData.append("file", files[0]);
      }
      Object.entries(options).forEach(([k, v]) => formData.append(k, v));

      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch(`/api/docs/${activeTool}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errBody.detail || `Error ${res.status}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let filename = `result_${activeTool}`;
      if (disposition) {
        const match = disposition.match(/filename="?([^";\n]+)"?/);
        if (match) filename = match[1];
      }

      setResultBlob(blob);
      setResultName(filename);
      setResultSize(blob.size);
      toast.success("Processing complete!");
    } catch (err: any) {
      toast.error(err.message || "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ---- Render: Tool Grid ----------------------------------------- */

  const renderToolGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {TOOLS.map((tool) => {
        const c = getColor(tool.color);
        const Icon = tool.icon;
        return (
          <button
            key={tool.id}
            onClick={() => selectTool(tool.id)}
            className={`flex items-start gap-4 p-4 rounded-xl border ${c.border} ${c.bg} ${c.hoverBorder} bg-dark-800 hover:bg-dark-700 transition-all text-left group`}
          >
            <div className={`p-2.5 rounded-lg ${c.bg} flex-shrink-0`}>
              <Icon size={22} className={c.text} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white group-hover:text-gray-100">
                {tool.name}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                {tool.desc}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );

  /* ---- Render: Tool-specific options ----------------------------- */

  const renderOptions = () => {
    if (!currentTool) return null;

    switch (currentTool.id) {
      case "split-pdf":
        return (
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Page Ranges
            </label>
            <input
              type="text"
              value={options.pages || ""}
              onChange={(e) => setOption("pages", e.target.value)}
              placeholder="e.g. 1-3, 4-6, 7-10"
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
            />
          </div>
        );

      case "compress-pdf":
        return (
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Compression Quality
            </label>
            <div className="flex gap-2">
              {["Low", "Medium", "High"].map((q) => (
                <button
                  key={q}
                  onClick={() => setOption("quality", q.toLowerCase())}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    (options.quality || "medium") === q.toLowerCase()
                      ? "bg-brand-orange text-white"
                      : "bg-dark-700 border border-dark-500 text-gray-400 hover:text-white hover:border-dark-400"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              Low = smallest file, High = best quality
            </p>
          </div>
        );

      case "pdf-to-images":
        return (
          <>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Output Format
              </label>
              <div className="flex gap-2">
                {["PNG", "JPG"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setOption("format", fmt.toLowerCase())}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      (options.format || "png") === fmt.toLowerCase()
                        ? "bg-brand-orange text-white"
                        : "bg-dark-700 border border-dark-500 text-gray-400 hover:text-white hover:border-dark-400"
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                DPI
              </label>
              <input
                type="number"
                value={options.dpi || "150"}
                onChange={(e) => setOption("dpi", e.target.value)}
                min={72}
                max={600}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
              />
            </div>
          </>
        );

      case "rotate-pages":
        return (
          <>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Rotation Angle
              </label>
              <div className="flex gap-2">
                {["90", "180", "270"].map((angle) => (
                  <button
                    key={angle}
                    onClick={() => setOption("angle", angle)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      (options.angle || "90") === angle
                        ? "bg-brand-orange text-white"
                        : "bg-dark-700 border border-dark-500 text-gray-400 hover:text-white hover:border-dark-400"
                    }`}
                  >
                    {angle}&deg;
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Pages (leave empty for all)
              </label>
              <input
                type="text"
                value={options.pages || ""}
                onChange={(e) => setOption("pages", e.target.value)}
                placeholder="e.g. 1, 3, 5-8"
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
              />
            </div>
          </>
        );

      case "add-watermark":
        return (
          <>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Watermark Text
              </label>
              <input
                type="text"
                value={options.text || ""}
                onChange={(e) => setOption("text", e.target.value)}
                placeholder="e.g. CONFIDENTIAL"
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Opacity: {options.opacity || "30"}%
              </label>
              <input
                type="range"
                min={5}
                max={100}
                value={options.opacity || "30"}
                onChange={(e) => setOption("opacity", e.target.value)}
                className="w-full accent-brand-orange"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Light</span>
                <span>Opaque</span>
              </div>
            </div>
          </>
        );

      case "protect-pdf":
        return (
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={options.password || ""}
              onChange={(e) => setOption("password", e.target.value)}
              placeholder="Enter password to protect PDF"
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
            />
          </div>
        );

      default:
        return null;
    }
  };

  /* ---- Render: Action Area --------------------------------------- */

  const renderActionArea = () => {
    if (!currentTool) return null;
    const c = getColor(currentTool.color);
    const Icon = currentTool.icon;
    const totalInputSize = files.reduce((acc, f) => acc + f.size, 0);

    return (
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {/* Back + Tool header */}
        <div className="flex items-start gap-4">
          <button
            onClick={goBack}
            className="p-2 rounded-lg bg-dark-700 border border-dark-500 hover:border-dark-400 text-gray-400 hover:text-white transition-colors flex-shrink-0 mt-0.5"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-lg ${c.bg} flex-shrink-0`}>
              <Icon size={22} className={c.text} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{currentTool.name}</h2>
              <p className="text-sm text-gray-400">{currentTool.desc}</p>
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-brand-orange bg-orange-500/5"
              : "border-dark-500 hover:border-dark-400 bg-dark-800/50"
          }`}
        >
          <Upload
            size={36}
            className={`mx-auto mb-3 ${dragOver ? "text-brand-orange" : "text-gray-500"}`}
          />
          <p className="text-sm text-gray-300 mb-1">
            {currentTool.multiple
              ? "Drop files here or click to browse"
              : "Drop a file here or click to browse"}
          </p>
          <p className="text-xs text-gray-500">
            Accepted: {currentTool.accepts}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={currentTool.accepts}
            multiple={!!currentTool.multiple}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-medium">
              {files.length} file{files.length !== 1 ? "s" : ""} selected
              {" \u00B7 "}
              {formatFileSize(totalInputSize)}
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between bg-dark-700/50 border border-dark-500/30 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-200 truncate">
                      {f.name}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatFileSize(f.size)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="inline-btn p-1 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tool-specific options */}
        {renderOptions()}

        {/* Process button */}
        <button
          onClick={processFile}
          disabled={processing || files.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Processing...
            </>
          ) : (
            "Process"
          )}
        </button>

        {/* Result */}
        {resultBlob && (
          <div className="bg-dark-800 border border-green-500/30 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-green-400">
              <Check size={18} />
              <span className="text-sm font-semibold">Processing Complete</span>
            </div>

            {/* File size comparison for compress */}
            {currentTool.id === "compress-pdf" && resultSize !== null && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-dark-700/50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-white">
                    {formatFileSize(totalInputSize)}
                  </p>
                  <p className="text-[10px] text-gray-400">Original</p>
                </div>
                <div className="bg-dark-700/50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-green-400">
                    {formatFileSize(resultSize)}
                  </p>
                  <p className="text-[10px] text-gray-400">Compressed</p>
                </div>
                <div className="bg-dark-700/50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-green-400">
                    {totalInputSize > 0
                      ? `-${Math.round(
                          ((totalInputSize - resultSize) / totalInputSize) * 100
                        )}%`
                      : "0%"}
                  </p>
                  <p className="text-[10px] text-gray-400">Savings</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between bg-dark-700/50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-200 truncate">
                  {resultName}
                </span>
                {resultSize !== null && (
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {formatFileSize(resultSize)}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={downloadResult}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Download size={16} />
              Download Result
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ---- Main Render ------------------------------------------------ */

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-dark-500/30 bg-dark-800/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Files size={24} className="text-brand-orange" />
          <div>
            <h1 className="text-xl font-bold text-white">iKo Doc-Handler</h1>
            <p className="text-xs text-gray-400">PDF &amp; Document Tools</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6">
          {activeTool ? renderActionArea() : renderToolGrid()}
        </div>
      </div>
    </div>
  );
}
