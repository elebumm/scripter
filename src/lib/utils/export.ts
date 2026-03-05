export function buildExportMarkdown({
  title,
  content,
  evaluations,
  masterSummary,
}: {
  title: string;
  content: string;
  evaluations: Array<{ modelName: string; result: string }>;
  masterSummary?: string;
}): string {
  let doc = `# ${title}\n\n`;
  doc += `## Script\n\n${content}\n\n`;
  doc += `---\n\n`;

  if (masterSummary) {
    doc += `## Master Summary\n\n${masterSummary}\n\n---\n\n`;
  }

  for (const evaluation of evaluations) {
    doc += `## Evaluation: ${evaluation.modelName}\n\n${evaluation.result}\n\n---\n\n`;
  }

  return doc;
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
