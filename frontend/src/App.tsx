import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { isAuthenticated, isAdmin } from "./utils/auth";
import { getStoredUser } from "./utils/auth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Chat from "./pages/Chat";
import Projects from "./pages/Projects";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Supervisor from "./pages/Supervisor";
import Billing from "./pages/Billing";
import AllInOne from "./pages/AllInOne";
import Humanizer from "./pages/Humanizer";
import Framework from "./pages/Framework";
import Discover from "./pages/Discover";
import Defense from "./pages/Defense";
import Advisor from "./pages/Advisor";
import DocHandler from "./pages/DocHandler";
import Docs from "./pages/Docs";
import LitReview from "./pages/LitReview";
import JournalWriter from "./pages/JournalWriter";
import LangLearner from "./pages/LangLearner";
import Layout from "./components/Layout";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() && isAdmin() ? (
    <>{children}</>
  ) : (
    <Navigate to="/chat" />
  );
}

function SupervisorRoute({ children }: { children: React.ReactNode }) {
  const user = getStoredUser();
  const allowed = user?.role === "admin" || user?.role === "supervisor";
  return isAuthenticated() && allowed ? <>{children}</> : <Navigate to="/chat" />;
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1f2937",
            color: "#fff",
            border: "1px solid #374151",
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route path="chat" element={<Chat />} />
          <Route path="chat/:conversationId" element={<Chat />} />
          <Route path="projects" element={<Projects />} />
          <Route path="profile" element={<Profile />} />
          <Route path="billing" element={<Billing />} />
          <Route path="all-in-one" element={<AllInOne />} />
          <Route path="humanizer" element={<Humanizer />} />
          <Route path="framework" element={<Framework />} />
          <Route path="discover" element={<Discover />} />
          <Route path="defense" element={<Defense />} />
          <Route path="advisor" element={<Advisor />} />
          <Route path="doc-handler" element={<DocHandler />} />
          <Route path="lit-review" element={<LitReview />} />
          <Route path="journal" element={<JournalWriter />} />
          <Route path="lang-learner" element={<LangLearner />} />
          <Route path="docs" element={<Docs />} />
          <Route
            path="supervisor"
            element={
              <SupervisorRoute>
                <Supervisor />
              </SupervisorRoute>
            }
          />
          <Route
            path="admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}
