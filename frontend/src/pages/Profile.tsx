import { useState, useEffect } from "react";
import { User, CreditCard, Shield } from "lucide-react";
import toast from "react-hot-toast";
import { apiFetch, apiPut, apiPost } from "../utils/api";
import { getStoredUser, saveAuth, getStoredToken } from "../utils/auth";

const TIER_INFO: Record<string, { name: string; price: string; features: string[] }> = {
  free: {
    name: "Free Trial",
    price: "$0 / 7 days",
    features: ["5,000 tokens/day", "DeepSeek only", "1 project"],
  },
  starter: {
    name: "Starter",
    price: "$9.99/mo",
    features: ["50,000 tokens/day", "Claude + DeepSeek", "3 projects"],
  },
  pro: {
    name: "Pro",
    price: "$24.99/mo",
    features: [
      "200,000 tokens/day",
      "All 4 models",
      "Unlimited projects",
      "File upload",
    ],
  },
  lab_group: {
    name: "Lab Group",
    price: "$49.99/mo",
    features: [
      "500,000 tokens/day shared",
      "All 4 models",
      "5 seats",
      "Supervisor dashboard",
    ],
  },
};

export default function Profile() {
  const user = getStoredUser();
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    university: user?.university || "",
    department: user?.department || "",
    program: user?.program || "",
  });
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    apiFetch("/api/auth/subscription").then(setSubscription).catch(() => {});
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await apiPut("/api/auth/me", {
        ...form,
        program: form.program || null,
      });
      // Update stored user
      const token = getStoredToken();
      if (token) saveAuth(token, updated);
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const tierInfo = TIER_INFO[user?.subscription_tier || "free"];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <User size={24} className="text-brand-blue" />
        Profile
      </h1>

      {/* Profile form */}
      <form
        onSubmit={handleUpdate}
        className="bg-dark-800 border border-dark-500/30 rounded-xl p-6"
      >
        <h2 className="font-semibold mb-4">Personal information</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Full name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ""}
              disabled
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">University</label>
            <input
              type="text"
              value={form.university}
              onChange={(e) => setForm({ ...form, university: e.target.value })}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Program</label>
            <select
              value={form.program}
              onChange={(e) => setForm({ ...form, program: e.target.value })}
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
            >
              <option value="">Select...</option>
              <option value="PhD">PhD</option>
              <option value="MSc">MSc</option>
              <option value="MA">MA</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          className="mt-4 bg-brand-orange hover:bg-orange-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Save changes
        </button>
      </form>

      {/* Subscription */}
      <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <CreditCard size={18} className="text-brand-orange" />
          Subscription
        </h2>

        <div className="flex items-center gap-4 mb-4">
          <div className="bg-brand-orange/10 border border-brand-orange/20 rounded-lg px-4 py-3 flex-1">
            <p className="text-brand-orange font-semibold">{tierInfo?.name}</p>
            <p className="text-sm text-gray-400">{tierInfo?.price}</p>
          </div>
          {subscription && (
            <div className="flex-1">
              <p className="text-sm text-gray-400">
                Tokens today:{" "}
                <span className="text-white">
                  {subscription.tokens_used_today?.toLocaleString()} / {subscription.tokens_per_day?.toLocaleString()}
                </span>
              </p>
              <p className="text-sm text-gray-400">
                Models:{" "}
                <span className="text-white">
                  {subscription.allowed_providers?.join(", ")}
                </span>
              </p>
            </div>
          )}
        </div>

        {tierInfo?.features && (
          <ul className="text-sm text-gray-400 space-y-1">
            {tierInfo.features.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <Shield size={12} className="text-brand-blue" />
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
