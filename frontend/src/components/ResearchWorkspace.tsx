import { useState } from "react";
import {
  BookOpen,
  FlaskConical,
  BarChart3,
  PenTool,
  FileText,
  Target,
  List,
  TrendingUp,
  Send,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

interface ResearchWorkspaceProps {
  modeId: string;
  onSendMessage: (message: string) => void;
  onClose: () => void;
}

interface WorkspaceConfig {
  icon: any;
  name: string;
  color: string;
  bgColor: string;
  description: string;
  guideSteps: string[];
  fields: FieldConfig[];
  promptTemplate: (values: Record<string, string>) => string;
}

interface FieldConfig {
  id: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  required?: boolean;
}

const WORKSPACE_CONFIGS: Record<string, WorkspaceConfig> = {
  literature_review: {
    icon: BookOpen,
    name: "Literature Review",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    description: "Systematically analyze papers and identify research gaps",
    guideSteps: [
      "Define your research topic and scope",
      "List key papers or authors you've found",
      "Specify what you're looking for (gaps, themes, contradictions)",
    ],
    fields: [
      { id: "topic", label: "Research topic", placeholder: "e.g. Machine learning in healthcare diagnostics", type: "text", required: true },
      { id: "papers", label: "Key papers or authors (paste titles, DOIs, or author names)", placeholder: "e.g. Smith et al. 2023, 'Deep learning for X-ray analysis'\nDOI: 10.1234/example", type: "textarea" },
      { id: "focus", label: "What are you looking for?", placeholder: "", type: "select", options: ["Research gaps", "Thematic analysis", "Contradictions in findings", "Methodological comparison", "Theoretical frameworks", "Evolution of the field"] },
      { id: "scope", label: "Scope or constraints", placeholder: "e.g. Last 5 years, English-language only, focused on Sub-Saharan Africa", type: "text" },
    ],
    promptTemplate: (v) =>
      `I'm conducting a literature review on: "${v.topic}"\n\n` +
      (v.papers ? `Key papers/authors I've found:\n${v.papers}\n\n` : "") +
      (v.focus ? `I'm specifically looking for: ${v.focus}\n\n` : "") +
      (v.scope ? `Scope: ${v.scope}\n\n` : "") +
      `Please help me:\n1. Identify major themes and trends in this area\n2. Find potential research gaps\n3. Suggest how to organize these findings thematically\n4. Recommend additional search terms or databases to explore`,
  },
  methodology_advisor: {
    icon: FlaskConical,
    name: "Methodology Advisor",
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/30",
    description: "Get guidance on research methods for your question",
    guideSteps: [
      "State your research question clearly",
      "Describe your context and constraints",
      "The advisor will suggest appropriate methods",
    ],
    fields: [
      { id: "question", label: "Research question", placeholder: "e.g. How does social media usage affect academic performance among university students?", type: "textarea", required: true },
      { id: "level", label: "Academic level", placeholder: "", type: "select", options: ["Bachelor's project", "Master's thesis", "PhD dissertation", "Research paper"] },
      { id: "discipline", label: "Discipline", placeholder: "e.g. Education, Computer Science, Psychology", type: "text" },
      { id: "constraints", label: "Constraints (time, budget, access)", placeholder: "e.g. 3 months, no budget for software, access to 200 students", type: "textarea" },
      { id: "approach", label: "Leaning toward any approach?", placeholder: "", type: "select", options: ["Not sure yet", "Quantitative", "Qualitative", "Mixed methods", "Experimental", "Case study", "Survey-based"] },
    ],
    promptTemplate: (v) =>
      `I need methodology advice for my ${v.level || "research"}.\n\n` +
      `Research question: "${v.question}"\n` +
      (v.discipline ? `Discipline: ${v.discipline}\n` : "") +
      (v.constraints ? `Constraints: ${v.constraints}\n` : "") +
      (v.approach && v.approach !== "Not sure yet" ? `I'm leaning toward: ${v.approach}\n` : "") +
      `\nPlease suggest:\n1. Appropriate research design and methodology\n2. Sampling strategy and sample size\n3. Data collection instruments\n4. Analysis techniques\n5. Potential limitations and how to address them\n6. Ethical considerations`,
  },
  data_analysis: {
    icon: BarChart3,
    name: "Data Analysis Helper",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    description: "Get help analyzing your data and choosing statistical tests",
    guideSteps: [
      "Describe your data (type, sample size, variables)",
      "State your hypothesis or research question",
      "The helper will suggest appropriate analyses",
    ],
    fields: [
      { id: "datatype", label: "Data description", placeholder: "e.g. Survey data from 150 respondents, 20 Likert-scale questions, 3 demographic variables", type: "textarea", required: true },
      { id: "hypothesis", label: "Research question or hypothesis", placeholder: "e.g. Is there a significant relationship between X and Y?", type: "textarea" },
      { id: "variables", label: "Key variables", placeholder: "e.g. Independent: social media hours/day; Dependent: GPA; Control: age, gender", type: "textarea" },
      { id: "software", label: "Software you're using", placeholder: "", type: "select", options: ["SPSS", "R / RStudio", "Python (pandas/scipy)", "Excel", "Stata", "NVivo (qualitative)", "Not decided yet"] },
    ],
    promptTemplate: (v) =>
      `I need help analyzing my research data.\n\n` +
      `Data: ${v.datatype}\n` +
      (v.hypothesis ? `Research question/hypothesis: ${v.hypothesis}\n` : "") +
      (v.variables ? `Variables: ${v.variables}\n` : "") +
      (v.software ? `Software: ${v.software}\n` : "") +
      `\nPlease help me:\n1. Choose the right statistical test(s) and explain why\n2. Check assumptions I need to verify\n3. Walk me through the analysis steps\n4. Explain how to interpret the results\n5. Suggest appropriate visualizations`,
  },
  writing_critic: {
    icon: PenTool,
    name: "Writing Critic",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/30",
    description: "Get feedback on academic writing quality",
    guideSteps: [
      "Paste your text below",
      "Select what type of feedback you need",
      "The critic will review and suggest improvements",
    ],
    fields: [
      { id: "text", label: "Paste your text", placeholder: "Paste the section you want reviewed...", type: "textarea", required: true },
      { id: "section", label: "What section is this?", placeholder: "", type: "select", options: ["Introduction", "Literature review", "Methodology", "Results", "Discussion", "Conclusion", "Abstract", "Research proposal", "Assignment essay"] },
      { id: "feedback", label: "What feedback do you need?", placeholder: "", type: "select", options: ["Overall quality review", "Academic tone and formality", "Logical flow and argumentation", "Grammar and clarity", "Paragraph structure", "Citation usage", "All of the above"] },
    ],
    promptTemplate: (v) =>
      `Please review this ${v.section || "academic"} text as a writing critic.\n\n` +
      `Focus on: ${v.feedback || "overall quality"}\n\n` +
      `--- TEXT TO REVIEW ---\n${v.text}\n--- END ---\n\n` +
      `Please:\n1. Highlight strengths\n2. Identify weaknesses with specific examples\n3. Suggest concrete improvements (don't rewrite — explain what to fix)\n4. Rate overall academic quality (weak/adequate/good/strong)`,
  },
  abstract_generator: {
    icon: FileText,
    name: "Abstract Generator",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/30",
    description: "Generate a structured abstract from your draft",
    guideSteps: [
      "Provide your paper's key information",
      "The generator will create a structured abstract",
    ],
    fields: [
      { id: "title", label: "Paper title", placeholder: "e.g. Impact of Social Media on Academic Performance", type: "text", required: true },
      { id: "background", label: "Background/problem", placeholder: "What problem does your research address?", type: "textarea", required: true },
      { id: "objective", label: "Objective", placeholder: "What was the aim of your study?", type: "textarea" },
      { id: "methods", label: "Methods", placeholder: "How did you conduct the research?", type: "textarea" },
      { id: "results", label: "Key findings", placeholder: "What did you find?", type: "textarea" },
      { id: "conclusion", label: "Conclusion/implications", placeholder: "What does it mean? Why does it matter?", type: "textarea" },
    ],
    promptTemplate: (v) =>
      `Generate a structured academic abstract (150-300 words) for my paper.\n\n` +
      `Title: "${v.title}"\n` +
      `Background: ${v.background}\n` +
      (v.objective ? `Objective: ${v.objective}\n` : "") +
      (v.methods ? `Methods: ${v.methods}\n` : "") +
      (v.results ? `Key findings: ${v.results}\n` : "") +
      (v.conclusion ? `Conclusion: ${v.conclusion}\n` : "") +
      `\nPlease create a well-structured abstract following the standard format: Background, Objective, Methods, Results, Conclusion. Also suggest 4-6 keywords.`,
  },
  question_refiner: {
    icon: Target,
    name: "Research Question Refiner",
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/30",
    description: "Sharpen your research question",
    guideSteps: [
      "Share your initial topic or question idea",
      "The refiner will help you narrow it down",
    ],
    fields: [
      { id: "topic", label: "Your broad topic or initial question", placeholder: "e.g. I want to study how technology affects education", type: "textarea", required: true },
      { id: "level", label: "Academic level", placeholder: "", type: "select", options: ["Bachelor's project", "Master's thesis", "PhD dissertation", "Research paper"] },
      { id: "interest", label: "Specific aspect you're interested in", placeholder: "e.g. I'm particularly interested in mobile learning in rural areas", type: "textarea" },
      { id: "context", label: "Context (country, population, setting)", placeholder: "e.g. University students in Nigeria, public secondary schools in Kenya", type: "text" },
    ],
    promptTemplate: (v) =>
      `Help me refine my research question for a ${v.level || "research project"}.\n\n` +
      `Broad topic: ${v.topic}\n` +
      (v.interest ? `Specific interest: ${v.interest}\n` : "") +
      (v.context ? `Context: ${v.context}\n` : "") +
      `\nPlease:\n1. Evaluate my current question for specificity, feasibility, and significance\n2. Suggest 3-5 refined versions (progressively more focused)\n3. For each, identify the variables and suggest a theoretical framework\n4. Recommend sub-questions or hypotheses\n5. Flag any potential issues (too broad, unmeasurable, etc.)`,
  },
  thesis_outline: {
    icon: List,
    name: "Thesis Outline Builder",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10 border-yellow-500/30",
    description: "Create a chapter outline for your thesis or project",
    guideSteps: [
      "Provide your topic and research question",
      "The builder will create a detailed chapter outline",
    ],
    fields: [
      { id: "title", label: "Working title", placeholder: "e.g. The Role of AI in Early Disease Detection", type: "text", required: true },
      { id: "question", label: "Research question", placeholder: "Your main research question", type: "textarea", required: true },
      { id: "level", label: "Document type", placeholder: "", type: "select", options: ["Bachelor's project (3-4 chapters)", "Master's thesis (5-6 chapters)", "PhD dissertation (7-8 chapters)", "Research paper (sections)"] },
      { id: "methodology", label: "Planned methodology (if known)", placeholder: "e.g. Mixed methods: survey + interviews", type: "text" },
    ],
    promptTemplate: (v) =>
      `Create a detailed chapter outline for my ${v.level || "thesis"}.\n\n` +
      `Title: "${v.title}"\n` +
      `Research question: ${v.question}\n` +
      (v.methodology ? `Methodology: ${v.methodology}\n` : "") +
      `\nPlease provide:\n1. Chapter-by-chapter outline with subsections\n2. Brief description of what each section should cover\n3. Expected page/word count per chapter\n4. Key arguments or evidence to include\n5. How chapters connect to each other (logical flow)`,
  },
  statistical_interpreter: {
    icon: TrendingUp,
    name: "Statistical Interpreter",
    color: "text-pink-400",
    bgColor: "bg-pink-500/10 border-pink-500/30",
    description: "Explain statistical results in plain English",
    guideSteps: [
      "Paste your statistical output",
      "The interpreter will explain what it means",
    ],
    fields: [
      { id: "output", label: "Paste your statistical output", placeholder: "e.g. F(2, 147) = 4.32, p = .015, η² = .056\nor paste SPSS/R output", type: "textarea", required: true },
      { id: "test", label: "What test did you run?", placeholder: "", type: "select", options: ["Not sure", "t-test", "ANOVA", "Chi-square", "Correlation", "Regression", "Mann-Whitney U", "Kruskal-Wallis", "Factor analysis", "Other"] },
      { id: "context", label: "What were you testing?", placeholder: "e.g. Whether there's a difference in exam scores between group A and group B", type: "textarea" },
    ],
    promptTemplate: (v) =>
      `Please interpret these statistical results in plain English.\n\n` +
      (v.test && v.test !== "Not sure" ? `Test used: ${v.test}\n` : "") +
      (v.context ? `Research context: ${v.context}\n` : "") +
      `\nStatistical output:\n${v.output}\n\n` +
      `Please explain:\n1. What the numbers mean in simple language\n2. Whether the result is statistically significant and what that means\n3. The practical significance (effect size)\n4. How to report this in a results section (with APA format)\n5. Any caveats or limitations of this interpretation`,
  },
};

export default function ResearchWorkspace({
  modeId,
  onSendMessage,
  onClose,
}: ResearchWorkspaceProps) {
  const config = WORKSPACE_CONFIGS[modeId];
  const [values, setValues] = useState<Record<string, string>>({});

  if (!config) return null;

  const Icon = config.icon;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const message = config.promptTemplate(values);
    onSendMessage(message);
  };

  const updateField = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const isValid = config.fields
    .filter((f) => f.required)
    .every((f) => values[f.id]?.trim());

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`px-4 sm:px-6 py-4 border-b border-dark-500/30 ${config.bgColor}`}>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 -ml-1"
          >
            <ArrowLeft size={18} />
          </button>
          <Icon size={20} className={config.color} />
          <h2 className="text-lg font-semibold text-white">{config.name}</h2>
        </div>
        <p className="text-sm text-gray-400 ml-8">{config.description}</p>
      </div>

      {/* Guide steps */}
      <div className="px-4 sm:px-6 py-3 bg-dark-800/30 border-b border-dark-500/10">
        <div className="flex items-start gap-4 text-xs text-gray-500">
          {config.guideSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-1.5 flex-1">
              <span className="w-5 h-5 rounded-full bg-dark-600 text-gray-400 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                {i + 1}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4"
      >
        {config.fields.map((field) => (
          <div key={field.id}>
            <label className="block text-sm text-gray-300 mb-1.5">
              {field.label}
              {field.required && <span className="text-brand-orange ml-1">*</span>}
            </label>
            {field.type === "select" ? (
              <select
                value={values[field.id] || ""}
                onChange={(e) => updateField(field.id, e.target.value)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white focus:border-brand-blue focus:outline-none"
              >
                <option value="">Select...</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                value={values[field.id] || ""}
                onChange={(e) => updateField(field.id, e.target.value)}
                placeholder={field.placeholder}
                rows={field.id === "text" || field.id === "output" ? 8 : 3}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none resize-none"
              />
            ) : (
              <input
                type="text"
                value={values[field.id] || ""}
                onChange={(e) => updateField(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-blue focus:outline-none"
              />
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={!isValid}
          className="w-full bg-brand-orange hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Sparkles size={16} />
          Generate with AI
        </button>
      </form>
    </div>
  );
}
