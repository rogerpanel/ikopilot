import { useState, useEffect } from "react";
import {
  FolderKanban,
  Plus,
  Trash2,
  MessageSquare,
  X,
  FileText,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiFetch, apiPost, apiDelete } from "../utils/api";
import { getStoredUser } from "../utils/auth";
import FileUpload from "../components/FileUpload";

interface Project {
  id: number;
  title: string;
  description: string;
  research_field: string;
  conversation_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [projectFiles, setProjectFiles] = useState<any[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    research_field: "",
  });
  const user = getStoredUser();
  const canUpload = ["pro", "lab_group"].includes(user?.subscription_tier || "");

  const loadProjects = async () => {
    try {
      const data = await apiFetch("/api/projects/");
      setProjects(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiPost("/api/projects/", form);
      toast.success("Project created");
      setShowCreate(false);
      setForm({ title: "", description: "", research_field: "" });
      loadProjects();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this project and all its conversations?")) return;
    try {
      await apiDelete(`/api/projects/${id}`);
      toast.success("Project deleted");
      loadProjects();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <FolderKanban size={24} className="text-brand-blue" />
            Projects
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Organize your research by project
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} />
          New project
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-dark-500/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New project</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
                  placeholder="e.g. Chapter 3 — Methodology"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Research field
                </label>
                <input
                  type="text"
                  value={form.research_field}
                  onChange={(e) =>
                    setForm({ ...form, research_field: e.target.value })
                  }
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
                  placeholder="e.g. Computer Science, Education"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={3}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none resize-none"
                  placeholder="Brief description of this research project"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-brand-orange hover:bg-orange-600 text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                Create project
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Project list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <FolderKanban size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No projects yet</p>
          <p className="text-gray-500 text-sm mt-1">
            Create a project to organize your research conversations
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const isExpanded = expandedId === project.id;
            return (
              <div
                key={project.id}
                className="bg-dark-800 border border-dark-500/30 rounded-xl overflow-hidden transition-colors"
              >
                <div
                  className="p-4 sm:p-5 cursor-pointer hover:bg-dark-700/30"
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedId(null);
                    } else {
                      setExpandedId(project.id);
                      apiFetch(`/api/files/project/${project.id}`)
                        .then(setProjectFiles)
                        .catch(() => setProjectFiles([]));
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <ChevronRight
                        size={16}
                        className={`text-gray-500 mt-1 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                      <div>
                        <h3 className="font-semibold text-white">{project.title}</h3>
                        {project.research_field && (
                          <span className="inline-block text-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded mt-1">
                            {project.research_field}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(project.id);
                      }}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {project.description && (
                    <p className="text-sm text-gray-400 mt-2 ml-6 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3 ml-6 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <MessageSquare size={12} />
                      {project.conversation_count} conversations
                    </span>
                    {project.updated_at && (
                      <span>
                        Updated{" "}
                        {new Date(project.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded: file upload section */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-dark-500/20 pt-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                      <FileText size={14} />
                      Research Files
                    </h4>
                    <FileUpload
                      projectId={project.id}
                      files={projectFiles}
                      onFilesChange={setProjectFiles}
                      disabled={!canUpload}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
