#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOLEAN_ARGS = new Set(["force", "allow-empty"]);

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

const TASK_COMPLETION_GATE = [
  { id: "acceptance-criteria", description: "Task implementation satisfies task.md acceptance criteria." },
  { id: "qa-matrix", description: "QA.md checks are completed or explicitly documented as not applicable." },
  { id: "plan-done-criteria", description: "plan.md done criteria are completed or explicitly documented as superseded with rationale." },
  { id: "worker-notes", description: "worker-notes.md contains a useful final worker report and GitButler hygiene status." },
  { id: "review-notes", description: "review-notes.md records requested changes, fix responses, and approval." },
  { id: "review-findings", description: "Review findings are resolved or explicitly deferred with rationale." },
  { id: "verification-evidence", description: "verification.md and machine-readable fields record relevant verification evidence." }
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    if (BOOLEAN_ARGS.has(key)) {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, "/");
}

function resolveRepoPath(repoPath) {
  return path.resolve(REPO_ROOT, repoPath);
}

function assertPrdExists(prdPath) {
  if (!existsSync(resolveRepoPath(prdPath))) {
    throw new Error(`PRD path does not exist: ${prdPath}`);
  }
}

function readTemplate(name) {
  return readFileSync(path.join(SKILL_ROOT, "assets", name), "utf8");
}

function render(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] ?? "");
}

function writeIfMissing(filePath, content, force, created, skipped) {
  if (existsSync(filePath) && !force) {
    skipped.push(repoRelative(filePath));
    return;
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  created.push(repoRelative(filePath));
}

function currentBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    }).trim();
  } catch {
    return "unknown";
  }
}

function parseTaskMarkdown(taskDir) {
  const taskPath = path.join(taskDir, "task.md");
  const id = path.basename(taskDir);
  if (!existsSync(taskPath)) {
    return {
      id,
      name: titleCaseFromSlug(id),
      type: "AFK",
      dependencies: []
    };
  }

  const text = readFileSync(taskPath, "utf8");
  const name = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? titleCaseFromSlug(id);
  const type = text.match(/^Type:\s*(.+)$/m)?.[1]?.trim() ?? "AFK";
  const blockedBy = text.match(/## Blocked By\s+([\s\S]*?)(?:\n## |\n?$)/)?.[1] ?? "";
  const dependencies = [];
  for (const match of blockedBy.matchAll(/`([^`]+)`/g)) {
    dependencies.push(match[1]);
  }

  return { id, name, type, dependencies };
}

function loadTasks(featureRoot, tasksFile) {
  if (tasksFile) {
    const resolved = path.resolve(REPO_ROOT, tasksFile);
    const parsed = JSON.parse(readFileSync(resolved, "utf8"));
    const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
    if (!Array.isArray(tasks)) {
      throw new Error("--tasks-file must contain an array or an object with a tasks array");
    }
    return assertUniqueTasks(tasks.map((task) => ({
      id: task.id ?? slugify(task.name ?? ""),
      name: task.name ?? titleCaseFromSlug(task.id),
      type: task.type ?? "AFK",
      dependencies: task.dependencies ?? [],
      order: task.order,
      touches: task.touches ?? [],
      conflictAreas: task.conflictAreas ?? [],
      completionEvidence: task.completionEvidence
    })));
  }

  const tasksRoot = path.join(featureRoot, "tasks");
  if (!existsSync(tasksRoot)) {
    return [];
  }

  return readdirSync(tasksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseTaskMarkdown(path.join(tasksRoot, entry.name)));
}

function assertUniqueTasks(tasks) {
  const ids = new Set();
  for (const task of tasks) {
    if (!task.id) {
      throw new Error("Every task must have an id or a name that can be slugified");
    }
    if (ids.has(task.id)) {
      throw new Error(`Duplicate task id: ${task.id}`);
    }
    ids.add(task.id);
  }
  return tasks;
}

function sortTasks(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set();
  const visiting = new Set();
  const sorted = [];

  function visit(task) {
    if (visited.has(task.id)) return;
    if (visiting.has(task.id)) {
      throw new Error(`Dependency cycle detected at ${task.id}`);
    }

    visiting.add(task.id);
    for (const dependency of task.dependencies ?? []) {
      const dependencyTask = byId.get(dependency);
      if (dependencyTask) visit(dependencyTask);
    }
    visiting.delete(task.id);
    visited.add(task.id);
    sorted.push(task);
  }

  for (const task of tasks) visit(task);
  return sorted;
}

function blocksFor(tasks, taskId) {
  return tasks.filter((task) => (task.dependencies ?? []).includes(taskId)).map((task) => task.id);
}

function normalizeCompletionEvidenceItem(item, fallbackDescription) {
  return {
    id: item.id,
    description: item.description ?? fallbackDescription,
    status: item.status ?? "pending",
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    notes: item.notes ?? null
  };
}

function makeCompletionEvidence(task) {
  const existing = Array.isArray(task.completionEvidence) ? task.completionEvidence : [];
  const byId = new Map(existing.filter((item) => item.id).map((item) => [item.id, item]));
  const usedIds = new Set();
  const evidence = TASK_COMPLETION_GATE.map((gate) => {
    const existingItem = byId.get(gate.id);
    usedIds.add(gate.id);

    if (existingItem) {
      return normalizeCompletionEvidenceItem(existingItem, gate.description);
    }

    return {
      id: gate.id,
      description: gate.description,
      status: "pending",
      evidence: [],
      notes: null
    };
  });

  for (const item of existing) {
    if (item.id && !usedIds.has(item.id)) {
      evidence.push(normalizeCompletionEvidenceItem(item, item.description ?? "Task-specific completion evidence."));
    }
  }

  return evidence;
}

function makeTaskLocalState({ task, featureSlug, createdAt, featureRoot, firstTaskId }) {
  return {
    schemaVersion: 1,
    featureId: featureSlug,
    taskId: task.id,
    status: task.id === firstTaskId ? "ready" : "not_started",
    attempt: 0,
    owner: "task-orchestrator",
    dependencies: task.dependencies ?? [],
    blockers: [],
    paths: {
      task: `${repoRelative(featureRoot)}/tasks/${task.id}/task.md`,
      qa: `${repoRelative(featureRoot)}/tasks/${task.id}/QA.md`,
      plan: `${repoRelative(featureRoot)}/tasks/${task.id}/plan.md`,
      workerNotes: `${repoRelative(featureRoot)}/tasks/${task.id}/worker-notes.md`,
      reviewNotes: `${repoRelative(featureRoot)}/tasks/${task.id}/review-notes.md`,
      verificationNotes: `${repoRelative(featureRoot)}/tasks/${task.id}/verification.md`,
      report: `${repoRelative(featureRoot)}/tasks/${task.id}/report.html`
    },
    review: {
      status: "not_requested",
      openFindings: 0
    },
    verification: {
      status: "pending",
      lastRun: null
    },
    agentLifecycle: {
      openAgents: [],
      closedAgents: []
    },
    processEvents: [],
    updatedAt: createdAt
  };
}

function validateScaffold(featureRoot, allowEmpty) {
  const args = [path.join(SKILL_ROOT, "scripts", "validate_feature_state.mjs"), repoRelative(featureRoot)];
  if (allowEmpty) args.push("--allow-empty");

  try {
    const output = execFileSync(process.execPath, args, {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });
    return JSON.parse(output);
  } catch (error) {
    const stdout = error.stdout ? error.stdout.toString() : "";
    const stderr = error.stderr ? error.stderr.toString() : "";
    throw new Error(`Generated scaffold failed validation:\n${stdout}${stderr}`);
  }
}

function makeState({ featureName, featureSlug, branch, createdAt, prdPath, discussionPath, featureRoot, tasks }) {
  const sorted = sortTasks(tasks);
  const withOrder = sorted.map((task, index) => ({
    ...task,
    order: task.order ?? index + 1
  }));
  const firstTaskId = withOrder.find((task) => (task.dependencies ?? []).length === 0)?.id ?? null;

  return {
    schemaVersion: 3,
    feature: {
      id: featureSlug,
      name: featureName,
      status: firstTaskId ? "ready" : "not_started",
      branch,
      createdAt,
      updatedAt: createdAt,
      sourceDocuments: {
        prd: prdPath,
        discussion: discussionPath
      },
      paths: {
        workerNotes: `${repoRelative(featureRoot)}/worker-notes.md`,
        reviewNotes: `${repoRelative(featureRoot)}/review-notes.md`,
        verificationNotes: `${repoRelative(featureRoot)}/verification.md`,
        report: `${repoRelative(featureRoot)}/report.html`
      },
      progress: {
        currentTaskId: firstTaskId,
        lastCompletedTaskId: null,
        startedAt: null,
        completedAt: null,
        blockedReason: null
      },
      review: {
        status: "not_requested",
        requestedAgents: [],
        score: null,
        findings: [],
        decisions: [],
        resolutionEvidence: []
      },
      verification: {
        status: "pending",
        evidence: []
      }
    },
    orchestration: {
      purpose:
        "Drive every task in this feature sequentially to implementation, review, verification, and final completion with auditable state and human-readable markdown ledgers.",
      statusValues: [
        "not_started",
        "ready",
        "in_progress",
        "blocked",
        "ready_for_review",
        "review_in_progress",
        "changes_requested",
        "review_fixes_in_progress",
        "approved",
        "complete"
      ],
      reviewStatusValues: ["not_requested", "requested", "in_progress", "changes_requested", "approved", "approved_with_follow_up"],
      evidenceStatusValues: ["pending", "passed", "failed", "not_applicable", "deferred"],
      legalStatusTransitions: {
        not_started: ["ready", "blocked"],
        ready: ["in_progress", "blocked"],
        in_progress: ["blocked", "ready_for_review"],
        blocked: ["ready", "in_progress"],
        ready_for_review: ["review_in_progress"],
        review_in_progress: ["changes_requested", "approved"],
        changes_requested: ["review_fixes_in_progress"],
        review_fixes_in_progress: ["ready_for_review"],
        approved: ["complete"],
        complete: []
      },
      selectionRules: [
        "A task is ready when every dependency has status complete.",
        "Run tasks sequentially. Only the lowest-order incomplete dependency-ready task may be started.",
        "Do not launch workers for multiple tasks at the same time.",
        "Do not start HITL tasks until all AFK implementation tasks are complete.",
        "Do not mark a task complete until every completionEvidence item is passed, not_applicable, or deferred with rationale."
      ],
      updateRules: [
        "When work starts, set task.status to in_progress, increment progress.currentAttempt, set progress.startedAt when empty, and set progress.lastUpdatedAt.",
        "When implementation is ready for review, set task.status to ready_for_review, update worker-notes.md, and attach verification evidence gathered so far.",
        "After receiving worker or reviewer reports, copy useful output into durable notes/state and close the completed agent thread.",
        "When reviewers approve, set task.status to approved and review.status to approved or approved_with_follow_up.",
        "When all completion gates pass, set task.status to complete, set progress.completedAt, refresh report.html, and advance feature.progress.currentTaskId to the next sequential task."
      ],
      taskCompletionGate: TASK_COMPLETION_GATE,
      featureCompletionGate: [
        { id: "all-tasks-complete", description: "Every task in tasks has status complete." },
        { id: "no-open-blockers", description: "No task has unresolved blocker, unresolved review finding, or missing required artifact." },
        { id: "prd-alignment", description: "Feature behavior still matches the PRD." },
        { id: "final-verification", description: "Final feature-wide verification has been run and recorded by the orchestrator." }
      ]
    },
    sequencing: {
      mode: "sequential",
      taskIds: withOrder.map((task) => task.id),
      notes: "Parallel task execution is intentionally disabled until the orchestration process is trusted."
    },
    processEvents: [],
    tasks: withOrder.map((task) => ({
      id: task.id,
      name: task.name,
      type: task.type ?? "AFK",
      status: task.id === firstTaskId ? "ready" : "not_started",
      order: task.order,
      dependencies: task.dependencies ?? [],
      blocks: blocksFor(withOrder, task.id),
      touches: task.touches ?? [],
      conflictAreas: task.conflictAreas ?? [],
      recommendedReviewAgents: ["code-review"],
      paths: {
        state: `${repoRelative(featureRoot)}/tasks/${task.id}/state.json`,
        task: `${repoRelative(featureRoot)}/tasks/${task.id}/task.md`,
        qa: `${repoRelative(featureRoot)}/tasks/${task.id}/QA.md`,
        plan: `${repoRelative(featureRoot)}/tasks/${task.id}/plan.md`,
        workerNotes: `${repoRelative(featureRoot)}/tasks/${task.id}/worker-notes.md`,
        reviewNotes: `${repoRelative(featureRoot)}/tasks/${task.id}/review-notes.md`,
        verificationNotes: `${repoRelative(featureRoot)}/tasks/${task.id}/verification.md`,
        report: `${repoRelative(featureRoot)}/tasks/${task.id}/report.html`
      },
      progress: {
        assignedTo: null,
        startedAt: null,
        completedAt: null,
        lastUpdatedAt: createdAt,
        currentAttempt: 0,
        blockedReason: null
      },
      review: {
        status: "not_requested",
        requestedAgents: ["code-review"],
        score: null,
        findings: [],
        decisions: [],
        resolutionEvidence: []
      },
      verification: {
        status: "pending",
        automated: [],
        manual: [],
        storybook: [],
        simulator: [],
        notes: []
      },
      agentLifecycle: {
        openAgents: [],
        closedAgents: []
      },
      processEvents: [],
      completionEvidence: makeCompletionEvidence(task)
    }))
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const featureName = args.feature;
  if (!featureName) throw new Error("Missing --feature");

  const featureSlug = args.slug ?? slugify(featureName);
  const featureRoot = path.resolve(REPO_ROOT, "docs/.local/features", featureSlug);
  const branch = args.branch ?? currentBranch();
  const prdPath = args.prd ?? `${repoRelative(featureRoot)}/PRD.md`;
  const discussionPath = args.discussion ?? "";
  const createdAt = new Date().toISOString();
  const created = [];
  const skipped = [];
  const allowEmpty = args["allow-empty"] ?? false;

  assertPrdExists(prdPath);

  const tasks = assertUniqueTasks(loadTasks(featureRoot, args["tasks-file"]));
  if (tasks.length === 0 && !allowEmpty) {
    throw new Error("No tasks found. Create task folders, pass --tasks-file, or pass --allow-empty for an early skeleton.");
  }

  const sortedTasks = sortTasks(tasks);
  const orderedTasks = sortedTasks.map((task, index) => ({ ...task, order: task.order ?? index + 1 }));
  const firstTaskId = orderedTasks.find((task) => (task.dependencies ?? []).length === 0)?.id ?? null;

  mkdirSync(featureRoot, { recursive: true });
  mkdirSync(path.join(featureRoot, "tasks"), { recursive: true });
  for (const task of orderedTasks) {
    const taskDir = path.join(featureRoot, "tasks", task.id);
    const values = {
      NAME: task.name,
      TASK_NAME: task.name,
      TASK_TYPE: task.type ?? "AFK",
      FEATURE_NAME: featureName,
      FEATURE_SLUG: featureSlug,
      BRANCH: branch,
      PRD_PATH: prdPath,
      DISCUSSION_PATH: discussionPath,
      STATE_PATH: `${repoRelative(featureRoot)}/tasks/${task.id}/state.json`,
      CONTEXT: "Fill in task context.",
      WHAT_TO_BUILD: "Fill in implementation scope.",
      ACCEPTANCE_CRITERION: "Fill in acceptance criterion.",
      BLOCKED_BY: (task.dependencies ?? []).length > 0 ? task.dependencies.map((id) => `- \`${id}\``).join("\n") : "None - can start immediately.",
      USER_STORIES: "Fill in covered user stories.",
      GOAL: "Fill in task goal.",
      ASSUMPTION: "Fill in assumption.",
      IMPLEMENTATION_STEP: "Fill in implementation step.",
      TEST_PLAN_ITEM: "Fill in test plan item.",
      RISK_OR_CHECK: "Fill in risk or check.",
      DONE_CRITERION: "Fill in done criterion.",
      AREA: "Fill in area.",
      SCENARIO: "Fill in scenario.",
      EXPECTED_RESULT: "Fill in expected result.",
      EVIDENCE: "Pending.",
      OVERVIEW: "Task-level implementation notes.",
      PRIMARY_FILES: "Fill in expected owning files.",
      BASELINE: "Fill in baseline behavior before implementation.",
      DESIGN_DECISION: "Fill in design decision.",
      TRADEOFF: "Fill in tradeoff.",
      CREATED_AT: createdAt
    };

    writeIfMissing(path.join(taskDir, "task.md"), render(readTemplate("task.md.template"), values), args.force, created, skipped);
    writeIfMissing(path.join(taskDir, "QA.md"), render(readTemplate("QA.md.template"), values), args.force, created, skipped);
    writeIfMissing(path.join(taskDir, "plan.md"), render(readTemplate("plan.md.template"), values), args.force, created, skipped);
    writeIfMissing(path.join(taskDir, "worker-notes.md"), render(readTemplate("worker-notes.md.template"), values), args.force, created, skipped);
    writeIfMissing(path.join(taskDir, "review-notes.md"), render(readTemplate("review-notes.md.template"), values), args.force, created, skipped);
    writeIfMissing(path.join(taskDir, "verification.md"), render(readTemplate("verification.md.template"), values), args.force, created, skipped);
    writeIfMissing(
      path.join(taskDir, "report.html"),
      render(readTemplate("report.html.template"), values),
      args.force,
      created,
      skipped
    );
    writeIfMissing(
      path.join(taskDir, "state.json"),
      `${JSON.stringify(makeTaskLocalState({ task, featureSlug, createdAt, featureRoot, firstTaskId }), null, 2)}\n`,
      args.force,
      created,
      skipped
    );
  }

  const featureValues = {
    NAME: featureName,
    FEATURE_NAME: featureName,
    FEATURE_SLUG: featureSlug,
    FEATURE_ROOT: repoRelative(featureRoot),
    STATE_PATH: `${repoRelative(featureRoot)}/state.json`,
    BRANCH: branch,
    PRD_PATH: prdPath,
    DISCUSSION_PATH: discussionPath,
    CREATED_AT: createdAt,
    CURRENT_TASK_ID: firstTaskId ?? ""
  };

  writeIfMissing(
    path.join(featureRoot, "worker-notes.md"),
    render(readTemplate("worker-notes.md.template"), featureValues),
    args.force,
    created,
    skipped
  );
  writeIfMissing(
    path.join(featureRoot, "review-notes.md"),
    render(readTemplate("review-notes.md.template"), featureValues),
    args.force,
    created,
    skipped
  );
  writeIfMissing(
    path.join(featureRoot, "verification.md"),
    render(readTemplate("verification.md.template"), featureValues),
    args.force,
    created,
    skipped
  );
  writeIfMissing(
    path.join(featureRoot, "report.html"),
    render(readTemplate("report.html.template"), featureValues),
    args.force,
    created,
    skipped
  );

  const state = makeState({
    featureName,
    featureSlug,
    branch,
    createdAt,
    prdPath,
    discussionPath,
    featureRoot,
    tasks
  });
  writeIfMissing(path.join(featureRoot, "state.json"), `${JSON.stringify(state, null, 2)}\n`, args.force, created, skipped);
  const validation = validateScaffold(featureRoot, allowEmpty);

  console.log(
    JSON.stringify(
      {
        featureRoot: repoRelative(featureRoot),
        tasks: tasks.length,
        created,
        skipped,
        validation
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
