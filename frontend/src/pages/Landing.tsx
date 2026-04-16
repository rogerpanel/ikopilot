import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  FlaskConical,
  BarChart3,
  PenTool,
  FileText,
  Target,
  List,
  TrendingUp,
  Sparkles,
  CheckCircle,
  ArrowRight,
  GraduationCap,
  Search,
  FileCode,
  Quote,
  MessageSquare,
  Layers,
  Edit3,
  Frame,
  Compass,
  Shield,
  UserCheck,
  FileBox,
  UserPlus,
  Rocket,
  Wand2,
  Briefcase,
} from "lucide-react";
import Logo from "../components/Logo";
import LLMComparison from "../components/LLMComparison";
import { isAuthenticated } from "../utils/auth";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Multi-LLM Chat",
    description:
      "4 AI models in one interface with research modes, file upload, and LaTeX output",
    color: "text-brand-orange",
  },
  {
    icon: Layers,
    title: "iKo All-in-One",
    description:
      "Complete thesis pipeline — from topic to polished document in 8 guided stages",
    color: "text-blue-400",
  },
  {
    icon: Edit3,
    title: "iKo Writer",
    description:
      "Writefull-style AI text polisher — removes AI patterns, fixes grammar, formats equations",
    color: "text-green-400",
  },
  {
    icon: Frame,
    title: "iKo Framework",
    description:
      "Generate TikZ, Mermaid, Draw.io diagrams and DALL-E scientific illustrations",
    color: "text-yellow-400",
  },
  {
    icon: Compass,
    title: "iKo Discover",
    description:
      "Auto-gap detector, debate mode, and citation graph for research intelligence",
    color: "text-purple-400",
  },
  {
    icon: Shield,
    title: "iKo Defense",
    description:
      "Examiner question generator, mock defense sessions, and presentation builder",
    color: "text-red-400",
  },
  {
    icon: UserCheck,
    title: "iKo Advisor",
    description:
      "AI research supervisor with field-specific guidance across all disciplines",
    color: "text-cyan-400",
  },
  {
    icon: FileBox,
    title: "iKo Doc-Handler",
    description:
      "PDF tools — convert, merge, split, compress, watermark, protect (like iLovePDF)",
    color: "text-pink-400",
  },
  {
    icon: Search,
    title: "Paper Search & Citations",
    description:
      "Search 200M+ papers, auto-generate BibTeX, format APA/IEEE/Harvard",
    color: "text-teal-400",
  },
];

const RESEARCH_MODES = [
  { icon: BookOpen, name: "Literature Review", color: "border-blue-500/30" },
  { icon: FlaskConical, name: "Methodology Advisor", color: "border-green-500/30" },
  { icon: BarChart3, name: "Data Analysis", color: "border-purple-500/30" },
  { icon: PenTool, name: "Writing Critic", color: "border-orange-500/30" },
  { icon: FileText, name: "Abstract Generator", color: "border-cyan-500/30" },
  { icon: Target, name: "Question Refiner", color: "border-red-500/30" },
  { icon: List, name: "Thesis Outline", color: "border-yellow-500/30" },
  { icon: TrendingUp, name: "Stats Interpreter", color: "border-pink-500/30" },
];

const TIERS = [
  {
    name: "Free Trial",
    price: "$0",
    period: "7 days",
    features: ["5,000 tokens/day", "DeepSeek AI", "1 project"],
    cta: "Start Free",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$9.99",
    period: "/month",
    features: ["50,000 tokens/day", "Claude + DeepSeek", "3 projects", "Chat history"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$24.99",
    period: "/month",
    features: [
      "200,000 tokens/day",
      "All 4 AI models",
      "Unlimited projects",
      "File upload (PDF, DOCX)",
      "Paper search & citations",
      "LaTeX output",
    ],
    cta: "Go Pro",
    highlight: true,
  },
  {
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
    cta: "Contact Us",
    highlight: false,
  },
];

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/chat");
    }
  }, []);

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-dark-900/95 backdrop-blur-sm border-b border-dark-500/20">
        <div className="flex items-center justify-between px-6 py-3 max-w-6xl mx-auto">
          <Logo size="md" />
          <div className="hidden md:flex items-center gap-1">
            {[
              { href: "#how", label: "How It Works" },
              { href: "#modes", label: "Research Modes" },
              { href: "#features", label: "Features" },
              { href: "#models", label: "AI Models" },
              { href: "#pricing", label: "Pricing" },
            ].map((tab) => (
              <a
                key={tab.href}
                href={tab.href}
                className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-dark-700 transition-colors"
              >
                {tab.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-2"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="text-sm bg-brand-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center px-6 pt-16 pb-20 max-w-4xl mx-auto">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight" style={{ fontFamily: "'Georgia', 'Cambria', serif", fontStyle: "italic" }}>
          Your Intelligent{" "}
          <span className="text-brand-orange">Research</span>{" "}
          <span className="text-brand-blue">Co-Pilot</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-8">
          Literature reviews, methodology advice, data analysis, academic
          writing, thesis defense prep, document tools, and research diagrams —
          powered by Claude, GPT-4o, Gemini, and DeepSeek.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/register"
            className="bg-brand-orange hover:bg-orange-600 text-white px-8 py-3 rounded-lg text-lg font-medium transition-colors flex items-center gap-2"
          >
            Start Free Trial
            <ArrowRight size={18} />
          </Link>
          <p className="text-sm text-gray-500">
            No credit card required · 7-day free trial
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="px-6 py-16 bg-dark-800/30 scroll-mt-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
            How It Works
          </h2>
          <p className="text-gray-400 text-center mb-10 max-w-xl mx-auto">
            From sign-up to submission in three simple steps
          </p>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-brand-orange/10 flex items-center justify-center mx-auto mb-4">
                <UserPlus size={24} className="text-brand-orange" />
              </div>
              <h3 className="font-semibold text-white mb-2">
                1. Sign up &amp; choose your level
              </h3>
              <p className="text-sm text-gray-400">
                BSc, MSc, or PhD — iKoPilot.com adapts to your academic level
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center mx-auto mb-4">
                <Rocket size={24} className="text-brand-blue" />
              </div>
              <h3 className="font-semibold text-white mb-2">
                2. Start your research
              </h3>
              <p className="text-sm text-gray-400">
                Use guided tools or free-form chat with 4 AI models
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <Wand2 size={24} className="text-green-400" />
              </div>
              <h3 className="font-semibold text-white mb-2">
                3. Polish &amp; export
              </h3>
              <p className="text-sm text-gray-400">
                Humanize your text, generate diagrams, export for submission
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Research Modes */}
      <section id="modes" className="px-6 py-16 max-w-5xl mx-auto scroll-mt-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
          8 Research Modes
        </h2>
        <p className="text-gray-400 text-center mb-10 max-w-xl mx-auto">
          Guided AI workflows designed for every stage of academic research
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {RESEARCH_MODES.map((mode) => (
            <div
              key={mode.name}
              className={`bg-dark-800 border ${mode.color} rounded-xl p-4 text-center`}
            >
              <mode.icon size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm font-medium text-white">{mode.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-16 bg-dark-800/30 scroll-mt-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
            Built for Academic Research
          </h2>
          <p className="text-gray-400 text-center mb-10 max-w-xl mx-auto">
            Everything you need from first draft to final submission
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="bg-dark-800 border border-dark-500/30 rounded-xl p-6"
              >
                <feature.icon size={24} className={`${feature.color} mb-3`} />
                <h3 className="font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Models Comparison */}
      <section id="models" className="px-6 py-16 max-w-5xl mx-auto scroll-mt-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
          4 AI Models, Each with Unique Strengths
        </h2>
        <p className="text-gray-400 text-center mb-10 max-w-xl mx-auto">
          Choose the right model for each task — or let iKoPilot.com guide you
        </p>
        <LLMComparison />
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-16 bg-dark-800/30 max-w-5xl mx-auto scroll-mt-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
          Simple Pricing
        </h2>
        <p className="text-gray-400 text-center mb-10">
          Start free, upgrade when you need more
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl p-6 border ${
                tier.highlight
                  ? "bg-brand-orange/5 border-brand-orange/30"
                  : "bg-dark-800 border-dark-500/30"
              }`}
            >
              {tier.highlight && (
                <span className="text-[10px] font-bold uppercase text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded mb-3 inline-block">
                  Most Popular
                </span>
              )}
              <h3 className="font-semibold text-white text-lg">{tier.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold text-white">
                  {tier.price}
                </span>
                <span className="text-sm text-gray-400">{tier.period}</span>
              </div>
              <ul className="space-y-2 mb-6">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="text-sm text-gray-400 flex items-start gap-2"
                  >
                    <CheckCircle
                      size={14}
                      className="text-green-400 mt-0.5 flex-shrink-0"
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`block text-center py-2 rounded-lg text-sm font-medium transition-colors ${
                  tier.highlight
                    ? "bg-brand-orange hover:bg-orange-600 text-white"
                    : "bg-dark-700 hover:bg-dark-600 text-white"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Who is it for */}
      <section className="px-6 py-16 bg-dark-800/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            Who is iKoPilot.com for?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <GraduationCap size={32} className="mx-auto text-brand-blue mb-3" />
              <h3 className="font-semibold text-white mb-1">
                Bachelor Students
              </h3>
              <p className="text-sm text-gray-400">
                Research projects, final year dissertations, term papers, and assignments
              </p>
            </div>
            <div>
              <GraduationCap size={32} className="mx-auto text-brand-orange mb-3" />
              <h3 className="font-semibold text-white mb-1">
                Master's Students
              </h3>
              <p className="text-sm text-gray-400">
                Thesis writing, literature reviews, methodology design, and data analysis
              </p>
            </div>
            <div>
              <GraduationCap size={32} className="mx-auto text-brand-blue mb-3" />
              <h3 className="font-semibold text-white mb-1">PhD Researchers</h3>
              <p className="text-sm text-gray-400">
                Dissertation chapters, publication prep, statistical interpretation, and peer review
              </p>
            </div>
            <div>
              <Briefcase size={32} className="mx-auto text-green-400 mb-3" />
              <h3 className="font-semibold text-white mb-1">
                Researchers &amp; Academics
              </h3>
              <p className="text-sm text-gray-400">
                Journal submissions, peer review preparation, grant proposals
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-10 border-t border-dark-500/30">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="text-sm text-gray-500">
              Your Intelligent Research Co-Pilot
            </span>
          </div>
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} iKoPilot.com. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
