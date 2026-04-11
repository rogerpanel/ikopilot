import { useState, useEffect } from "react";
import {
  Shield,
  Users,
  BarChart3,
  DollarSign,
  Activity,
  Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiFetch, apiPut } from "../utils/api";

interface DashboardData {
  total_users: number;
  active_users: number;
  new_users_this_week: number;
  users_by_tier: Record<string, number>;
  today: { tokens_input: number; tokens_output: number; cost_usd: number };
  month_cost_usd: number;
}

interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  university: string;
  role: string;
  subscription_tier: string;
  tokens_used_today: number;
  tokens_used_month: number;
  is_active: boolean;
  created_at: string | null;
  last_login: string | null;
}

export default function Admin() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"dashboard" | "users">("dashboard");

  useEffect(() => {
    apiFetch("/api/admin/dashboard").then(setDashboard).catch(() => {});
    loadUsers();
  }, []);

  const loadUsers = async (query = "") => {
    try {
      const params = query ? `?search=${encodeURIComponent(query)}` : "";
      const data = await apiFetch(`/api/admin/users${params}`);
      setUsers(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers(search);
  };

  const toggleActive = async (userId: number, currentActive: boolean) => {
    try {
      await apiPut(`/api/admin/users/${userId}`, {
        is_active: !currentActive,
      });
      toast.success(`User ${currentActive ? "deactivated" : "activated"}`);
      loadUsers(search);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const changeTier = async (userId: number, tier: string) => {
    try {
      await apiPut(`/api/admin/users/${userId}`, { subscription_tier: tier });
      toast.success("Tier updated");
      loadUsers(search);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Shield size={24} className="text-brand-orange" />
        Admin Dashboard
      </h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["dashboard", "users"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-brand-orange text-white"
                : "bg-dark-700 text-gray-400 hover:text-white"
            }`}
          >
            {t === "dashboard" ? "Overview" : "Users"}
          </button>
        ))}
      </div>

      {tab === "dashboard" && dashboard && (
        <div className="space-y-6">
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label="Total users"
              value={dashboard.total_users}
              color="text-brand-blue"
            />
            <StatCard
              icon={Activity}
              label="Active users"
              value={dashboard.active_users}
              color="text-green-400"
            />
            <StatCard
              icon={Users}
              label="New this week"
              value={dashboard.new_users_this_week}
              color="text-brand-orange"
            />
            <StatCard
              icon={DollarSign}
              label="Month cost"
              value={`$${dashboard.month_cost_usd.toFixed(2)}`}
              color="text-yellow-400"
            />
          </div>

          {/* Today's usage */}
          <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-brand-blue" />
              Today's API Usage
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-white">
                  {dashboard.today.tokens_input.toLocaleString()}
                </p>
                <p className="text-xs text-gray-400">Input tokens</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {dashboard.today.tokens_output.toLocaleString()}
                </p>
                <p className="text-xs text-gray-400">Output tokens</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-orange">
                  ${dashboard.today.cost_usd.toFixed(4)}
                </p>
                <p className="text-xs text-gray-400">Cost</p>
              </div>
            </div>
          </div>

          {/* Users by tier */}
          <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-6">
            <h3 className="font-semibold mb-4">Users by tier</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(dashboard.users_by_tier).map(([tier, count]) => (
                <div
                  key={tier}
                  className="bg-dark-700 rounded-lg p-3 text-center"
                >
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-xs text-gray-400 capitalize">{tier.replace("_", " ")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div>
          {/* Search */}
          <form onSubmit={handleSearch} className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full bg-dark-700 border border-dark-500 rounded-lg pl-10 pr-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-blue hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm"
            >
              Search
            </button>
          </form>

          {/* Users table */}
          <div className="bg-dark-800 border border-dark-500/30 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-500/30 text-gray-400 text-left">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Tokens today</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-dark-500/10 hover:bg-dark-700/50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{u.full_name}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-400 capitalize">
                        {u.role}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.subscription_tier}
                          onChange={(e) => changeTier(u.id, e.target.value)}
                          className="bg-dark-700 border border-dark-500 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="free">Free</option>
                          <option value="starter">Starter</option>
                          <option value="pro">Pro</option>
                          <option value="lab_group">Lab Group</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {u.tokens_used_today.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block w-2 h-2 rounded-full mr-1 ${
                            u.is_active ? "bg-green-400" : "bg-red-400"
                          }`}
                        />
                        <span className="text-gray-400 text-xs">
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive(u.id, u.is_active)}
                          className={`text-xs px-2 py-1 rounded ${
                            u.is_active
                              ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                              : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                          }`}
                        >
                          {u.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
