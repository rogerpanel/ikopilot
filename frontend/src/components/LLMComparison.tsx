/**
 * LLM Comparison component — shows each model's strengths with capability bars.
 */

interface ModelInfo {
  id: string;
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  tagline: string;
  description: string;
  bestFor: string[];
  capabilities: Record<string, number>; // 0-100
}

const MODELS: ModelInfo[] = [
  {
    id: "claude",
    name: "Claude",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    tagline: "Best for academic writing & complex reasoning",
    description:
      "Excels at nuanced academic writing, long-form thesis drafts, and careful argumentation. " +
      "Produces the best TikZ diagrams, Mermaid flowcharts, and LaTeX code for research figures. " +
      "Strong at literature synthesis and identifying subtle connections across sources.",
    bestFor: [
      "Academic writing & argumentation",
      "TikZ & Mermaid diagram code",
      "LaTeX formatting & equations",
      "Literature synthesis",
      "Ethical analysis & nuance",
      "Long-form content (chapters, proposals)",
    ],
    capabilities: {
      "Academic Writing": 95,
      "Code & Diagrams": 90,
      "Data Analysis": 80,
      "Image Generation": 20,
      "Reasoning": 95,
      "Citation Work": 85,
      "Speed": 70,
      "Cost Efficiency": 60,
    },
  },
  {
    id: "gpt4o",
    name: "GPT-4o",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    tagline: "Best for visual content & data analysis",
    description:
      "Strongest at generating research figures, architectural frameworks, conceptual diagrams, " +
      "and data visualizations via image generation. Excellent for statistical analysis with Python/R code, " +
      "and producing publication-ready tables. Best multimodal model — can analyze uploaded images and charts.",
    bestFor: [
      "Image generation (frameworks, diagrams)",
      "Data visualization & charts",
      "Python/R statistical code",
      "Multimodal (analyze images & figures)",
      "Research methodology design",
      "Publication-ready tables",
    ],
    capabilities: {
      "Academic Writing": 85,
      "Code & Diagrams": 85,
      "Data Analysis": 90,
      "Image Generation": 95,
      "Reasoning": 88,
      "Citation Work": 80,
      "Speed": 80,
      "Cost Efficiency": 55,
    },
  },
  {
    id: "gemini",
    name: "Gemini",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    tagline: "Best for quick research & fact-checking",
    description:
      "Ultra-fast responses ideal for quick fact-checking, research question brainstorming, " +
      "and rapid literature scanning. Connected to Google's knowledge, making it excellent for " +
      "finding recent papers and verifying claims. Best cost-to-speed ratio for iterative work.",
    bestFor: [
      "Quick fact-checking & verification",
      "Research question brainstorming",
      "Rapid literature scanning",
      "Current event research",
      "Multilingual content",
      "Large context window (long documents)",
    ],
    capabilities: {
      "Academic Writing": 75,
      "Code & Diagrams": 70,
      "Data Analysis": 75,
      "Image Generation": 60,
      "Reasoning": 80,
      "Citation Work": 75,
      "Speed": 95,
      "Cost Efficiency": 90,
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    tagline: "Best for coding & budget-friendly research",
    description:
      "Exceptional at programming tasks — SPSS syntax, R scripts, Python data analysis, " +
      "and LaTeX templates. The most cost-efficient model, using ~10x fewer credits than " +
      "Claude or GPT-4o. Perfect for iterative coding tasks and students on the Free or Starter plan.",
    bestFor: [
      "Programming (Python, R, SPSS)",
      "LaTeX templates & formatting",
      "Budget-friendly daily use",
      "Code debugging & optimization",
      "Mathematical proofs",
      "Data cleaning scripts",
    ],
    capabilities: {
      "Academic Writing": 70,
      "Code & Diagrams": 92,
      "Data Analysis": 85,
      "Image Generation": 10,
      "Reasoning": 82,
      "Citation Work": 65,
      "Speed": 85,
      "Cost Efficiency": 98,
    },
  },
];

const CAPABILITY_LABELS = [
  "Academic Writing",
  "Code & Diagrams",
  "Data Analysis",
  "Image Generation",
  "Reasoning",
  "Citation Work",
  "Speed",
  "Cost Efficiency",
];

const BAR_COLORS: Record<string, string> = {
  claude: "bg-orange-500",
  gpt4o: "bg-green-500",
  gemini: "bg-blue-500",
  deepseek: "bg-purple-500",
};

export default function LLMComparison() {
  return (
    <div className="space-y-8">
      {/* Model cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {MODELS.map((model) => (
          <div
            key={model.id}
            className={`rounded-xl border p-5 ${model.bgColor} ${model.borderColor}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-3 h-3 rounded-full ${BAR_COLORS[model.id]}`} />
              <h3 className={`text-lg font-bold ${model.color}`}>{model.name}</h3>
            </div>
            <p className="text-sm font-medium text-white mb-2">{model.tagline}</p>
            <p className="text-xs text-gray-400 leading-relaxed mb-3">
              {model.description}
            </p>
            <div className="space-y-1">
              {model.bestFor.map((item) => (
                <p key={item} className="text-xs text-gray-500 flex items-center gap-1.5">
                  <span className={`w-1 h-1 rounded-full ${BAR_COLORS[model.id]} flex-shrink-0`} />
                  {item}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Capability comparison chart */}
      <div className="bg-dark-800 border border-dark-500/30 rounded-xl p-5">
        <h3 className="text-lg font-semibold text-white mb-1">Capability Comparison</h3>
        <p className="text-xs text-gray-500 mb-5">
          How each model performs across research tasks
        </p>

        <div className="space-y-5">
          {CAPABILITY_LABELS.map((cap) => (
            <div key={cap}>
              <p className="text-sm text-gray-300 mb-2">{cap}</p>
              <div className="space-y-1.5">
                {MODELS.map((model) => {
                  const value = model.capabilities[cap] || 0;
                  return (
                    <div key={model.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-16 text-right flex-shrink-0">
                        {model.name}
                      </span>
                      <div className="flex-1 h-3 bg-dark-600 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${BAR_COLORS[model.id]} transition-all`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 w-7 flex-shrink-0">
                        {value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-dark-500/20">
          {MODELS.map((model) => (
            <div key={model.id} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${BAR_COLORS[model.id]}`} />
              <span className="text-xs text-gray-400">{model.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Smart routing tip */}
      <div className="bg-dark-800/50 border border-dark-500/20 rounded-xl p-4">
        <p className="text-sm text-gray-300 font-medium mb-1">
          Not sure which model to use?
        </p>
        <p className="text-xs text-gray-500">
          Start with <span className="text-purple-400">DeepSeek</span> for everyday tasks and coding (cheapest).
          Switch to <span className="text-orange-400">Claude</span> for academic writing and thesis work.
          Use <span className="text-green-400">GPT-4o</span> when you need diagrams or image analysis.
          Try <span className="text-blue-400">Gemini</span> for quick fact-checking and brainstorming.
        </p>
      </div>
    </div>
  );
}
