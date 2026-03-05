export function getWordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function getReadingTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 200);
  return `${minutes} min read`;
}

export function getVideoRuntime(wordCount: number): string {
  const totalSeconds = Math.round((wordCount / 150) * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getTokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}
