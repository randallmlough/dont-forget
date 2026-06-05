#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALID_SCHEMA_VERSION = 2;
const REQUIRED_TASK_PATHS = ["task", "qa", "plan", "implementationNotes"];
const COMPLETE_EVIDENCE_STATUSES = new Set(["passed", "not_applicable", "deferred"]);
const COMPLETE_REVIEW_STATUSES = new Set(["approved", "approved_with_follow_up"]);

function findRepoRoot() {
  for (const start of [process.cwd(), SKILL_ROOT]) {
    let current = path.resolve(start);
    while (true) {
      if (existsSync(path.join(current, ".git"))) return current;

      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return path.resolve(SKILL_ROOT, "../../..");
}

const REPO_ROOT = findRepoRoot();

function parseArgs(argv) {
  const args = { allowEmpty: false, featureRootArg: null };

  for (const arg of argv) {
    if (arg === "--allow-empty") {
      args.allowEmpty = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    if (args.featureRootArg) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    args.featureRootArg = arg;
  }

  return args;
}

function fail(message) {
  return { level: "error", message };
}

function warn(message) {
  return { level: "warning", message };
}

function loadJson(filePath, diagnostics) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    diagnostics.push(fail(`Could not parse ${filePath}: ${error.message}`));
    return null;
  }
}

function detectCycles(tasks, diagnostics) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();

  function visit(task) {
    if (visited.has(task.id)) return;
    if (visiting.has(task.id)) {
      diagnostics.push(fail(`Dependency cycle detected at ${task.id}`));
      return;
    }

    visiting.add(task.id);
    for (const dependencyId of task.dependencies ?? []) {
      const dependency = byId.get(dependencyId);
      if (dependency) visit(dependency);
    }
    visiting.delete(task.id);
    visited.add(task.id);
  }

  for (const task of tasks) visit(task);
}

function resolveRepoPath(repoPath) {
  return path.resolve(REPO_ROOT, repoPath);
}

function validateSourceDocuments(state, diagnostics) {
  const prdPath = state.feature?.sourceDocuments?.prd;
  if (!prdPath) {
    diagnostics.push(fail("Missing feature.sourceDocuments.prd"));
  } else if (!existsSync(resolveRepoPath(prdPath))) {
    diagnostics.push(fail(`Missing PRD source document: ${prdPath}`));
  }

  const discussionPath = state.feature?.sourceDocuments?.discussion;
  if (discussionPath && !existsSync(resolveRepoPath(discussionPath))) {
    diagnostics.push(warn(`Discussion source document is listed but missing: ${discussionPath}`));
  }
}

function validateCompletionGates(state, diagnostics) {
  const gates = state.orchestration?.taskCompletionGate;
  if (!Array.isArray(gates) || gates.length === 0) {
    diagnostics.push(fail("orchestration.taskCompletionGate must be a non-empty array"));
    return new Set();
  }

  const gateIds = new Set();
  for (const gate of gates) {
    if (!gate.id) {
      diagnostics.push(fail("taskCompletionGate item missing id"));
      continue;
    }
    if (gateIds.has(gate.id)) diagnostics.push(fail(`Duplicate taskCompletionGate id: ${gate.id}`));
    gateIds.add(gate.id);
    if (!gate.description) diagnostics.push(fail(`taskCompletionGate ${gate.id} missing description`));
  }

  return gateIds;
}

function validateParallelWaves(state, ids, diagnostics) {
  const waves = state.parallelization?.waves;
  if (!Array.isArray(waves)) {
    diagnostics.push(fail("parallelization.waves must be an array"));
    return;
  }

  const seen = new Set();
  const byId = new Map(state.tasks.map((task) => [task.id, task]));

  for (const wave of waves) {
    if (wave.parallelGroup === undefined || wave.parallelGroup === null) {
      diagnostics.push(fail("parallelization wave missing parallelGroup"));
    }
    if (!Array.isArray(wave.taskIds) || wave.taskIds.length === 0) {
      diagnostics.push(fail(`parallelization wave ${wave.parallelGroup} must include taskIds`));
      continue;
    }

    if (wave.taskIds.length > 1 && wave.canRunInParallel !== true) {
      diagnostics.push(warn(`parallelization wave ${wave.parallelGroup} has multiple tasks but canRunInParallel is not true`));
    }

    for (const taskId of wave.taskIds) {
      if (!ids.has(taskId)) {
        diagnostics.push(fail(`parallelization wave ${wave.parallelGroup} references unknown task ${taskId}`));
        continue;
      }
      if (seen.has(taskId)) diagnostics.push(fail(`Task ${taskId} appears in more than one parallelization wave`));
      seen.add(taskId);

      const task = byId.get(taskId);
      if (task?.parallelGroup !== wave.parallelGroup) {
        diagnostics.push(fail(`${taskId} has parallelGroup ${task?.parallelGroup}, but appears in wave ${wave.parallelGroup}`));
      }
    }
  }

  for (const taskId of ids) {
    if (!seen.has(taskId)) diagnostics.push(fail(`Task ${taskId} is missing from parallelization.waves`));
  }
}

function validate(featureRootArg, options = {}) {
  const featureRoot = path.resolve(REPO_ROOT, featureRootArg);
  const diagnostics = [];
  const statePath = path.join(featureRoot, "state.json");

  if (!existsSync(featureRoot)) {
    diagnostics.push(fail(`Feature root does not exist: ${featureRootArg}`));
    return diagnostics;
  }

  if (!existsSync(statePath)) {
    diagnostics.push(fail(`Missing state.json at ${featureRootArg}`));
    return diagnostics;
  }

  const state = loadJson(statePath, diagnostics);
  if (!state) return diagnostics;

  if (state.schemaVersion !== VALID_SCHEMA_VERSION) {
    diagnostics.push(fail(`Expected schemaVersion ${VALID_SCHEMA_VERSION}, found ${state.schemaVersion}`));
  }

  validateSourceDocuments(state, diagnostics);

  const featureNotesPath = state.feature?.paths?.implementationNotes;
  if (!featureNotesPath || !existsSync(resolveRepoPath(featureNotesPath))) {
    diagnostics.push(fail(`Missing feature implementation notes: ${featureNotesPath}`));
  }

  const statusValues = new Set(state.orchestration?.statusValues ?? []);
  const reviewStatusValues = new Set(state.orchestration?.reviewStatusValues ?? []);
  const evidenceStatusValues = new Set(state.orchestration?.evidenceStatusValues ?? []);
  const taskCompletionGateIds = validateCompletionGates(state, diagnostics);

  if (!statusValues.has(state.feature?.status)) {
    diagnostics.push(fail(`feature has invalid status ${state.feature?.status}`));
  }

  if (!reviewStatusValues.has(state.feature?.review?.status)) {
    diagnostics.push(fail(`feature has invalid review status ${state.feature?.review?.status}`));
  }

  if (!Array.isArray(state.tasks)) {
    diagnostics.push(fail("state.tasks must be an array"));
    return diagnostics;
  }

  if (state.tasks.length === 0) {
    if (options.allowEmpty) {
      diagnostics.push(warn("state.tasks is empty because --allow-empty was passed; this is not ready for orchestrated implementation."));
    } else {
      diagnostics.push(fail("state.tasks must be a non-empty array"));
    }
    return diagnostics;
  }

  const ids = new Set();
  const taskDirsRoot = path.join(featureRoot, "tasks");
  const taskDirs = existsSync(taskDirsRoot)
    ? readdirSync(taskDirsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  const orders = new Set();

  for (const task of state.tasks) {
    if (!task.id) diagnostics.push(fail("Task is missing id"));
    if (ids.has(task.id)) diagnostics.push(fail(`Duplicate task id: ${task.id}`));
    ids.add(task.id);

    if (!taskDirs.includes(task.id)) diagnostics.push(fail(`Missing task directory for ${task.id}`));
    if (!statusValues.has(task.status)) diagnostics.push(fail(`${task.id} has invalid status ${task.status}`));
    if (orders.has(task.order)) diagnostics.push(fail(`Duplicate task order ${task.order}`));
    orders.add(task.order);

    for (const key of REQUIRED_TASK_PATHS) {
      const value = task.paths?.[key];
      if (!value) {
        diagnostics.push(fail(`${task.id} missing path ${key}`));
        continue;
      }
      if (!existsSync(resolveRepoPath(value))) {
        diagnostics.push(fail(`${task.id} missing path ${key}: ${value}`));
      }
    }

    if (!reviewStatusValues.has(task.review?.status)) {
      diagnostics.push(fail(`${task.id} has invalid review status ${task.review?.status}`));
    }

    if (!Array.isArray(task.completionEvidence) || task.completionEvidence.length === 0) {
      diagnostics.push(fail(`${task.id} must include completionEvidence`));
    } else {
      const evidenceIds = new Set();
      for (const item of task.completionEvidence) {
        if (!item.id) diagnostics.push(fail(`${task.id} has completionEvidence item without id`));
        if (evidenceIds.has(item.id)) diagnostics.push(fail(`${task.id} has duplicate completionEvidence id ${item.id}`));
        evidenceIds.add(item.id);
        if (!item.description) diagnostics.push(fail(`${task.id}:${item.id} missing description`));
        if (!evidenceStatusValues.has(item.status)) diagnostics.push(fail(`${task.id}:${item.id} invalid evidence status ${item.status}`));
        if (!Array.isArray(item.evidence)) diagnostics.push(fail(`${task.id}:${item.id} evidence must be an array`));
        if (item.status === "deferred" && !item.notes) {
          diagnostics.push(fail(`${task.id}:${item.id} is deferred without rationale in notes`));
        }
      }
    }

    for (const field of ["progress", "review", "verification"]) {
      if (!task[field]) diagnostics.push(fail(`${task.id} missing ${field}`));
    }

    if (task.status === "complete") {
      if (!COMPLETE_REVIEW_STATUSES.has(task.review?.status)) {
        diagnostics.push(fail(`${task.id} is complete but review status is ${task.review?.status}`));
      }

      const evidenceById = new Map((task.completionEvidence ?? []).map((item) => [item.id, item]));
      for (const gateId of taskCompletionGateIds) {
        const evidence = evidenceById.get(gateId);
        if (!evidence) {
          diagnostics.push(fail(`${task.id} is complete but missing completionEvidence for gate ${gateId}`));
          continue;
        }
        if (!COMPLETE_EVIDENCE_STATUSES.has(evidence.status)) {
          diagnostics.push(fail(`${task.id}:${gateId} must be passed, not_applicable, or deferred before task completion`));
        }
      }
    }
  }

  for (const task of state.tasks) {
    for (const dependencyId of task.dependencies ?? []) {
      if (!ids.has(dependencyId)) diagnostics.push(fail(`${task.id} depends on unknown task ${dependencyId}`));
    }
    for (const blockedId of task.blocks ?? []) {
      if (!ids.has(blockedId)) diagnostics.push(fail(`${task.id} blocks unknown task ${blockedId}`));
    }
  }

  for (const task of state.tasks) {
    const actualBlocks = [...(task.blocks ?? [])].sort();
    const expectedBlocks = state.tasks
      .filter((candidate) => (candidate.dependencies ?? []).includes(task.id))
      .map((candidate) => candidate.id)
      .sort();
    if (JSON.stringify(actualBlocks) !== JSON.stringify(expectedBlocks)) {
      diagnostics.push(warn(`${task.id} blocks should be ${expectedBlocks.join(", ") || "empty"} based on dependencies`));
    }
  }

  detectCycles(state.tasks, diagnostics);

  for (const taskDir of taskDirs) {
    if (!ids.has(taskDir)) diagnostics.push(warn(`Task directory is not represented in state.json: ${taskDir}`));
  }

  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  const readyTasks = state.tasks
    .filter((task) => ["not_started", "ready"].includes(task.status))
    .filter((task) => (task.dependencies ?? []).every((dependencyId) => byId.get(dependencyId)?.status === "complete"))
    .sort((left, right) => left.order - right.order);

  if (readyTasks.length === 0 && state.tasks.some((task) => task.status !== "complete")) {
    diagnostics.push(warn("No ready task found, but feature is not complete"));
  }

  if (state.feature?.progress?.currentTaskId && readyTasks.length > 0 && state.feature.progress.currentTaskId !== readyTasks[0].id) {
    diagnostics.push(warn(`feature.progress.currentTaskId is ${state.feature.progress.currentTaskId}, but next ready task is ${readyTasks[0].id}`));
  }

  validateParallelWaves(state, ids, diagnostics);

  if (state.feature?.status === "complete") {
    const incompleteTasks = state.tasks.filter((task) => task.status !== "complete");
    if (incompleteTasks.length > 0) {
      diagnostics.push(fail(`feature is complete but these tasks are not: ${incompleteTasks.map((task) => task.id).join(", ")}`));
    }
  }

  return diagnostics;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (!args.featureRootArg) {
  console.error("Usage: node validate_feature_state.mjs docs/.local/features/<feature-name> [--allow-empty]");
  process.exit(1);
}

const diagnostics = validate(args.featureRootArg, { allowEmpty: args.allowEmpty });
const errors = diagnostics.filter((diagnostic) => diagnostic.level === "error");

console.log(
  JSON.stringify(
    {
      ok: errors.length === 0,
      diagnostics
    },
    null,
    2
  )
);

process.exit(errors.length === 0 ? 0 : 1);
