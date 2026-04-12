import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { isAuthenticated, isAdmin } from "./utils/auth";
import { getStoredUser } from "./utils/auth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import Projects from "./pages/Projects";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Supervisor from "./pages/Supervisor";
import Billing from "./pages/Billing";
import AllInOne from "./pages/AllInOne";
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
