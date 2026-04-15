import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";
import Logo from "../components/Logo";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [registered, setRegistered] = useState<boolean | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiPost("/api/auth/forgot-password", { email });
      setRegistered(res.email_registered);
      setSent(true);
      if (res.email_registered) {
        toast.success("Reset link sent!");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
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

        <div className="bg-dark-800 rounded-xl p-8 border border-dark-500/30">
          {!sent ? (
            <>
              <h2 className="text-xl font-semibold mb-2">Forgot your password?</h2>
              <p className="text-gray-400 text-sm mb-6">
                Enter your email address and we'll send you a link to reset your
                password.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                    placeholder="you@university.edu"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-orange hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Mail size={18} />
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              {registered ? (
                <>
                  <div className="flex justify-center mb-4">
                    <CheckCircle size={48} className="text-green-400" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Check your email</h2>
                  <p className="text-gray-400 text-sm mb-2">
                    We've sent a password reset link to:
                  </p>
                  <p className="text-white font-medium mb-4">{email}</p>
                  <p className="text-gray-500 text-xs mb-6">
                    The link will expire in 1 hour. If you don't see the email,
                    check your spam folder or contact{" "}
                    <span className="text-brand-blue">admin@ikopilot.com</span>
                  </p>
                </>
              ) : (
                <>
                  <div className="flex justify-center mb-4">
                    <Mail size={48} className="text-gray-500" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    Email not found
                  </h2>
                  <p className="text-gray-400 text-sm mb-4">
                    No account is registered with{" "}
                    <span className="text-white font-medium">{email}</span>.
                  </p>
                  <p className="text-gray-500 text-sm mb-6">
                    Would you like to create an account instead?
                  </p>
                  <Link
                    to="/register"
                    className="inline-block bg-brand-blue hover:bg-blue-600 text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
                  >
                    Create account
                  </Link>
                </>
              )}

              <button
                onClick={() => {
                  setSent(false);
                  setRegistered(null);
                  setEmail("");
                }}
                className="mt-4 text-sm text-gray-400 hover:text-white transition-colors block mx-auto"
              >
                Try another email
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand-blue transition-colors"
            >
              <ArrowLeft size={14} />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
