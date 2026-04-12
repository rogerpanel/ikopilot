import { useState, useEffect } from "react";
import {
  CreditCard,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiFetch } from "../utils/api";
import { getStoredUser } from "../utils/auth";

interface UsageStats {
  total_conversations: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
  by_provider: Record<string, number>;
}

interface SubscriptionInfo {
  tier: string;
  tokens_per_day: number;
  tokens_used_today: number;
  tokens_used_month: number;
  allowed_providers: string[];
  max_projects: number;
  file_upload: boolean;
  subscription: {
    id: number;
    start_date: string | null;
    end_date: string | null;
    auto_renew: boolean;
  } | null;
}

const TIERS = [
  {
    id: "free",
    name: "Free Trial",
    price: "$0",
    period: "7 days",
    features: ["5,000 tokens/day", "DeepSeek only", "1 project"],
    color: "border-gray-500/30",
  },
  {
    id: "starter",
    name: "Starter",
    price: "$9.99",
    period: "/month",
    features: ["50,000 tokens/day", "Claude + DeepSeek", "3 projects", "Chat history & search"],
    color: "border-blue-500/30",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$24.99",
    period: "/month",
    features: [
      "200,000 tokens/day",
      "All 4 AI models",
      "Unlimited projects",
      "File upload",
      "Paper search & citations",
      "LaTeX output",
    ],
    color: "border-brand-orange/30",
    popular: true,
  },
  {
    id: "lab_group",
    name: "Lab Group",
    price: "$49.99",
    period: "/month",
    features: [
      "500,000 tokens/day shared",
      "All 4 AI models",
      "5 seats",
      "Supervisor dashboard",
      "Everything in Pro",
    ],
    color: "border-purple-500/30",
  },
];

const PROVIDER_COLORS: Record<string, string> = {
  claude: "bg-orange-500",
  gpt4o: "bg-green-500",
  gemini: "bg-blue-500",
  deepseek: "bg-purple-500",
};

export default function Billing() {
  const user = getStoredUser();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    apiFetch("/api/auth/subscription").then(setSubscription).catch(() => {});
    apiFetch("/api/history/stats").then(setStats).catch(() => {});
  }, []);

  const currentTier = user?.subscription_tier || "free";
  const tokensUsedPercent = subscription
    ? Math.min(100, (subscription.tokens_used_today / subscription.tokens_per_day) * 100)
    : 0;
  const isNearLimit = tokensUsedPercent > 80;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <CreditCard size={24} className="text-brand-orange" />
        Billing & Usage
      </h1>

      {/* Current usage overview */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Today's Token Usage</p>
          <p className="text-2xl font-bold text-white">
            {subscription?.tokens_used_today.toLocaleString() || 0}
          </p>
          <p className="text-xs text-gray-500">
            of {subscription?.tokens_per_day.toLocaleString() || 0}
          </p>
          {/* Progress bar */}
          <div className="mt-3 h-2 bg-dark-600 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isNearLimit ? "bg-red-500" : "bg-brand-blue"
              }`}
              style={{ width: `${tokensUsedPercent}%` }}
            />
          </div>
          {isNearLimit && (
            <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
              <AlertTriangle size={12} />
              {tokensUsedPercent >= 100
                ? "Daily limit reached"
                : "Approaching daily limit"}
            </p>
          )}
        </div>

        <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Monthly Tokens</p>
          <p className="text-2xl font-bold text-white">
            {subscription?.tokens_used_month.toLocaleString() || 0}
          </p>
          <p className="text-xs text-gray-500">total this month</p>
        </div>

        <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total Cost (All Time)</p>
          <p className="text-2xl font-bold text-white">
            ${stats?.total_cost_usd.toFixed(2) || "0.00"}
          </p>
          <p className="text-xs text-gray-500">
            {stats?.total_conversations || 0} conversations
          </p>
        </div>
      </div>

      {/* Usage by provider */}
      {stats && Object.keys(stats.by_provider).length > 0 && (
        <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <BarChart3 size={16} />
            Usage by Model
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.by_provider).map(([provider, count]) => {
              const total = Object.values(stats.by_provider).reduce((a, b) => a + b, 0);
              const percent = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={provider}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white capitalize">{provider}</span>
                    <span className="text-xs text-gray-500">
                      {count} conversations ({percent.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-dark-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        PROVIDER_COLORS[provider] || "bg-gray-500"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subscription plans */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Subscription Plans</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((tier) => {
            const isCurrent = currentTier === tier.id;
            return (
              <div
                key={tier.id}
                className={`rounded-xl p-5 border transition-colors ${
                  isCurrent
                    ? "bg-brand-orange/5 border-brand-orange/50"
                    : tier.popular
                    ? "bg-dark-800 border-brand-orange/20"
                    : `bg-dark-800 ${tier.color}`
                }`}
              >
                {tier.popular && !isCurrent && (
                  <span className="text-[10px] font-bold uppercase text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded mb-2 inline-block">
                    Most Popular
                  </span>
                )}
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase text-green-400 bg-green-500/10 px-2 py-0.5 rounded mb-2 inline-block">
                    Current Plan
                  </span>
                )}
                <h4 className="font-semibold text-white">{tier.name}</h4>
                <div className="mt-1 mb-3">
                  <span className="text-2xl font-bold text-white">{tier.price}</span>
                  <span className="text-sm text-gray-400">{tier.period}</span>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {tier.features.map((f) => (
                    <li key={f} className="text-xs text-gray-400 flex items-start gap-1.5">
                      <CheckCircle size={12} className="text-green-400 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button
                    className="w-full text-center py-2 rounded-lg text-sm font-medium bg-dark-700 hover:bg-dark-600 text-white transition-colors"
                    onClick={() =>
                      toast("Payment integration coming soon. Contact admin@ikopilot.com to upgrade.", {
                        icon: "i",
                        duration: 5000,
                      })
                    }
                  >
                    {TIERS.findIndex((t) => t.id === tier.id) >
                    TIERS.findIndex((t) => t.id === currentTier)
                      ? "Upgrade"
                      : "Downgrade"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Budget alert note */}
      <div className="bg-dark-800 border border-yellow-500/20 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-white mb-1">Budget Alerts</h3>
            <p className="text-sm text-gray-400">
              You'll receive a warning when you reach 80% of your daily token limit.
              Admins can monitor overall API spend from the admin dashboard.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              To upgrade your plan or set up payment, contact{" "}
              <a href="mailto:admin@ikopilot.com" className="text-brand-blue hover:underline">
                admin@ikopilot.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
