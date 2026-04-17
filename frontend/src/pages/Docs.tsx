import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronRight } from "lucide-react";

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-dark-500/30 rounded-xl overflow-hidden mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-3 bg-dark-800 hover:bg-dark-700/50 transition-colors text-left">
        <span className="font-semibold text-white text-sm">{title}</span>
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 py-4 bg-dark-800/30 text-sm text-gray-300 leading-relaxed space-y-3">{children}</div>}
    </div>
  );
}

export default function Docs() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">iKoPilot.com User Guide</h1>
        <p className="text-gray-400">Complete guide to all features — everything is <span className="text-green-400 font-semibold">free during public testing</span></p>
      </div>

      <Section title="🔬 Chat — Multi-LLM Research Assistant" defaultOpen={true}>
        <p>Chat with 4 AI models — <strong>Claude, GPT-4o, Gemini, and DeepSeek</strong> — through a single interface. Select your preferred model from the dropdown.</p>
        <p><strong>Features:</strong></p>
        <ul className="list-disc ml-5 space-y-1">
          <li>Upload files (PDF, DOCX, images) directly into chat for context</li>
          <li>Academic system prompt adapts to your level (BSc → PhD)</li>
          <li>Conversation history saved automatically</li>
          <li>Paper search sidebar for finding references while chatting</li>
          <li>Export conversations as Markdown</li>
        </ul>
      </Section>

      <Section title="⚡ iKo All-in-One — 8-Stage Research Pipeline">
        <p>Complete research paper workflow from topic selection to final references. Each stage uses the best-suited LLM automatically.</p>
        <p><strong>Stages:</strong> Topic & Research Question → Literature Review → Methodology → Data Analysis → Results → Discussion → Conclusion → References & Formatting</p>
        <p>Upload files for context, get decision checkpoints between stages, and export the full output.</p>
      </Section>

      <Section title="📚 iKo Lit-Review — Automated Literature Review">
        <p>Generate comprehensive literature reviews in 4 steps:</p>
        <ol className="list-decimal ml-5 space-y-1">
          <li><strong>Enter topic</strong> — LLM suggests 3 sub-topic breakdowns</li>
          <li><strong>Discover papers</strong> — searches OpenAlex, Semantic Scholar, CrossRef. Click any paper to preview its PDF in a split panel</li>
          <li><strong>Set specifications</strong> — target pages, citation style (APA/IEEE/Harvard), sections to exclude</li>
          <li><strong>Generate & Export</strong> — streamed literature review with proper citations. Export as PDF, DOCX, or LaTeX</li>
        </ol>
      </Section>

      <Section title="📰 iKo Journal — Write for Specific Publications">
        <p>Write articles targeting specific journals and conferences with reviewer-aware guidance.</p>
        <p><strong>Supported publishers:</strong> Elsevier (The Lancet, Energy Policy, Computers & Education), Springer Nature (Nature, BMC Public Health), IEEE (IEEE Access, TPAMI), Wiley, Taylor & Francis</p>
        <p><strong>Conferences:</strong> CVPR, ICRA, CHI, SIGMOD, MICCAI, EMBC, AGU, ISIE</p>
        <p>Each template includes required sections, word/abstract limits, reference style, and reviewer criteria. The compliance checker verifies your draft meets all requirements before submission.</p>
      </Section>

      <Section title="✏️ iKo Writer — Writefull-Style Text Polisher">
        <p>Remove AI writing patterns, fix grammar, and humanize academic text.</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Upload</strong> a PDF, DOCX, or LaTeX file — or paste text directly</li>
          <li><strong>Analyze</strong> — detect AI patterns with an estimated AI score</li>
          <li><strong>Humanize</strong> — corrections shown inline (red strikethrough for deletions, green underline for additions)</li>
          <li><strong>Export</strong> — download corrected document as DOCX with tracked changes or LaTeX</li>
          <li>3 intensity levels (light/medium/heavy) and 5 focus modes</li>
        </ul>
      </Section>

      <Section title="🎨 iKo Framework — Diagrams & Illustrations">
        <p>Generate professional academic diagrams in 4 modes:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>TikZ</strong> — LaTeX diagrams for research frameworks and flowcharts</li>
          <li><strong>Mermaid</strong> — flowcharts, sequence diagrams, Gantt charts</li>
          <li><strong>Draw.io</strong> — editable XML for system architectures</li>
          <li><strong>DALL-E</strong> — AI-generated scientific illustrations</li>
        </ul>
        <p>Attach reference files for context. Iteratively refine with feedback.</p>
      </Section>

      <Section title="📄 iKo Doc-Handler — PDF Tools">
        <p>10 document tools: PDF↔DOCX conversion, merge/split PDFs, compress, watermark, rotate, encrypt, image↔PDF conversion, PDF to images.</p>
      </Section>

      <Section title="🔍 iKo Discover — Research Intelligence">
        <p><strong>Gap Finder</strong> — paste a literature summary, AI identifies 5-10 research gaps with confidence scores, research questions, and suggested methodologies.</p>
        <p><strong>Debate Mode</strong> — input two contradicting papers, AI analyzes both sides with evidence quality ratings, agreements, contradictions, and balanced synthesis.</p>
        <p><strong>Citation Graph</strong> — visualize citation relationships between papers in your project.</p>
        <p>Export all results as Markdown.</p>
      </Section>

      <Section title="🎓 iKo Defense — Thesis Defense Prep">
        <p><strong>Question Generator</strong> — generates 10-15 examiner questions categorized by type (conceptual, methodological, results, critical, extension) with answer frameworks.</p>
        <p><strong>Mock Defense</strong> — simulate a defense session with 3 examiner styles: Supportive, Critical, or Devil's Advocate.</p>
        <p><strong>Presentation Builder</strong> — generates slide outlines with speaker notes and visual suggestions. 3 styles: minimal, detailed, visual.</p>
        <p>Adapts to your level (Bachelor's, Master's, PhD). Export all results.</p>
      </Section>

      <Section title="💬 iKo Advisor — AI Research Supervisor">
        <p>Chat with an AI research supervisor who knows all academic disciplines. Asks clarifying questions, diagnoses research problems, recommends specific iKoPilot.com tools, and provides field-specific advice.</p>
        <p>Attach files for context. Get tips specific to your research field. Export consultations.</p>
      </Section>

      <Section title="🧪 iKo DataLab — Data Analysis Platform">
        <p>Upload CSV/Excel datasets (up to 150MB) and perform full data analysis:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Explore</strong> — summary statistics, missing values, correlation heatmap</li>
          <li><strong>Visualize</strong> — 6 chart types: histogram, scatter, bar, box, line, pie</li>
          <li><strong>Analyze</strong> — T-test, ANOVA, Chi-square, Pearson/Spearman correlation, normality tests, Mann-Whitney U</li>
          <li><strong>ML</strong> — classification, regression, K-means clustering, PCA with metrics and feature importance</li>
          <li><strong>Interpret</strong> — AI explains every result in research context</li>
        </ul>
        <p>Export full reports as PDF, DOCX, or PNG. Results persist when navigating between pages.</p>
      </Section>

      <Section title="🌍 iKo LangLearner — Language Learning">
        <p>Interactive language learning for <strong>Russian, German, French, and Spanish</strong> using CEFR levels (A1→C1).</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>5 exercise types: multiple choice, fill-in-blank, translation, matching, sentence building</li>
          <li>Progress tracking: XP, streak days, accuracy percentage</li>
          <li>Lessons complete at 70%+ accuracy</li>
          <li>Russian fully available A1-B1 offline; other languages and levels use LLM generation</li>
        </ul>
      </Section>

      <Section title="📋 iKo Projects — Research Project Hub">
        <p>Organize your research into projects. Each project can have conversations, uploaded files, citations, and a progress tracker. Ask-this-PDF feature lets you query uploaded documents directly.</p>
      </Section>

      <Section title="🔎 Paper Search — 200M+ Academic Papers">
        <p>Search across OpenAlex, Semantic Scholar, and CrossRef. Available in the right sidebar on every page. Save papers to your project's citation library with auto-generated BibTeX. Export references in APA, IEEE, or Harvard format.</p>
      </Section>

      <Section title="⚙️ LLM Provider Selection">
        <p>Every AI-powered feature lets you choose which LLM to use:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Claude</strong> — best for analysis, writing quality, structured outputs</li>
          <li><strong>GPT-4o</strong> — best for image generation and general tasks</li>
          <li><strong>Gemini</strong> — fast, good for brainstorming and summaries</li>
          <li><strong>DeepSeek</strong> — cost-effective default, strong for coding and math</li>
        </ul>
      </Section>

      <Section title="💰 Pricing — Free During Public Testing">
        <p className="text-green-400 font-semibold">All features are completely free during the public testing phase.</p>
        <p>No credit card required. No feature restrictions. We'll introduce subscription plans later once the platform matures. Enjoy full access to all 4 LLMs, all tools, and unlimited file uploads.</p>
      </Section>

      <Section title="🔒 Privacy & Security">
        <p>Your data is isolated — no user can see another user's conversations, projects, or files. All data auto-deletes after 30 days. Secure JWT authentication with bcrypt password hashing. Password reset via email.</p>
      </Section>

      <Section title="📱 Works on Mobile">
        <p>iKoPilot.com is fully responsive. Both sidebars collapse on mobile. Install as a Progressive Web App (PWA) from your browser for an app-like experience.</p>
      </Section>

      <div className="mt-8 text-center">
        <p className="text-xs text-gray-600">iKoPilot.com v2.0 — Your Intelligent Research Co-Pilot</p>
        <p className="text-xs text-gray-600 mt-1">Need help? Contact admin@ikopilot.com</p>
      </div>
    </div>
  );
}
