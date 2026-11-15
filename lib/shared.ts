// Constants shared by server and client. No server imports here.
export const APP = "Fasih";
export const LEVELS = ["A1", "A2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"];
export const ROOMS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const roomOf = (level: string) => level.slice(0, 2);

export const MODES = [
  { id: "scene", emoji: "🎭", name: "Real-life scene", nameAr: "موقف من الحياة", how: "Role-play the scene. You play the other person; the learner plays themself." },
  { id: "story", emoji: "📖", name: "Story mode", nameAr: "وضع القصة", how: "Run an interactive story where the learner is the main character and decides what happens next." },
  { id: "debate", emoji: "⚔️", name: "Debate", nameAr: "مناظرة", how: "Take the opposite side of the statement and push back politely so the learner must argue." },
  { id: "rapid", emoji: "⚡", name: "Rapid fire", nameAr: "أسئلة سريعة", how: "Ask short quick questions one after another; ask for fast one-sentence answers." },
  { id: "guess", emoji: "🕵️", name: "Describe and guess", nameAr: "صِف وخمّن", how: "The learner describes the thing without naming it; you guess and ask clarifying questions." },
  { id: "tell", emoji: "💬", name: "Tell me about", nameAr: "حدّثني عن", how: "Ask the open question and follow up with curious, deeper questions." },
] as const;

export const PLANS: Record<string, { name: string; minutes: number; price: number }> = {
  trial: { name: "Trial", minutes: 10, price: 0 },
  starter: { name: "Starter", minutes: 10, price: 350 },
  plus: { name: "Plus", minutes: 20, price: 600 },
  pro: { name: "Pro", minutes: 40, price: 1100 },
};

export const VOICES = [
  ["Kore", "Firm"], ["Sulafat", "Warm"], ["Achird", "Friendly"], ["Puck", "Upbeat"], ["Vindemiatrix", "Gentle"], ["Charon", "Informative"],
  ["Aoede", "Breezy"], ["Iapetus", "Clear"], ["Leda", "Youthful"], ["Algieba", "Smooth"], ["Achernar", "Soft"], ["Sadaltager", "Knowledgeable"],
];

export const PALETTES = [
  { id: "Violet pop", brand: "#7c4dff", accent: "#ec4899" }, { id: "Ocean", brand: "#1e3a5f", accent: "#1d8fc1" },
  { id: "Sunset", brand: "#f97316", accent: "#e11d48" }, { id: "Forest", brand: "#166534", accent: "#65a30d" },
  { id: "Rose", brand: "#e11d48", accent: "#f472b6" }, { id: "Midnight", brand: "#312e81", accent: "#6366f1" },
  { id: "Desert gold", brand: "#b45309", accent: "#eab308" }, { id: "Teal", brand: "#0f766e", accent: "#22d3ee" },
];

export const LENGTHS = [3, 10, 15, 20];
export const BADGES: Record<string, [string, string]> = {
  first: ["First words", "Finished your first session."],
  week: ["Seven days", "Kept a 7-day streak."],
  ten: ["Ten talks", "Finished ten sessions."],
  boss: ["Boss slayer", "Beat an error boss."],
  stage: ["Level up", "Won a stage test."],
};

export type Turn = { role: "user" | "model"; text: string };

// Hidden stage directions the client sends to the coach as the session clock advances.
export const CUES = {
  start: "[Director: the learner just joined. Greet them warmly by name in one sentence and start the warm-up with one easy question.]",
  main: "[Director: warm-up is over. Move smoothly into the main activity now.]",
  mistakes: "[Director: pause the activity. Mistake hunt: bring up one or two mistakes the learner made today, let them try to fix each one themself first, then continue.]",
  wrap: "[Director: time is almost up. Wrap up in two sentences: one thing they did well, one thing to practise. Say goodbye.]",
};
