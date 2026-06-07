#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPLETE_EVIDENCE_STATUSES = new Set(["passed", "not_applicable", "deferred"]);
const COMPLETE_REVIEW_STATUSES = new Set(["approved", "approved_with_follow_up"]);
const BOOLEAN_ARGS = new Set(["dry-run", "with-follow-up", "allow-open-findings"]);
const MUTATING_COMMANDS = new Set([
  "start-task",
  "block-task",
  "unblock-task",
  "ready-for-review",
  "start-review",
  "changes-requested",
  "start-review-fixes",
  "resolve-finding",
  "approve-task",
  "record-evidence",
  "record-event",
  "close-agent",
  "import-task-result",
  "complete-task",
  "request-feature-review",
  "start-feature-review",
  "approve-feature",
  "record-feature-evidence",
  "complete-feature"
]);

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
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (BOOLEAN_ARGS.has(key)) {
      options[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  const [statePath, command] = positionals;
  if (!statePath || !command) {
    throw new Error("Usage: node orchestrate_state.mjs <state.json> <command> [--task <task-id>] [options]");
  }

  return {
    statePath: path.resolve(REPO_ROOT, statePath),
    command,
    options
  };
}

function now() {
  return new Date().toISOString();
}

function loadState(statePath) {
  const raw = readFileSync(statePath, "utf8");
  return { raw, state: JSON.parse(raw) };
}

function writeState(statePath, state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, "/");
}

function taskById(state, taskId) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  return task;
}

function requireTask(options) {
  if (!options.task) throw new Error("--task is required");
  return options.task;
}

function requireOption(options, key) {
  if (!options[key]) throw new Error(`--${key} is required`);
  return options[key];
}

function dependenciesComplete(state, task) {
  return (task.dependencies ?? []).every((dependencyId) => taskById(state, dependencyId).status === "complete");
}

function nextSequentialCandidate(state) {
  const task = [...state.tasks].sort((left, right) => left.order - right.order).find((candidate) => candidate.status !== "complete");
  if (!task) return null;
  if (!["ready", "not_started"].includes(task.status)) return null;
  if (!dependenciesComplete(state, task)) return null;
  return task;
}

function refreshReadyTasks(state, timestamp) {
  for (const task of state.tasks) {
    if (task.status === "ready") {
      task.status = "not_started";
      task.progress.lastUpdatedAt = timestamp;
    }
  }

  const nextTask = nextSequentialCandidate(state);
  if (nextTask && nextTask.status === "not_started") {
    nextTask.status = "ready";
    nextTask.progress.lastUpdatedAt = timestamp;
  }
}

function nextReadyTaskId(state) {
  return nextSequentialCandidate(state)?.id ?? null;
}

function computedReadyTasks(state) {
  const task = nextSequentialCandidate(state);
  return task ? [task] : [];
}

function touchFeature(state, timestamp) {
  state.feature.updatedAt = timestamp;
}

function touchTask(task, timestamp) {
  task.progress.lastUpdatedAt = timestamp;
}

function assertTransition(task, allowed) {
  if (!allowed.includes(task.status)) {
    throw new Error(`${task.id} is ${task.status}; expected one of ${allowed.join(", ")}`);
  }
}

function unresolvedFindings(task) {
  return (task.review?.findings ?? []).filter((finding) => finding.status !== "resolved" && finding.status !== "deferred");
}

function ensureTaskCompletionGate(state, task) {
  if (!COMPLETE_REVIEW_STATUSES.has(task.review?.status)) {
    throw new Error(`${task.id} review status must be approved or approved_with_follow_up before completion`);
  }

  const evidenceById = new Map((task.completionEvidence ?? []).map((item) => [item.id, item]));
  for (const gate of state.orchestration.taskCompletionGate ?? []) {
    const evidence = evidenceById.get(gate.id);
    if (!evidence) throw new Error(`${task.id} missing completion evidence for gate ${gate.id}`);
    if (!COMPLETE_EVIDENCE_STATUSES.has(evidence.status)) {
      throw new Error(`${task.id}:${gate.id} must be passed, not_applicable, or deferred before completion`);
    }
    if (evidence.status === "deferred" && !evidence.notes) {
      throw new Error(`${task.id}:${gate.id} is deferred without notes rationale`);
    }
  }

  const openFindings = unresolvedFindings(task);
  if (openFindings.length > 0) {
    throw new Error(`${task.id} has unresolved review findings: ${openFindings.map((finding) => finding.id).join(", ")}`);
  }
}

function makeEvidenceEntry(options, timestamp) {
  const entry = {
    type: options.type ?? "orchestrator",
    result: options.result ?? options.status ?? "recorded",
    recordedAt: timestamp,
    notes: options.notes ?? null
  };

  for (const key of ["command", "scenario", "agent"]) {
    if (options[key]) entry[key] = options[key];
  }

  return entry;
}

function makeProcessEvent(options, timestamp, taskId = null) {
  const entry = {
    type: options.type ?? "event",
    taskId,
    recordedAt: timestamp,
    notes: options.notes ?? null
  };

  for (const key of ["agent", "command", "result", "reason"]) {
    if (options[key]) entry[key] = options[key];
  }

  return entry;
}

function ensureAgentLifecycle(task) {
  task.agentLifecycle ??= { openAgents: [], closedAgents: [] };
  task.agentLifecycle.openAgents ??= [];
  task.agentLifecycle.closedAgents ??= [];
  return task.agentLifecycle;
}

function openAgent(task, agentId, role, timestamp) {
  if (!agentId) return;
  const lifecycle = ensureAgentLifecycle(task);
  if (!lifecycle.openAgents.some((agent) => agent.id === agentId)) {
    lifecycle.openAgents.push({ id: agentId, role, openedAt: timestamp });
  }
}

function closeAgent(task, agentId, reason, timestamp) {
  const lifecycle = ensureAgentLifecycle(task);
  lifecycle.openAgents = lifecycle.openAgents.filter((agent) => agent.id !== agentId);
  lifecycle.closedAgents.push({ id: agentId, reason, closedAt: timestamp });
}

function recordProcessEvent(state, options, timestamp, taskId = null) {
  state.processEvents ??= [];
  state.processEvents.push(makeProcessEvent(options, timestamp, taskId));
}

function taskLocalStatePath(statePath, task) {
  const explicit = task.paths?.state;
  if (explicit) return path.resolve(REPO_ROOT, explicit);
  if (task.paths?.task) return path.join(path.dirname(path.resolve(REPO_ROOT, task.paths.task)), "state.json");
  return path.join(path.dirname(statePath), "tasks", task.id, "state.json");
}

function summarize(state) {
  const readyTasks = computedReadyTasks(state);
  return {
    feature: {
      id: state.feature.id,
      name: state.feature.name,
      status: state.feature.status,
      currentTaskId: state.feature.progress.currentTaskId,
      nextReadyTaskId: readyTasks[0]?.id ?? null
    },
    counts: state.tasks.reduce(
      (counts, task) => {
        counts[task.status] = (counts[task.status] ?? 0) + 1;
        return counts;
      },
      {}
    ),
    readyTasks: readyTasks.map((task) => task.id),
    inProgressTasks: state.tasks.filter((task) => task.status === "in_progress").map((task) => task.id),
    blockedTasks: state.tasks.filter((task) => task.status === "blocked").map((task) => task.id)
  };
}

function appendDecision(review, decision, timestamp) {
  review.decisions ??= [];
  review.decisions.push({ decision, recordedAt: timestamp });
}

function applyCommand(state, command, options, statePath) {
  const timestamp = now();
  let task = null;

  switch (command) {
    case "inspect":
      return { changed: false, timestamp };

    case "start-task": {
      task = taskById(state, requireTask(options));
      assertTransition(task, ["ready", "not_started"]);
      if (!dependenciesComplete(state, task)) throw new Error(`${task.id} dependencies are not complete`);
      const nextTask = nextSequentialCandidate(state);
      if (nextTask?.id !== task.id) {
        throw new Error(`${task.id} is not the next sequential task; next task is ${nextTask?.id ?? "none"}`);
      }
      task.status = "in_progress";
      task.progress.assignedTo = options["assigned-to"] ?? task.progress.assignedTo ?? null;
      task.progress.startedAt ??= timestamp;
      task.progress.currentAttempt = (task.progress.currentAttempt ?? 0) + 1;
      task.progress.blockedReason = null;
      openAgent(task, options["assigned-to"], "worker", timestamp);
      touchTask(task, timestamp);
      state.feature.status = "in_progress";
      state.feature.progress.startedAt ??= timestamp;
      state.feature.progress.currentTaskId = task.id;
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "block-task": {
      task = taskById(state, requireTask(options));
      if (task.status === "complete") throw new Error(`${task.id} is complete and cannot be blocked`);
      task.status = "blocked";
      task.progress.blockedReason = requireOption(options, "reason");
      touchTask(task, timestamp);
      if (state.feature.progress.currentTaskId === task.id) {
        state.feature.progress.blockedReason = task.progress.blockedReason;
      }
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "unblock-task": {
      task = taskById(state, requireTask(options));
      assertTransition(task, ["blocked"]);
      task.status = dependenciesComplete(state, task) ? "ready" : "not_started";
      task.progress.blockedReason = null;
      touchTask(task, timestamp);
      state.feature.progress.blockedReason = null;
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "ready-for-review": {
      task = taskById(state, requireTask(options));
      assertTransition(task, ["in_progress", "review_fixes_in_progress"]);
      task.status = "ready_for_review";
      task.review.status = "requested";
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "start-review": {
      task = taskById(state, requireTask(options));
      assertTransition(task, ["ready_for_review"]);
      task.status = "review_in_progress";
      task.review.status = "in_progress";
      openAgent(task, options.agent, "reviewer", timestamp);
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "changes-requested": {
      task = taskById(state, requireTask(options));
      assertTransition(task, ["review_in_progress"]);
      const description = requireOption(options, "finding");
      task.status = "changes_requested";
      task.review.status = "changes_requested";
      task.review.findings ??= [];
      task.review.findings.push({
        id: options["finding-id"] ?? `finding-${task.review.findings.length + 1}`,
        agent: options.agent ?? "code-review",
        status: "open",
        description,
        createdAt: timestamp,
        resolvedAt: null,
        resolution: null
      });
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "start-review-fixes": {
      task = taskById(state, requireTask(options));
      assertTransition(task, ["changes_requested"]);
      task.status = "review_fixes_in_progress";
      task.progress.assignedTo = options["assigned-to"] ?? task.progress.assignedTo ?? null;
      openAgent(task, options["assigned-to"], "review-fix-worker", timestamp);
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "resolve-finding": {
      task = taskById(state, requireTask(options));
      const findingId = requireOption(options, "finding-id");
      const finding = (task.review.findings ?? []).find((candidate) => candidate.id === findingId);
      if (!finding) throw new Error(`${task.id} does not have review finding ${findingId}`);
      finding.status = options.status ?? "resolved";
      finding.resolution = requireOption(options, "resolution");
      finding.resolvedAt = timestamp;
      task.review.resolutionEvidence ??= [];
      task.review.resolutionEvidence.push(makeEvidenceEntry(options, timestamp));
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "record-event": {
      const taskId = options.task ?? null;
      if (taskId) taskById(state, taskId);
      recordProcessEvent(state, options, timestamp, taskId);
      if (taskId) {
        task = taskById(state, taskId);
        task.processEvents ??= [];
        task.processEvents.push(makeProcessEvent(options, timestamp, taskId));
        touchTask(task, timestamp);
      }
      touchFeature(state, timestamp);
      return { changed: true, taskId, timestamp };
    }

    case "close-agent": {
      task = taskById(state, requireTask(options));
      const agentId = requireOption(options, "agent");
      const reason = requireOption(options, "reason");
      closeAgent(task, agentId, reason, timestamp);
      recordProcessEvent(state, { ...options, type: options.type ?? "agent_closed", reason }, timestamp, task.id);
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "import-task-result": {
      task = taskById(state, requireTask(options));
      const localPath = taskLocalStatePath(statePath, task);
      if (!existsSync(localPath)) throw new Error(`${task.id} is missing task-local state: ${repoRelative(localPath)}`);
      const taskState = JSON.parse(readFileSync(localPath, "utf8"));
      task.delegatedState = {
        status: taskState.status ?? null,
        attempt: taskState.attempt ?? null,
        review: taskState.review ?? null,
        verification: taskState.verification ?? null,
        agentLifecycle: taskState.agentLifecycle ?? null,
        importedAt: timestamp
      };
      recordProcessEvent(state, { type: "task_result_imported", notes: `Imported ${repoRelative(localPath)}` }, timestamp, task.id);
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "approve-task": {
      task = taskById(state, requireTask(options));
      assertTransition(task, ["review_in_progress"]);
      const openFindings = unresolvedFindings(task);
      if (openFindings.length > 0 && !options["allow-open-findings"]) {
        throw new Error(`${task.id} has unresolved review findings: ${openFindings.map((finding) => finding.id).join(", ")}`);
      }
      task.status = "approved";
      task.review.status = options["with-follow-up"] ? "approved_with_follow_up" : "approved";
      if (options.score) task.review.score = Number(options.score);
      appendDecision(task.review, options.decision ?? "Approved by orchestrator after review.", timestamp);
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "record-evidence": {
      task = taskById(state, requireTask(options));
      const evidenceId = requireOption(options, "evidence-id");
      const evidence = (task.completionEvidence ?? []).find((item) => item.id === evidenceId);
      if (!evidence) throw new Error(`${task.id} does not have completion evidence ${evidenceId}`);
      const status = requireOption(options, "status");
      if (!(state.orchestration.evidenceStatusValues ?? []).includes(status)) {
        throw new Error(`Invalid evidence status: ${status}`);
      }
      if (status === "deferred" && !options.notes) throw new Error("Deferred evidence requires --notes rationale");
      evidence.status = status;
      evidence.notes = options.notes ?? evidence.notes ?? null;
      evidence.evidence ??= [];
      evidence.evidence.push(makeEvidenceEntry(options, timestamp));
      touchTask(task, timestamp);
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "complete-task": {
      task = taskById(state, requireTask(options));
      assertTransition(task, ["approved"]);
      ensureTaskCompletionGate(state, task);
      task.status = "complete";
      task.progress.completedAt = timestamp;
      task.progress.blockedReason = null;
      touchTask(task, timestamp);
      refreshReadyTasks(state, timestamp);
      state.feature.progress.lastCompletedTaskId = task.id;
      state.feature.progress.currentTaskId = nextReadyTaskId(state);
      state.feature.progress.blockedReason = null;
      state.feature.status = state.tasks.every((candidate) => candidate.status === "complete") ? "ready_for_review" : "in_progress";
      touchFeature(state, timestamp);
      return { changed: true, taskId: task.id, timestamp };
    }

    case "request-feature-review": {
      if (!state.tasks.every((candidate) => candidate.status === "complete")) {
        throw new Error("Every task must be complete before feature review");
      }
      state.feature.status = "ready_for_review";
      state.feature.review.status = "requested";
      touchFeature(state, timestamp);
      return { changed: true, timestamp };
    }

    case "start-feature-review": {
      if (state.feature.status !== "ready_for_review") throw new Error(`feature is ${state.feature.status}; expected ready_for_review`);
      state.feature.status = "review_in_progress";
      state.feature.review.status = "in_progress";
      touchFeature(state, timestamp);
      return { changed: true, timestamp };
    }

    case "approve-feature": {
      if (state.feature.status !== "review_in_progress") throw new Error(`feature is ${state.feature.status}; expected review_in_progress`);
      state.feature.status = "approved";
      state.feature.review.status = options["with-follow-up"] ? "approved_with_follow_up" : "approved";
      if (options.score) state.feature.review.score = Number(options.score);
      appendDecision(state.feature.review, options.decision ?? "Approved by orchestrator after feature-level review.", timestamp);
      touchFeature(state, timestamp);
      return { changed: true, timestamp };
    }

    case "record-feature-evidence": {
      state.feature.verification.evidence ??= [];
      state.feature.verification.evidence.push(makeEvidenceEntry(options, timestamp));
      state.feature.verification.status = options.status ?? state.feature.verification.status ?? "pending";
      touchFeature(state, timestamp);
      return { changed: true, timestamp };
    }

    case "complete-feature": {
      if (!state.tasks.every((candidate) => candidate.status === "complete")) {
        throw new Error("Every task must be complete before feature completion");
      }
      if (!COMPLETE_REVIEW_STATUSES.has(state.feature.review?.status)) {
        throw new Error("Feature review must be approved or approved_with_follow_up before completion");
      }
      state.feature.status = "complete";
      state.feature.progress.currentTaskId = null;
      state.feature.progress.completedAt = timestamp;
      state.feature.verification.status = state.feature.verification.status === "pending" ? "passed" : state.feature.verification.status;
      touchFeature(state, timestamp);
      return { changed: true, timestamp };
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function runValidator(statePath) {
  const validator = path.resolve(SKILL_ROOT, "../prepare-orchestrated-feature/scripts/validate_feature_state.mjs");
  if (!existsSync(validator)) {
    return {
      ok: true,
      diagnostics: [{ level: "warning", message: "prepare-orchestrated-feature validator was not found" }]
    };
  }

  const featureRoot = path.dirname(statePath);
  const output = execFileSync(process.execPath, [validator, featureRoot], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });
  return JSON.parse(output);
}

function commit(statePath, beforeRaw, state, dryRun) {
  if (dryRun) return { validation: null };

  writeState(statePath, state);
  try {
    return { validation: runValidator(statePath) };
  } catch (error) {
    writeFileSync(statePath, beforeRaw);
    const stdout = error.stdout ? error.stdout.toString() : "";
    const stderr = error.stderr ? error.stderr.toString() : "";
    throw new Error(`State validation failed; previous state restored.\n${stdout}${stderr}`);
  }
}

function main() {
  const { statePath, command, options } = parseArgs(process.argv.slice(2));
  const { raw, state } = loadState(statePath);
  const mutation = MUTATING_COMMANDS.has(command);
  const result = applyCommand(state, command, options, statePath);
  const commitResult = mutation ? commit(statePath, raw, state, options["dry-run"] ?? false) : { validation: runValidator(statePath) };

  console.log(
    JSON.stringify(
      {
        ok: true,
        command,
        dryRun: options["dry-run"] ?? false,
        statePath: repoRelative(statePath),
        changed: result.changed,
        taskId: result.taskId ?? null,
        summary: summarize(state),
        validation: commitResult.validation
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
