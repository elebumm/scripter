import type { CouncilMember } from "@/types/council";

export interface CouncilPersona {
  name: string;
  initials: string;
  color: string;
}

const COUNCIL_PERSONAS: Record<string, CouncilPersona> = {
  claude: { name: "The Pacing Expert", initials: "PE", color: "#3b82f6" },
  gpt: { name: "The Cynic", initials: "CY", color: "#ef4444" },
  gemini: { name: "Dialogue Smith", initials: "DS", color: "#f59e0b" },
  grok: { name: "Emotional Core", initials: "EM", color: "#8b5cf6" },
  deepseek: { name: "Structure Tech", initials: "ST", color: "#10b981" },
};

const FALLBACK_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#8b5cf6", "#10b981", "#ec4899", "#14b8a6", "#f97316"];

export function getCouncilPersona(modelId: string, modelName: string): CouncilPersona {
  const idLower = modelId.toLowerCase();
  for (const [key, persona] of Object.entries(COUNCIL_PERSONAS)) {
    if (idLower.includes(key)) return persona;
  }
  // Fallback: generate from model name
  const words = modelName.split(/[\s-]+/).filter(Boolean);
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : modelName.slice(0, 2).toUpperCase();
  // Deterministic color from name hash
  let hash = 0;
  for (let i = 0; i < modelName.length; i++) hash = (hash * 31 + modelName.charCodeAt(i)) | 0;
  const color = FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
  return { name: modelName, initials, color };
}

export const DESIGN = {
  colors: {
    primary: "#605e5c",
    foreground: "#2d3435",
    background: "#f9f9f9",
    muted: "#596061",
    border: "transparent",
  },
  fonts: {
    script: "var(--font-switzer)",
    ui: "var(--font-switzer)",
    heading: "var(--font-cabinet)",
    label: "var(--font-inter)",
  },
  glass: {
    bg: "bg-white/75",
    backdrop: "backdrop-blur-3xl",
    border: "border border-white/40",
    shadow: "shadow-[0_4px_30px_rgba(0,0,0,0.03)]",
  },
} as const;

export const DEFAULT_COUNCIL_MEMBERS: CouncilMember[] = [
  {
    id: "cynic",
    name: "The Cynic",
    icon: "AlertCircle",
    color: "#ef4444",
    profileId: null,
  },
  {
    id: "pacing-expert",
    name: "The Pacing Expert",
    icon: "Timer",
    color: "#3b82f6",
    profileId: null,
  },
  {
    id: "empath",
    name: "The Empath",
    icon: "Heart",
    color: "#22c55e",
    profileId: null,
  },
];
