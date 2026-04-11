import { useState, useRef } from "react";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiDelete } from "../utils/api";

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  extracted_text_preview?: string;
}

interface FileUploadProps {
  projectId: number;
  files: FileItem[];
  onFilesChange: (files: FileItem[]) => void;
  disabled?: boolean;
}

const FILE_ICONS: Record<string, string> = {
  ".pdf": "text-red-400",
  ".csv": "text-green-400",
  ".txt": "text-gray-400",
  ".docx": "text-blue-400",
  ".doc": "text-blue-400",
  ".md": "text-purple-400",
  ".tex": "text-yellow-400",
  ".bib": "text-yellow-400",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function FileUpload({
  projectId,
  files,
  onFilesChange,
  disabled = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", projectId.toString());

      const token = localStorage.getItem("ikopilot_token");
      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(body.detail);
      }

      const uploaded = await res.json();
      onFilesChange([
        ...files,
        {
          id: uploaded.id,
          name: uploaded.name,
          size: uploaded.size,
          type: uploaded.type,
        },
      ]);
      toast.success(`Uploaded ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      await apiDelete(`/api/files/${fileId}?project_id=${projectId}`);
      onFilesChange(files.filter((f) => f.id !== fileId));
      toast.success("File removed");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          accept=".pdf,.csv,.txt,.docx,.doc,.xlsx,.md,.tex,.bib"
          className="hidden"
          disabled={disabled || uploading}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex items-center gap-2 bg-dark-700 border border-dashed border-dark-400 rounded-lg px-4 py-3 text-sm text-gray-400 hover:border-brand-blue hover:text-white transition-colors w-full justify-center disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          {uploading ? "Uploading..." : "Upload file (PDF, CSV, DOCX, TXT)"}
        </button>
        {disabled && (
          <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
            <AlertCircle size={12} />
            File upload requires Pro or Lab Group plan
          </p>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 bg-dark-700/50 rounded-lg px-3 py-2 group"
            >
              <FileText
                size={16}
                className={FILE_ICONS[file.type] || "text-gray-400"}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{file.name}</p>
                <p className="text-[11px] text-gray-500">{formatSize(file.size)}</p>
              </div>
              <button
                onClick={() => handleDelete(file.id)}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity inline-btn"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
