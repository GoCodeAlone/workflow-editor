/**
 * Build a map from node name → { startLine, endLine } by parsing the YAML structure.
 * Each entry in the top-level `modules` list is tracked by its `name` field.
 */
export interface YamlLineRange {
  startLine: number;
  endLine: number;
}

export function buildYamlLineMap(yaml: string): Record<string, YamlLineRange> {
  const lines = yaml.split('\n');
  const result: Record<string, YamlLineRange> = {};

  // Find the `modules:` top-level key
  let inModules = false;
  let currentName: string | null = null;
  let currentStart = -1;
  const moduleIndent = 2; // expected indent for list items under `modules:`

  const flush = (endLine: number) => {
    if (currentName !== null && currentStart >= 0) {
      result[currentName] = { startLine: currentStart, endLine };
      currentName = null;
      currentStart = -1;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-based

    if (/^modules:/.test(line)) {
      inModules = true;
      continue;
    }

    if (inModules) {
      // Detect top-level key that ends the modules block (non-indented, non-empty)
      if (line.length > 0 && !/^\s/.test(line) && !/^-/.test(line)) {
        flush(lineNum - 1);
        inModules = false;
        continue;
      }

      // Detect list item start: `  - name: foo` or `  -`
      const itemMatch = line.match(/^(\s+)-\s*/);
      if (itemMatch) {
        const indent = itemMatch[1].length;
        if (indent === moduleIndent) {
          flush(lineNum - 1);
          currentStart = lineNum;
        }
      }

      // Detect `name:` field in a module item
      const nameMatch = line.match(/^\s+name:\s+(\S+)/);
      if (nameMatch && currentStart >= 0) {
        currentName = nameMatch[1].replace(/['"]/g, '');
      }
    }
  }

  flush(lines.length);
  return result;
}
