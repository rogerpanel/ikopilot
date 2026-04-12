import { useState, useEffect, useRef } from "react";
import {
  BookOpen, MessageSquare, Sparkles, FolderKanban, PenTool,
  LayoutDashboard, Search, GraduationCap, MessageCircle, Files,
  CreditCard, ChevronRight, HelpCircle,
} from "lucide-react";

const SECTIONS = [
  { id: "getting-started", title: "Getting Started", icon: HelpCircle },
  { id: "chat", title: "Chat", icon: MessageSquare },
  { id: "all-in-one", title: "iKo All-in-One", icon: Sparkles },
  { id: "writer", title: "iKo Writer", icon: PenTool },
  { id: "framework", title: "iKo Framework", icon: LayoutDashboard },
  { id: "discover", title: "iKo Discover", icon: Search },
  { id: "defense", title: "iKo Defense", icon: GraduationCap },
  { id: "advisor", title: "iKo Advisor", icon: MessageCircle },
  { id: "doc-handler", title: "iKo Doc-Handler", icon: Files },
  { id: "projects", title: "iKo Projects", icon: FolderKanban },
  { id: "papers", title: "Paper Search", icon: BookOpen },
  { id: "billing", title: "Billing & Account", icon: CreditCard },
];

export default function Docs() {
  const [active, setActive] = useState("getting-started");

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex h-full">
      {/* Table of Contents */}
      <div className="hidden lg:flex w-56 border-r border-dark-500/30 flex-col bg-dark-800/50 py-4 overflow-y-auto">
        <h3 className="text-xs uppercase tracking-wider text-gray-600 px-4 mb-3">User Guide</h3>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm text-left transition-colors ${
              active === s.id ? "text-brand-orange bg-brand-orange/5" : "text-gray-400 hover:text-white"
            }`}
          >
            <s.icon size={14} />
            {s.title}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-4xl">
        <h1 className="text-2xl font-bold text-white mb-1">iKopilot User Guide</h1>
        <p className="text-sm text-gray-400 mb-8">Your Intelligent Research Co-Pilot — complete documentation</p>

        <Section id="getting-started" title="Getting Started">
          <P>Create an account at <Code>/register</Code> with your university email. Choose your program level (BSc, BA, MSc, MA, PhD) — iKopilot adapts its responses to your academic level.</P>
          <P>Your 7-day free trial includes 5,000 tokens/day with DeepSeek. Upgrade to Starter ($9.99/mo) for Claude access, or Pro ($24.99/mo) for all 4 AI models, file upload, and premium features.</P>
          <Tip>Start with the Chat page for quick questions, or jump to iKo All-in-One if you need to write an entire thesis chapter.</Tip>
        </Section>

        <Section id="chat" title="Chat">
          <P>The main chat interface lets you talk to 4 AI models. Use the model selector (top-left) to switch between Claude, GPT-4o, Gemini, and DeepSeek mid-conversation.</P>
          <Sub>When to use each model</Sub>
          <P><strong className="text-orange-400">Claude</strong> — academic writing, TikZ/Mermaid code, literature synthesis. <strong className="text-green-400">GPT-4o</strong> — image generation, data visualization, multimodal analysis. <strong className="text-blue-400">Gemini</strong> — fast fact-checking, brainstorming. <strong className="text-purple-400">DeepSeek</strong> — coding (Python/R/SPSS), budget-friendly daily use.</P>
          <Sub>Research Modes</Sub>
          <P>Click any of the 8 research mode cards on the empty chat screen to open a guided workspace: Literature Review, Methodology Advisor, Data Analysis, Writing Critic, Abstract Generator, Question Refiner, Thesis Outline, Statistical Interpreter.</P>
          <Sub>File Attachments</Sub>
          <P>Click the paperclip icon next to the input to attach PDFs, DOCX, images, CSV files, LaTeX, or slides. The text is extracted and sent as context to the AI.</P>
          <Sub>LaTeX Toggle</Sub>
          <P>Click the <Code>LaTeX</Code> button in the header to switch responses to LaTeX format — copy directly into Overleaf.</P>
        </Section>

        <Section id="all-in-one" title="iKo All-in-One">
          <P className="text-yellow-400/80 text-xs">Premium feature — Pro or Lab Group plan required</P>
          <P>A complete 8-stage research pipeline that guides you from topic to polished document. Each stage uses the best AI model automatically.</P>
          <Sub>The 8 Stages</Sub>
          <P>1. Topic & Research Question (Claude) → 2. Literature Review (Claude) → 3. Methodology (Claude/DeepSeek) → 4. Data Analysis (DeepSeek) → 5. Discussion (Claude) → 6. Conclusion & Abstract (Claude) → 7. References (DeepSeek) → 8. Humanize & Polish (Claude)</P>
          <Sub>Decision Checkpoints</Sub>
          <P>After critical stages, you choose: proceed, narrow further, change direction, or run the humanizer. You control the research direction at every step.</P>
          <P>Upload files at any stage. Export your complete document as Markdown. Click "Open in iKo Writer" to polish the final text.</P>
        </Section>

        <Section id="writer" title="iKo Writer">
          <P>An AI text polisher inspired by Writefull. Paste your text, choose intensity (Light/Medium/Heavy) and focus (All/AI Patterns/Grammar/Flow/Hedging).</P>
          <Sub>What it fixes</Sub>
          <P>AI patterns: removes "delve", "crucial", "Furthermore", and 20+ overused AI phrases. Writefull corrections: "while"→"Although", "via"→"through", "gotten"→"obtained". Exaggerations: "very unique"→"unique". Articles, sentence length (targets 15-25 words), and equation formatting (plain text→LaTeX).</P>
          <Sub>AI Score</Sub>
          <P>Click "Analyze" first to get an AI detection score (0-100). Green (&lt;30) means low risk, yellow (30-60) medium, red (&gt;60) high. Then run "Humanize" to fix the issues.</P>
        </Section>

        <Section id="framework" title="iKo Framework">
          <P>Generate research diagrams and illustrations using 4 design modes:</P>
          <P><strong>TikZ Code</strong> (Claude) — compilable LaTeX for research papers. <strong>Mermaid</strong> (Claude) — flowcharts, sequence diagrams. <strong>AI Image Gen</strong> (GPT-4o/DALL-E) — scientific illustrations. <strong>Draw.io XML</strong> (Claude) — importable editable diagrams.</P>
          <P>Use the Design Chat panel (right side) to iteratively refine: "Make the arrows blue", "Add a feedback loop", "Enlarge the methodology box". Export as .tex, .mmd, .drawio, or PNG/JPG.</P>
        </Section>

        <Section id="discover" title="iKo Discover">
          <Sub>Gap Finder</Sub>
          <P>Enter your topic and a summary of existing literature. The AI identifies 5-10 specific research gaps with potential research questions, methodologies, and confidence scores.</P>
          <Sub>Debate Mode</Sub>
          <P>Paste text from two contradicting papers. The AI presents each side's claims with evidence quality assessment, identifies agreements and contradictions, and provides a balanced synthesis.</P>
          <Sub>Citation Graph</Sub>
          <P>Select a project to visualize connections between your saved citations — shared authors, methodologies, and sub-fields.</P>
        </Section>

        <Section id="defense" title="iKo Defense">
          <Sub>Question Generator</Sub>
          <P>Enter your thesis title, abstract, methodology, and findings. Get 10-15 examiner questions categorized by type (Conceptual, Methodological, Results, Critical, Extension) with difficulty ratings and answer frameworks.</P>
          <Sub>Mock Defense</Sub>
          <P>Choose an examiner style: Supportive, Critical, or Devil's Advocate. Practice answering questions in a chat-style interface with feedback on answer quality.</P>
          <Sub>Presentation Builder</Sub>
          <P>Generate a defense presentation outline with slide content, time allocation, and speaker notes. Choose minimal, detailed, or visual style.</P>
        </Section>

        <Section id="advisor" title="iKo Advisor">
          <P>Chat with an AI research supervisor who knows your field. Describe your challenge — topic selection, methodology confusion, writing block, data problems — and get field-specific guidance.</P>
          <P>The advisor recommends specific iKo tools for your situation and provides clickable links. Set your field (CS, Medicine, Humanities, etc.) and level for tailored advice.</P>
          <Tip>Use the Quick Tips feature to get field-specific research tips without spending tokens.</Tip>
        </Section>

        <Section id="doc-handler" title="iKo Doc-Handler">
          <P>10 document tools (like iLovePDF/SmallPDF):</P>
          <P>PDF→Word, Word→PDF, Merge PDFs, Split PDF, Compress PDF, Images→PDF, PDF→Images, Rotate Pages, Add Watermark, Protect PDF.</P>
          <P>Upload your file, set options (page ranges, compression quality, watermark text, etc.), and download the result. Max file size: 50MB.</P>
        </Section>

        <Section id="projects" title="iKo Projects">
          <P>Organize research by project. Each project stores conversations, files, and citations in one place.</P>
          <Sub>Ask this PDF</Sub>
          <P>Upload a paper to your project, then ask questions about it. The AI reads the full paper and answers based only on its content.</P>
          <Sub>Progress Tracker</Sub>
          <P>See chapter completion estimates, word counts, and citation coverage across your project's conversations.</P>
        </Section>

        <Section id="papers" title="Paper Search & Citations">
          <P>Search 200M+ academic papers across OpenAlex, Semantic Scholar, and CrossRef. Click "Add to project" to save citations.</P>
          <P>Auto-generated BibTeX for each paper. Export your project's citations as a .bib file for Overleaf. Format in APA, IEEE, or Harvard style.</P>
          <Tip>Access Paper Search from the right sidebar (click "Papers" in the top bar) or from the Chat page.</Tip>
        </Section>

        <Section id="billing" title="Billing & Account">
          <P>View your token usage (daily progress bar, monthly totals), see cost breakdown by model, and compare subscription plans.</P>
          <P><strong>Free</strong>: 5K tokens/day, DeepSeek, 1 project. <strong>Starter</strong> ($9.99): 50K/day, Claude+DeepSeek. <strong>Pro</strong> ($24.99): 200K/day, all models, file upload, premium features. <strong>Lab Group</strong> ($49.99): 500K/day shared, 5 seats, supervisor dashboard.</P>
          <P>Budget alerts warn you at 80% of daily limit. Data is retained for 30 days, then auto-deleted.</P>
        </Section>

        <div className="border-t border-dark-500/20 mt-12 pt-6 text-center">
          <p className="text-xs text-gray-600">iKopilot v1.0 — Your Intelligent Research Co-Pilot</p>
          <p className="text-xs text-gray-600 mt-1">Need help? Contact admin@ikopilot.com</p>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-300 mt-4 mb-1">{children}</h3>;
}

function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-gray-400 leading-relaxed ${className}`}>{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-dark-700 px-1.5 py-0.5 rounded text-brand-blue font-mono text-xs">{children}</code>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-brand-orange/5 border border-brand-orange/20 rounded-lg p-3 mt-2">
      <p className="text-xs text-brand-orange">{children}</p>
    </div>
  );
}
