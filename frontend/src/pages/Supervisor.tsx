import { useState, useEffect } from "react";
import {
  Users,
  BarChart3,
  FolderKanban,
  Activity,
  MessageSquare,
  ChevronRight,
  Mail,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiFetch } from "../utils/api";

interface Mentee {
  id: number;
  full_name: string;
  email: string;
  university: string;
  department: string;
  program: string | null;
  subscription_tier: string;
  tokens_used_today: number;
  tokens_used_month: number;
  project_count: number;
  conversation_count: number;
  last_login: string | null;
}

interface MenteeUsage {
  mentee: { id: number; full_name: string; tokens_used_today: number; tokens_used_month: number };
  recent_usage: {
    provider: string;
    model: string;
    tokens_input: number;
    tokens_output: number;
    cost_usd: number;
    timestamp: string;
  }[];
}

interface MenteeProject {
  id: number;
  title: string;
  description: string;
  research_field: string;
  created_at: string;
  updated_at: string;
}

export default function Supervisor() {
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMentee, setSelectedMentee] = useState<number | null>(null);
  const [menteeProjects, setMenteeProjects] = useState<MenteeProject[]>([]);
  const [menteeUsage, setMenteeUsage] = useState<MenteeUsage | null>(null);
  const [tab, setTab] = useState<"overview" | "projects" | "usage">("overview");

  useEffect(() => {
    apiFetch("/api/supervisor/mentees")
      .then((data) => {
        setMentees(data);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err.message);
        setLoading(false);
      });
  }, []);

  const selectMentee = async (id: number) => {
    setSelectedMentee(id);
    setTab("overview");
    try {
      const [projects, usage] = await Promise.all([
        apiFetch(`/api/supervisor/mentees/${id}/projects`),
        apiFetch(`/api/supervisor/mentees/${id}/usage`),
      ]);
      setMenteeProjects(projects);
      setMenteeUsage(usage);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const selectedMenteeData = mentees.find((m) => m.id === selectedMentee);

  return (
    <div className="flex h-full">
      {/* Mentee list */}
      <div className="w-72 border-r border-dark-500/30 flex flex-col bg-dark-800/50">
        <div className="p-4 border-b border-dark-500/30">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Users size={18} className="text-brand-blue" />
            My Mentees
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {mentees.length} student{mentees.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-gray-500 text-sm py-8">Loading...</p>
          ) : mentees.length === 0 ? (
            <div className="text-center py-8 px-4">
              <Users size={32} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-500">No mentees assigned yet</p>
              <p className="text-xs text-gray-600 mt-1">
                Students can set you as their supervisor in their profile
              </p>
            </div>
          ) : (
            mentees.map((mentee) => (
              <div
                key={mentee.id}
                onClick={() => selectMentee(mentee.id)}
                className={`px-4 py-3 cursor-pointer border-b border-dark-500/10 transition-colors ${
                  selectedMentee === mentee.id
                    ? "bg-brand-blue/10 border-l-2 border-l-brand-blue"
                    : "hover:bg-dark-700"
                }`}
              >
                <p className="text-sm font-medium text-white">{mentee.full_name}</p>
                <p className="text-xs text-gray-500">{mentee.email}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                  <span>{mentee.program || "Student"}</span>
                  <span>{mentee.project_count} projects</span>
                  <span>{mentee.conversation_count} chats</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Mentee detail */}
      <div className="flex-1 overflow-y-auto">
        {!selectedMenteeData ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <Users size={48} className="mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400">Select a mentee to view their progress</p>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {selectedMenteeData.full_name}
                </h2>
                <p className="text-sm text-gray-400">
                  {selectedMenteeData.program || "Student"} · {selectedMenteeData.department || selectedMenteeData.university || ""}
                </p>
              </div>
              <a
                href={`mailto:${selectedMenteeData.email}`}
                className="flex items-center gap-1 text-sm text-brand-blue hover:underline"
              >
                <Mail size={14} />
                Email
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatCard label="Projects" value={selectedMenteeData.project_count} icon={FolderKanban} />
              <StatCard label="Conversations" value={selectedMenteeData.conversation_count} icon={MessageSquare} />
              <StatCard label="Tokens today" value={selectedMenteeData.tokens_used_today.toLocaleString()} icon={Activity} />
              <StatCard label="Tokens this month" value={selectedMenteeData.tokens_used_month.toLocaleString()} icon={BarChart3} />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {(["overview", "projects", "usage"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                    tab === t
                      ? "bg-brand-blue text-white"
                      : "bg-dark-700 text-gray-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "overview" && (
              <div className="space-y-4">
                <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Recent Activity</h3>
                  {menteeUsage?.recent_usage.slice(0, 5).map((u, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-dark-500/10 last:border-0">
                      <div>
                        <p className="text-sm text-white">{u.provider} · {u.model}</p>
                        <p className="text-xs text-gray-500">
                          {u.tokens_input + u.tokens_output} tokens · ${u.cost_usd.toFixed(4)}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500">
                        {u.timestamp ? new Date(u.timestamp).toLocaleDateString() : ""}
                      </p>
                    </div>
                  )) || <p className="text-sm text-gray-500">No recent activity</p>}
                </div>
              </div>
            )}

            {tab === "projects" && (
              <div className="space-y-3">
                {menteeProjects.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4">No projects yet</p>
                ) : (
                  menteeProjects.map((p) => (
                    <div key={p.id} className="bg-dark-800 border border-dark-500/30 rounded-xl p-4">
                      <h3 className="font-medium text-white">{p.title}</h3>
                      {p.research_field && (
                        <span className="inline-block text-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded mt-1">
                          {p.research_field}
                        </span>
                      )}
                      {p.description && (
                        <p className="text-sm text-gray-400 mt-2">{p.description}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Updated {new Date(p.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "usage" && menteeUsage && (
              <div className="bg-dark-800 border border-dark-500/30 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-500/30 text-gray-400 text-left">
                      <th className="px-4 py-2">Provider</th>
                      <th className="px-4 py-2">Tokens</th>
                      <th className="px-4 py-2">Cost</th>
                      <th className="px-4 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menteeUsage.recent_usage.map((u, i) => (
                      <tr key={i} className="border-b border-dark-500/10">
                        <td className="px-4 py-2 text-white">{u.provider}</td>
                        <td className="px-4 py-2 text-gray-400">
                          {(u.tokens_input + u.tokens_output).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-gray-400">${u.cost_usd.toFixed(4)}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">
                          {u.timestamp ? new Date(u.timestamp).toLocaleString() : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={14} className="text-gray-500" />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
