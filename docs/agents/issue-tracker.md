# Issue Tracker: GitHub

Implementation issues and PRDs both live in GitHub for `randallmlough/dont-forget`, but they use different tracker surfaces:

- Implementation work items live as GitHub Issues.
- PRDs live as GitHub Discussions by default.

Use the `gh` CLI for all operations. Infer the repo from `git remote -v`; `gh` does this automatically when run inside this clone.

## Repository

`randallmlough/dont-forget`

## GitHub Issue Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc or body file for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, including labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

## Publishing PRDs

When a skill says "publish this PRD", create a GitHub Discussion, not a GitHub Issue. Use the `Ideas` discussion category unless the user asks for a different category.

The installed `gh` CLI does not provide a native `gh discussion create` command, so use `gh api graphql`.

### 1. Get Repository And Discussion Category IDs

```sh
gh api graphql \
  -f query='query {
    repository(owner: "randallmlough", name: "dont-forget") {
      id
      discussionCategories(first: 20) {
        nodes { id name slug }
      }
    }
  }'
```

Use the returned repository `id` and the category `id` for `Ideas` by default.

### 2. Create The Discussion

Write the PRD body to a temporary Markdown file, then create the discussion:

```sh
gh api graphql \
  -f query='mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
    createDiscussion(input: {
      repositoryId: $repositoryId
      categoryId: $categoryId
      title: $title
      body: $body
    }) {
      discussion { id number title url }
    }
  }' \
  -F repositoryId=<repository-id> \
  -F categoryId=<discussion-category-id> \
  -F title='PRD: <title>' \
  -F body=@/path/to/prd-body.md
```

After the discussion is created, delete the temporary PRD body file unless the user explicitly asked to keep a local copy.

### 3. Apply The Triage Label

PRD discussions should receive the `ready-for-agent` label when they are fully specified.

Fetch the label ID:

```sh
gh api graphql \
  -f query='query {
    repository(owner: "randallmlough", name: "dont-forget") {
      label(name: "ready-for-agent") { id name }
    }
  }'
```

Apply the label to the discussion. Quote the `labelIds[]` field so the shell does not treat brackets as a glob:

```sh
gh api graphql \
  -f query='mutation($labelableId: ID!, $labelIds: [ID!]!) {
    addLabelsToLabelable(input: {
      labelableId: $labelableId
      labelIds: $labelIds
    }) {
      labelable {
        ... on Discussion {
          id
          url
          labels(first: 10) { nodes { name } }
        }
      }
    }
  }' \
  -F labelableId=<discussion-id> \
  -F 'labelIds[]=<ready-for-agent-label-id>'
```

### 4. Add Follow-up Comments

Use GraphQL to add comments such as pseudocode, implementation notes, or links to supporting docs:

```sh
gh api graphql \
  -f query='mutation($discussionId: ID!, $body: String!) {
    addDiscussionComment(input: {
      discussionId: $discussionId
      body: $body
    }) {
      comment { id url }
    }
  }' \
  -F discussionId=<discussion-id> \
  -F body=@/path/to/comment.md
```

Delete temporary comment files after publishing unless the user explicitly asked to keep them.
