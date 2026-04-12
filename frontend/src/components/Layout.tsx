import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  FolderKanban,
  User,
  Shield,
  LogOut,
  Menu,
  X,
  Users,
  CreditCard,
  Sparkles,
  PenTool,
  LayoutDashboard,
  Search,
  GraduationCap,
} from "lucide-react";
import { clearAuth, getStoredUser, isAdmin } from "../utils/auth";
import Logo from "./Logo";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  const isSupervisor = user?.role === "admin" || user?.role === "supervisor";

  const navItems = [
    { to: "/chat", label: "Chat", icon: MessageSquare },
    { to: "/all-in-one", label: "iKo All-in-One", icon: Sparkles },
    { to: "/humanizer", label: "iKo Writer", icon: PenTool },
    { to: "/framework", label: "iKo Framework", icon: LayoutDashboard },
    { to: "/discover", label: "iKo Discover", icon: Search },
    { to: "/defense", label: "iKo Defense", icon: GraduationCap },
    { to: "/projects", label: "iKo Projects", icon: FolderKanban },
    { to: "/billing", label: "Billing", icon: CreditCard },
    { to: "/profile", label: "Profile", icon: User },
    ...(isSupervisor
      ? [{ to: "/supervisor", label: "Mentees", icon: Users }]
      : []),
    ...(isAdmin()
      ? [{ to: "/admin", label: "Admin", icon: Shield }]
      : []),
  ];

  return (
    <div className="flex h-screen bg-dark-900">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-dark-800 border-r border-dark-500/30 flex flex-col transform transition-transform lg:transform-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-dark-500/30">
          <Logo size="md" />
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-orange/10 text-brand-orange"
                    : "text-gray-400 hover:bg-dark-700 hover:text-white"
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-dark-500/30">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: user?.avatar_color || "#3B82F6" }}
            >
              {user?.full_name?.charAt(0) || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.full_name}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {user?.subscription_tier} plan
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors w-full"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden h-14 flex items-center px-4 border-b border-dark-500/30 bg-dark-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
          >
            <Menu size={24} />
          </button>
          <span className="ml-4">
            <Logo size="sm" />
          </span>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
