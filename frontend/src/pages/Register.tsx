import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";
import { saveAuth } from "../utils/auth";
import Logo from "../components/Logo";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    university: "",
    department: "",
    program: "",
  });
  const [loading, setLoading] = useState(false);

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiPost("/api/auth/register", {
        ...form,
        program: form.program || null,
      });
      saveAuth(res.access_token, res.user);
      toast.success("Account created! You have a 7-day free trial.");
      navigate("/chat");
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="mb-2">
            <Logo size="lg" />
          </h1>
          <p className="text-gray-400">Start your 7-day free trial</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-dark-800 rounded-xl p-8 border border-dark-500/30"
        >
          <h2 className="text-xl font-semibold mb-6">Create account</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Full name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={update("full_name")}
                required
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={update("email")}
                required
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                placeholder="you@university.edu"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={update("password")}
                required
                minLength={8}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                placeholder="Min 8 characters"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">University</label>
                <input
                  type="text"
                  value={form.university}
                  onChange={update("university")}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Program</label>
                <select
                  value={form.program}
                  onChange={update("program")}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
                >
                  <option value="">Select...</option>
                  <option value="PhD">PhD</option>
                  <option value="MSc">MSc</option>
                  <option value="MA">MA</option>
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full bg-brand-orange hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <UserPlus size={18} />
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="mt-4 text-center text-sm text-gray-400">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-blue hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
