import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Sparkles,
  FolderKanban,
  PenTool,
  LayoutDashboard,
  Files,
  Search,
  GraduationCap,
  MessageCircle,
  Shield,
  Users,
  CreditCard,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  HelpCircle,
  BookOpenCheck,
} from "lucide-react";
import { clearAuth, getStoredUser, isAdmin } from "../utils/auth";
import Logo from "./Logo";
import ScholarSearch from "./ScholarSearch";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  const isSupervisor = user?.role === "admin" || user?.role === "supervisor";

  const mainSections: NavSection[] = [
    {
      label: "RESEARCH",
      items: [
        { to: "/chat", label: "Chat", icon: MessageSquare },
        { to: "/all-in-one", label: "iKo All-in-One", icon: Sparkles },
        { to: "/projects", label: "iKo Projects", icon: FolderKanban },
        { to: "/lit-review", label: "iKo Lit-Review", icon: BookOpenCheck },
      ],
    },
    {
      label: "TOOLS",
      items: [
        { to: "/humanizer", label: "iKo Writer", icon: PenTool },
        { to: "/framework", label: "iKo Framework", icon: LayoutDashboard },
        { to: "/doc-handler", label: "iKo Doc-Handler", icon: Files },
      ],
    },
    {
      label: "INTELLIGENCE",
      items: [
        { to: "/discover", label: "iKo Discover", icon: Search },
        { to: "/defense", label: "iKo Defense", icon: GraduationCap },
        { to: "/advisor", label: "iKo Advisor", icon: MessageCircle },
      ],
    },
  ];

  const accountItems: NavItem[] = [
    ...(isSupervisor
      ? [{ to: "/supervisor", label: "Mentees", icon: Users }]
      : []),
    ...(isAdmin()
      ? [{ to: "/admin", label: "Admin", icon: Shield }]
      : []),
    { to: "/billing", label: "Billing", icon: CreditCard },
    { to: "/docs", label: "User Guide", icon: HelpCircle },
  ];

  const renderNavLink = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-brand-orange/10 text-brand-orange"
            : "text-gray-400 hover:bg-dark-700 hover:text-white"
        }`
      }
    >
      <item.icon size={18} />
      {item.label}
    </NavLink>
  );

  const renderSectionLabel = (label: string) => (
    <div className="text-[10px] uppercase tracking-wider text-gray-600 px-3 py-2">
      {label}
    </div>
  );

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      {/* Mobile overlay for left sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile overlay for right sidebar */}
      {rightOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setRightOpen(false)}
        />
      )}

      {/* ===== LEFT SIDEBAR (220px) ===== */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[220px] bg-dark-800 border-r border-dark-500/30 flex flex-col transform transition-transform lg:transform-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-dark-500/30">
          <Logo size="md" />
          <button
            className="lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {mainSections.map((section) => (
            <div key={section.label}>
              {renderSectionLabel(section.label)}
              <div className="space-y-0.5">
                {section.items.map(renderNavLink)}
              </div>
            </div>
          ))}

          {/* ACCOUNT section */}
          {accountItems.length > 0 && (
            <div className="pt-2">
              {renderSectionLabel("ACCOUNT")}
              <div className="space-y-0.5">
                {accountItems.map(renderNavLink)}
              </div>
            </div>
          )}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-dark-500/30">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
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

      {/* ===== CENTER — Main Workspace ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden h-14 flex items-center justify-between px-4 border-b border-dark-500/30 bg-dark-800">
          <div className="flex items-center">
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
          <button
            onClick={() => setRightOpen(!rightOpen)}
            className="text-gray-400 hover:text-white"
          >
            <Search size={20} />
          </button>
        </div>

        {/* Desktop top bar with right sidebar toggle */}
        <div className="hidden lg:flex h-10 items-center justify-end px-4 border-b border-dark-500/20 bg-dark-800/50">
          <button
            onClick={() => setRightOpen(!rightOpen)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-dark-700"
          >
            <Search size={14} />
            <span>Papers</span>
            {rightOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* ===== RIGHT SIDEBAR (280px) — Context Panel ===== */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 lg:z-30 w-[280px] bg-dark-800 border-l border-dark-500/30 flex flex-col transform transition-transform ${
          rightOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="h-14 lg:h-10 flex items-center justify-between px-4 border-b border-dark-500/30">
          <span className="text-sm font-medium text-gray-300">
            Paper Search
          </span>
          <button
            onClick={() => setRightOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick access buttons */}
        <div className="flex gap-2 px-3 py-3 border-b border-dark-500/20">
          <button className="flex-1 text-[11px] font-medium px-2 py-1.5 rounded bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 transition-colors">
            Search Papers
          </button>
          <button className="flex-1 text-[11px] font-medium px-2 py-1.5 rounded bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600 transition-colors">
            My Citations
          </button>
          <button className="flex-1 text-[11px] font-medium px-2 py-1.5 rounded bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600 transition-colors">
            Usage Stats
          </button>
        </div>

        {/* Scholar Search content */}
        <div className="flex-1 overflow-y-auto">
          <ScholarSearch />
        </div>
      </aside>

      {/* Mobile floating button to open right sidebar */}
      {!rightOpen && (
        <button
          onClick={() => setRightOpen(true)}
          className="lg:hidden fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-brand-orange text-white shadow-lg flex items-center justify-center hover:bg-brand-orange/90 transition-colors"
        >
          <Search size={20} />
        </button>
      )}
    </div>
  );
}
