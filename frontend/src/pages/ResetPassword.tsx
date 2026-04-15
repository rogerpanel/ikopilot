import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Lock, ArrowLeft, CheckCircle, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost } from "../utils/api";
import Logo from "../components/Logo";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await apiPost("/api/auth/reset-password", {
        token,
        new_password: password,
      });
      setSuccess(true);
      toast.success("Password reset successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
      toast.error(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="mb-2">
              <Logo size="lg" />
            </h1>
          </div>
          <div className="bg-dark-800 rounded-xl p-8 border border-dark-500/30 text-center">
            <AlertTriangle size={48} className="text-yellow-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid reset link</h2>
            <p className="text-gray-400 text-sm mb-6">
              This password reset link is invalid or missing a token. Please
              request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block bg-brand-orange hover:bg-orange-600 text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
            >
              Request new link
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
          {!success ? (
            <>
              <h2 className="text-xl font-semibold mb-2">Set new password</h2>
              <p className="text-gray-400 text-sm mb-6">
                Enter your new password below. It must be at least 8 characters.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      New password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                      placeholder="Min. 8 characters"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Confirm password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 w-full bg-brand-orange hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Lock size={18} />
                  {loading ? "Resetting..." : "Reset password"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Password reset!</h2>
              <p className="text-gray-400 text-sm mb-6">
                Your password has been updated successfully. You can now sign in
                with your new password.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="w-full bg-brand-orange hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg transition-colors"
              >
                Sign in
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
