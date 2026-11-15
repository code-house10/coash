// "Does this message sound right?" items, easiest first. ok=false means the sentence has a mistake.
export const SWIPE: { text: string; ok: boolean; level: string }[] = [
  { text: "She have two brothers.", ok: false, level: "A1" },
  { text: "I am from Egypt.", ok: true, level: "A1" },
  { text: "We went to the market yesterday.", ok: true, level: "A2" },
  { text: "He don't like coffee.", ok: false, level: "A2" },
  { text: "I have been living here since five years.", ok: false, level: "B1" },
  { text: "If it rains tomorrow, we will stay home.", ok: true, level: "B1" },
  { text: "I'm used to wake up early.", ok: false, level: "B1" },
  { text: "She suggested that we take a later train.", ok: true, level: "B2" },
  { text: "If I would have known, I would have called you.", ok: false, level: "B2" },
  { text: "Hardly had we arrived when it started to rain.", ok: true, level: "C1" },
  { text: "The report needs to be finish by Friday.", ok: false, level: "B1" },
  { text: "Not only he was late, but he also forgot the files.", ok: false, level: "C1" },
];
