import { generateText } from "ai";
import { getModel } from "./providers";

// Curated list of ~80 Phosphor icons that work well as large card visuals.
// Covers: tech, science, nature, people, arts, food, travel, business, etc.
export const ICON_CHOICES = [
  // Tech & Code
  "Code", "Terminal", "Desktop", "Robot", "Cpu", "Database", "Globe",
  "WifiHigh", "CloudArrowUp", "Shield", "Lock", "Key", "Bug",
  // Science & Learning
  "Brain", "Atom", "Dna", "Flask", "Microscope", "TestTube", "GraduationCap",
  "BookOpen", "MagnifyingGlass", "Lightbulb", "ChartLine",
  // Nature & Environment
  "Tree", "Leaf", "Mountains", "Sun", "Moon", "Drop", "Wind",
  "Fire", "Snowflake", "Planet", "Waves",
  // People & Social
  "User", "Users", "Heart", "HandHeart", "Handshake", "Baby",
  "Person", "UsersThree",
  // Arts & Media
  "Camera", "FilmSlate", "Microphone", "MusicNote", "Palette",
  "PaintBrush", "Pen", "Notebook", "Newspaper", "VideoCamera",
  "Monitor", "Television",
  // Food & Drink
  "CookingPot", "Coffee", "Wine", "ForkKnife",
  // Travel & Places
  "Airplane", "Car", "Compass", "MapPin", "House", "Buildings",
  "Bridge", "Tent",
  // Business & Finance
  "CurrencyDollar", "Briefcase", "Megaphone", "Presentation",
  "Strategy", "Target", "Trophy", "Medal",
  // Health & Wellness
  "Heartbeat", "FirstAid", "Barbell", "Bicycle",
  // Misc
  "Lightning", "Sparkle", "Star", "Rocket", "Anchor",
  "Skull", "Ghost", "Alien", "Eye", "GameController",
  "Sword", "Crown", "Diamond", "Scales", "Hourglass",
  "Puzzle", "ChatCircle",
] as const;

export type IconName = (typeof ICON_CHOICES)[number];

const ICON_LIST_STR = ICON_CHOICES.join(", ");

/**
 * Uses a cheap model to pick the most fitting Phosphor icon for a script.
 * Returns an icon name string, or null on failure.
 */
export async function pickIconForScript(
  title: string,
  contentPreview: string
): Promise<string | null> {
  try {
    const model = getModel("openrouter", "google/gemini-2.0-flash-001");

    const { text } = await generateText({
      model,
      system: `You are an icon picker. Given a script title and content preview, respond with ONLY a single icon name from this list. No explanation, no punctuation — just the icon name.\n\nAvailable icons: ${ICON_LIST_STR}`,
      prompt: `Title: ${title}\n\nPreview: ${contentPreview.slice(0, 500)}`,
      temperature: 0,
    });

    const picked = text.trim();
    // Validate it's in our list (case-insensitive match)
    const match = ICON_CHOICES.find(
      (ic) => ic.toLowerCase() === picked.toLowerCase()
    );
    return match ?? null;
  } catch (e) {
    console.error("Failed to pick icon:", e);
    return null;
  }
}
