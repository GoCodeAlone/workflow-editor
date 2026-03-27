/**
 * Build a map from node name → { startLine, endLine } by scanning YAML structure.
 *
 * Handles `modules:`, `pipelines:`, `workflows:`, and `triggers:` top-level sections.
 * Pipeline steps are keyed as `pipelineName:stepName`.
 * Line numbers are 1-based.
 */
export interface YamlLineRange {
  startLine: number;
  endLine: number;
}

export interface MultiFileYamlLineMap {
  files: Map<string | null, Record<string, YamlLineRange>>;
}

export function buildYamlLineMap(yaml: string): Record<string, YamlLineRange> {
  const lines = yaml.split('\n');
  const result: Record<string, YamlLineRange> = {};

  type Section = 'none' | 'modules' | 'pipelines' | 'workflows' | 'triggers';
  let section: Section = 'none';

  // Module tracking
  let moduleName: string | null = null;
  let moduleStart = -1;

  // Pipeline tracking
  let pipelineName: string | null = null;
  let pipelineStart = -1;

  // Step tracking (within current pipeline)
  let stepName: string | null = null;
  let stepStart = -1;

  // Workflow / trigger tracking (same structure: named map keys at 2-space indent)
  let workflowName: string | null = null;
  let workflowStart = -1;
  let triggerName: string | null = null;
  let triggerStart = -1;

  const flushModule = (endLine: number) => {
    if (moduleName !== null && moduleStart >= 0) {
      result[moduleName] = { startLine: moduleStart, endLine };
      moduleName = null;
      moduleStart = -1;
    }
  };

  const flushStep = (endLine: number) => {
    if (stepName !== null && stepStart >= 0 && pipelineName !== null) {
      result[`${pipelineName}:${stepName}`] = { startLine: stepStart, endLine };
      stepName = null;
      stepStart = -1;
    }
  };

  const flushPipeline = (endLine: number) => {
    flushStep(endLine);
    if (pipelineName !== null && pipelineStart >= 0) {
      result[pipelineName] = { startLine: pipelineStart, endLine };
      pipelineName = null;
      pipelineStart = -1;
    }
  };

  const flushWorkflow = (endLine: number) => {
    if (workflowName !== null && workflowStart >= 0) {
      result[workflowName] = { startLine: workflowStart, endLine };
      workflowName = null;
      workflowStart = -1;
    }
  };

  const flushTrigger = (endLine: number) => {
    if (triggerName !== null && triggerStart >= 0) {
      result[triggerName] = { startLine: triggerStart, endLine };
      triggerName = null;
      triggerStart = -1;
    }
  };

  const flushAll = (endLine: number) => {
    flushModule(endLine);
    flushPipeline(endLine);
    flushWorkflow(endLine);
    flushTrigger(endLine);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-based

    // Detect known top-level section headers
    if (/^modules:/.test(line)) {
      flushAll(lineNum - 1);
      section = 'modules';
      continue;
    }
    if (/^pipelines:/.test(line)) {
      flushAll(lineNum - 1);
      section = 'pipelines';
      continue;
    }
    if (/^workflows:/.test(line)) {
      flushAll(lineNum - 1);
      section = 'workflows';
      continue;
    }
    if (/^triggers:/.test(line)) {
      flushAll(lineNum - 1);
      section = 'triggers';
      continue;
    }

    // Non-indented non-empty line → unknown top-level key, end current section
    if (line.length > 0 && !/^\s/.test(line)) {
      flushAll(lineNum - 1);
      section = 'none';
      continue;
    }

    if (section === 'modules') {
      // List item at 2-space indent: `  - name: foo` (inline) or `  -` (name on next line)
      const itemMatch = line.match(/^  -\s*/);
      if (itemMatch) {
        flushModule(lineNum - 1);
        moduleStart = lineNum;
        moduleName = null;
        // Attempt to capture inline name: `  - name: foo`
        const inlineNameMatch = line.match(/^  -\s+name:\s+(\S+)/);
        if (inlineNameMatch) {
          moduleName = inlineNameMatch[1].replace(/['"]/g, '');
        }
      } else if (moduleStart >= 0 && moduleName === null) {
        // Name on its own indented line: `    name: foo`
        const nameMatch = line.match(/^\s+name:\s+(\S+)/);
        if (nameMatch) {
          moduleName = nameMatch[1].replace(/['"]/g, '');
        }
      }
    }

    if (section === 'pipelines') {
      // Pipeline name: exactly 2-space indent + identifier + colon, e.g. `  login:`
      const pipelineNameMatch = line.match(/^  ([a-zA-Z][\w-]*):/);
      if (pipelineNameMatch) {
        flushPipeline(lineNum - 1);
        pipelineName = pipelineNameMatch[1];
        pipelineStart = lineNum;
        stepName = null;
        stepStart = -1;
      } else if (pipelineName !== null) {
        // Step list item (deeper indent): `      - name: stepName`
        const stepMatch = line.match(/^(\s+)-\s+name:\s+(\S+)/);
        if (stepMatch && stepMatch[1].length >= 4) {
          flushStep(lineNum - 1);
          stepName = stepMatch[2].replace(/['"]/g, '');
          stepStart = lineNum;
        }
      }
    }

    if (section === 'workflows') {
      // Workflow name: exactly 2-space indent + identifier + colon
      const workflowNameMatch = line.match(/^  ([a-zA-Z][\w-]*):/);
      if (workflowNameMatch) {
        flushWorkflow(lineNum - 1);
        workflowName = workflowNameMatch[1];
        workflowStart = lineNum;
      }
    }

    if (section === 'triggers') {
      // Trigger name: exactly 2-space indent + identifier + colon
      const triggerNameMatch = line.match(/^  ([a-zA-Z][\w-]*):/);
      if (triggerNameMatch) {
        flushTrigger(lineNum - 1);
        triggerName = triggerNameMatch[1];
        triggerStart = lineNum;
      }
    }
  }

  flushAll(lines.length);
  return result;
}

export function buildMultiFileLineMap(
  files: Map<string | null, string>,
): MultiFileYamlLineMap {
  const result: MultiFileYamlLineMap = { files: new Map() };
  for (const [filePath, content] of files) {
    result.files.set(filePath, buildYamlLineMap(content));
  }
  return result;
}

export function lookupNodeInLineMap(
  lineMap: MultiFileYamlLineMap,
  nodeName: string,
  sourceFile?: string,
): { filePath: string | null; range: YamlLineRange } | null {
  if (sourceFile !== undefined) {
    const fileMap = lineMap.files.get(sourceFile);
    if (!fileMap) return null;
    const range = fileMap[nodeName];
    return range ? { filePath: sourceFile, range } : null;
  }

  for (const [filePath, fileMap] of lineMap.files) {
    const range = fileMap[nodeName];
    if (range) return { filePath, range };
  }
  return null;
}
