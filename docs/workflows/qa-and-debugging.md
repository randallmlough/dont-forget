# QA and Debugging Workflow

Use this playbook when a change needs native iOS proof beyond Jest, especially for navigation, accessibility, keyboard behavior, safe areas, local-first Household data, sync, or simulator/device state.

## Start With a Repro Contract

Before opening the simulator, write down the smallest contract you need to prove:

- **Surface**: the route or screen, such as Home rendering the active Household's Current List.
- **State**: signed out, signed in as a test User, empty List, offline, pending sync, or another relevant setup.
- **Action**: the exact user action, such as focusing the Item name input or checking an Item.
- **Expected result**: visible UI, accessibility state, database/log outcome, and what must not happen.
- **Stop condition**: the command, screenshot, log excerpt, or simulator observation that proves the bug is reproduced or fixed.

Keep this contract in the issue, PR description, implementation notes, or a short local note so the verification evidence is reviewable.

## Tool Selection

| Need | Prefer | Why |
| --- | --- | --- |
| Run the app and keep logs visible | `make ios`, optionally in cmux | Uses the project command and keeps Metro/native output available. |
| Inspect and operate the iOS app | RocketSim | Reads accessibility, taps/types by label or id, waits for keyboard/screen state, and captures screenshots. |
| Operate the macOS Simulator or another local app | Computer Use | Useful for UI that RocketSim cannot control directly, such as host app windows or simulator chrome. |
| Preserve a reproducible terminal layout | cmux, if available | Lets agents create helper panes for the app, logs, and notes without stealing focus. |

Automated tests still matter. Use focused Jest or type checks while iterating, then `make format` and `make verify` for TS/TSX changes when practical. Native runtime behavior still needs simulator proof.

## Running the App

Use the Makefile rather than raw package-manager commands:

```bash
make ios
```

If the app opens on an auth screen, create or use a local/test User only when the scenario needs a signed-in state. After authentication, Home should render the active Household's Current List.

Watch the terminal that launched the app. In development, app diagnostic logs are mirrored to the console through the logger, and native/runtime errors often appear in the same output as Metro logs.

## cmux, If Available

cmux is optional. Check for it first:

```bash
command -v cmux
```

If it is available, use it to keep the current task organized:

```bash
cmux identify --json
cmux list-panes --workspace "${CMUX_WORKSPACE_ID:-}" --json
cmux new-pane --workspace "${CMUX_WORKSPACE_ID:-}" --type terminal --direction right --focus false
```

Prefer non-disruptive actions:

- Scope actions to `CMUX_WORKSPACE_ID` and `CMUX_SURFACE_ID` when those variables exist.
- Create a right-side helper pane for `make ios`, logs, or focused test runs.
- Pass `--focus false` when the command supports it.
- Do not change panes, workspace focus, or send input to another workspace unless the user explicitly asked for that target.

Useful commands:

```bash
cmux send --surface "$CMUX_SURFACE_ID" "make ios\n"
cmux read-screen --surface "$CMUX_SURFACE_ID"
cmux list-log --workspace "${CMUX_WORKSPACE_ID:-}" --limit 20
```

If cmux is unavailable or cannot connect, fall back to normal terminal tabs and note that the QA evidence was captured without cmux.

## RocketSim

RocketSim is the preferred way to drive and inspect the iOS Simulator. Resolve the CLI before using it:

```bash
command -v rocketsim
```

Start by reading the current screen or accessibility tree:

```bash
rocketsim screen
rocketsim elements --agent --agent-mode nav
rocketsim elements --agent --agent-mode act > /tmp/rs-snap.json
```

Use labels first and ids only when labels are ambiguous. Prefer `--screen latest` to guard against acting on stale snapshots:

```bash
rocketsim interact tap --label "Item name" --screen latest
rocketsim interact type "Milk" --label "Item name" --screen latest
rocketsim wait keyboard --state visible --timeout 2
```

Batch known sequences with `rocketsim do`:

```bash
rocketsim do \
  --refresh-policy smart \
  --step "interact tap --label 'Item name' --screen latest" \
  --step "wait keyboard --state visible --timeout 2" \
  --step "interact type 'Milk' --label 'Item name' --screen latest"
```

Capture visual evidence when the accessibility tree is not enough:

```bash
rocketsim snapshot --agent-mode act > /tmp/current-list.png
rocketsim screenshot > /tmp/simulator.png
```

For bug reproduction, record:

- the RocketSim command used to reach the state;
- the visible/accessibility result;
- the exact log line or absence of the error;
- whether the keyboard is visible, hidden, or expected not to appear.

## Computer Use

Use Computer Use when a task requires direct local Mac UI interaction that RocketSim or project commands do not expose. Examples:

- selecting or inspecting Simulator chrome;
- operating RocketSim's macOS UI if the CLI is unavailable;
- reading a local app window or dialog that is outside the iOS app accessibility tree.

Keep it narrow:

- Prefer RocketSim for app content inside the iOS Simulator.
- Avoid broad clicking around; inspect the visible state first, then make one targeted action.
- Do not use Computer Use for risky UI actions such as deleting data, changing system settings, creating accounts, or transmitting sensitive data without explicit confirmation at the action point.
- Include what was clicked or typed in the QA notes so another reviewer can repeat it.

## Reproduction Loop

1. Confirm the branch and worktree state.
2. Start the app with `make ios` and keep the launch terminal visible.
3. Navigate to the target state with RocketSim where possible.
4. Trigger the smallest action that demonstrates the bug.
5. Capture the evidence: screen/accessibility snapshot, command transcript, logs, screenshot, or database observation.
6. Minimize the hypothesis before changing code. If a smaller failing test can cover the bug, write that test first.

Example for an input/keyboard issue:

```bash
rocketsim elements --agent --agent-mode act > /tmp/home-before-focus.json
rocketsim interact tap --label "Item name" --screen latest
rocketsim wait keyboard --state visible --timeout 2
```

If the wait fails, capture the visible state and logs before retrying so the failure is not lost.

## Verification Loop

After the fix:

1. Run the most focused automated proof for the changed code.
2. Run `make format`.
3. Run `make verify` when practical for TS/TSX changes.
4. Re-run the original simulator repro exactly enough to prove the stop condition changed.
5. Confirm no throwaway debug logs, temporary screenshots, or local notes are accidentally committed.

For native UI fixes, include simulator evidence in the PR, for example:

- `make verify` passed.
- RocketSim focused `Item name`; keyboard became visible within two seconds.
- Adding an Item updated the Current List and did not print the previous error.

## Log Triage

When logs report an error:

- Copy the smallest useful excerpt, not the whole Metro stream.
- Include the action that produced it and whether it is user-visible.
- Distinguish expected offline/network noise from app errors. Offline writes should keep Item changes local and surface an offline/pending state rather than fail the user action.
- Prefer logging once at the owning boundary. Do not add logs in multiple layers just to make a repro easier.

## Evidence Checklist

A good QA/debugging note answers:

- What branch and app environment were used?
- Which User/Household/List state was tested?
- Which commands launched and verified the app?
- Which RocketSim or Computer Use actions reproduced the behavior?
- What exact error, screenshot, accessibility state, or visible UI proved the before and after?
- What automated checks passed?
