import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";
import { saveAuth } from "../utils/auth";
import Logo from "../components/Logo";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiPost("/api/auth/login", { email, password });
      saveAuth(res.access_token, res.user);
      toast.success("Welcome back!");
      navigate("/chat");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="mb-2">
            <Logo size="lg" />
          </h1>
          <p className="text-gray-400">Your Intelligent Research Co-Pilot</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-dark-800 rounded-xl p-8 border border-dark-500/30"
        >
          <h2 className="text-xl font-semibold mb-6">Sign in</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                placeholder="you@university.edu"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                placeholder="********"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full bg-brand-orange hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogIn size={18} />
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="mt-4 text-center text-sm text-gray-400">
            Don't have an account?{" "}
            <Link to="/register" className="text-brand-blue hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
