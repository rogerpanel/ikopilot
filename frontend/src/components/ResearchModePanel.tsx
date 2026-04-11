import {
  BookOpen,
  FlaskConical,
  BarChart3,
  PenTool,
  FileText,
  Target,
  List,
  TrendingUp,
} from "lucide-react";

interface ResearchMode {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface ResearchModePanelProps {
  modes: ResearchMode[];
  activeMode: string | null;
  onSelect: (modeId: string | null) => void;
}

const ICONS: Record<string, any> = {
  BookOpen,
  Beaker: FlaskConical,
  BarChart: BarChart3,
  PenTool,
  FileText,
  Target,
  List,
  TrendingUp,
};

const MODE_COLORS: Record<string, string> = {
  literature_review: "border-blue-500/30 hover:border-blue-500/60",
  methodology_advisor: "border-green-500/30 hover:border-green-500/60",
  data_analysis: "border-purple-500/30 hover:border-purple-500/60",
  writing_critic: "border-orange-500/30 hover:border-orange-500/60",
  abstract_generator: "border-cyan-500/30 hover:border-cyan-500/60",
  question_refiner: "border-red-500/30 hover:border-red-500/60",
  thesis_outline: "border-yellow-500/30 hover:border-yellow-500/60",
  statistical_interpreter: "border-pink-500/30 hover:border-pink-500/60",
};

const MODE_ACTIVE_COLORS: Record<string, string> = {
  literature_review: "border-blue-500 bg-blue-500/10",
  methodology_advisor: "border-green-500 bg-green-500/10",
  data_analysis: "border-purple-500 bg-purple-500/10",
  writing_critic: "border-orange-500 bg-orange-500/10",
  abstract_generator: "border-cyan-500 bg-cyan-500/10",
  question_refiner: "border-red-500 bg-red-500/10",
  thesis_outline: "border-yellow-500 bg-yellow-500/10",
  statistical_interpreter: "border-pink-500 bg-pink-500/10",
};

export default function ResearchModePanel({
  modes,
  activeMode,
  onSelect,
}: ResearchModePanelProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {modes.map((mode) => {
        const Icon = ICONS[mode.icon] || FileText;
        const isActive = activeMode === mode.id;

        return (
          <button
            key={mode.id}
            onClick={() => onSelect(isActive ? null : mode.id)}
            className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-all ${
              isActive
                ? MODE_ACTIVE_COLORS[mode.id] || "border-brand-orange bg-brand-orange/10"
                : MODE_COLORS[mode.id] || "border-dark-500/30 hover:border-dark-400"
            }`}
          >
            <Icon size={18} className={isActive ? "text-white" : "text-gray-400"} />
            <div>
              <p className={`text-xs font-medium ${isActive ? "text-white" : "text-gray-300"}`}>
                {mode.name}
              </p>
              <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5">
                {mode.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
