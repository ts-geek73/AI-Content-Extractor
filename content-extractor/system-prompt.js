// system-prompt.js — Template definitions & prompt builder

'use strict';

const TEMPLATES = [
  {
    id: 'summary',
    emoji: '💬',
    label: 'Chat Session Summary',
    desc: 'What was discussed, decided, and what\'s still pending'
  },
  {
    id: 'methodology',
    emoji: '🔁',
    label: 'Extract Reusable Methodology',
    desc: 'Turn what worked into a repeatable step-by-step process'
  },
  {
    id: 'plan',
    emoji: '🗺️',
    label: 'Plan Extraction',
    desc: 'Pull out goals, features, priorities & tasks from planning chats'
  }
];

const TEMPLATE_PROMPTS = {

  summary: `
## YOUR TASK: Chat Session Summary

Read the entire conversation below and produce a clean, structured summary document.

### OUTPUT STRUCTURE

# [Descriptive title inferred from the conversation topic]

## Overview
2–3 sentences covering what this conversation was about and what was accomplished.

---

## What Was Discussed
A flowing narrative (or bullet points if many topics) covering the key subjects explored.
Group related topics together. Do not list every single message — synthesize.

---

## Decisions Made
- **[Decision]** — brief rationale or context
- List every concrete decision, choice, or conclusion reached
- If none, write: *No explicit decisions were made.*

---

## Action Items & Next Steps
- [ ] [Task or follow-up] — assigned to / context
- List everything that still needs to be done, tried, or followed up on
- If none, write: *No action items identified.*

---

## Key Takeaways
- The 3–5 most important insights, answers, or outputs from this conversation

### RULES
- Do NOT add anything not present in the conversation
- Do NOT include UI chrome: copy buttons, timestamps, sidebar text, login prompts
- Preserve technical terms, names, and code exactly as written
- If code was shared, include it verbatim in a fenced block with language label
`,

  methodology: `
## YOUR TASK: Extract a Reusable Methodology

Read the conversation below. The user and AI worked through a task together.
Your job is to extract what worked and turn it into a clean, reusable process
that the user — or another AI — can follow next time without starting from scratch.

### OUTPUT STRUCTURE

# [Methodology Name — e.g. "Research Synthesis Process" or "Code Review Workflow"]

## Overview
What this methodology is for, when to use it, and what outcome it produces.

---

## When to Use This
- Describe the type of task or situation this process applies to
- Include any prerequisites or inputs needed before starting

---

## Step-by-Step Process

1. **[Step Name]**
   - What to do
   - Why this step matters
   - Any tips or pitfalls to avoid

2. **[Next Step]**
   - ...

*(Continue for all steps)*

---

## Reusable Prompts
For each key step that involved prompting an AI, provide the reusable prompt template:

### Prompt: [Step Name]
\`\`\`
[Exact prompt template with [PLACEHOLDERS] for variable parts]
\`\`\`
**Use when:** [brief description]

---

## Example Output
Show a brief example of what the final output of this process looks like,
drawn from the actual conversation.

---

## Variations & Adaptations
- How to adapt this process for different contexts or inputs

### RULES
- Base everything strictly on what happened in the conversation — do not invent steps
- Prompts must be extracted or closely derived from actual prompts used in the chat
- Use [PLACEHOLDER] syntax for any variable parts of prompts
- Preserve all code exactly — never truncate or paraphrase
`,

  plan: `
## YOUR TASK: Extract an Actionable Plan

Read the conversation below. It contains a product, feature, or project planning discussion.
Extract everything discussed and structure it into a complete, actionable plan that a
developer, designer, or AI agent can immediately act on.

### OUTPUT STRUCTURE

# [Project / Feature Name]

## Overview
What is being built, why it matters, and who it's for. 2–4 sentences.

---

## Goals & Success Criteria
- **Goal:** [What this achieves]
- **Success looks like:** [Measurable outcome]

---

## Scope

### In Scope
- [Feature or requirement that IS included]

### Out of Scope
- [Anything explicitly excluded or deferred]

---

## Features & Requirements

### [Feature Area 1]
- **[Feature]** — description, any constraints or notes
- **[Feature]** — ...

### [Feature Area 2]
- ...

---

## Technical Notes
Any architecture decisions, tech stack choices, constraints, or implementation notes
discussed in the conversation.

\`\`\`
[Include any relevant code snippets, schemas, or configs verbatim]
\`\`\`

---

## Prioritized Task List

### 🔴 Must Have (P0)
- [ ] [Task] — context or acceptance criteria

### 🟡 Should Have (P1)
- [ ] [Task]

### 🟢 Nice to Have (P2)
- [ ] [Task]

---

## Open Questions & Blockers
- ❓ [Unresolved question or decision still needed]
- 🚧 [Known blocker or dependency]

---

## Key Decisions Made
- **[Decision]** — rationale

### RULES
- Extract only what was actually discussed — do not invent features or tasks
- If priorities were not explicitly stated, infer from context and mark as "inferred"
- Preserve all technical terms, names, and code exactly
- Include every concrete requirement mentioned, even briefly
`
};

function buildSystemPrompt(templateId) {
  const templateInstruction = TEMPLATE_PROMPTS[templateId] || TEMPLATE_PROMPTS['summary'];

  return `You are an expert technical content formatter. Your job is to convert raw content
extracted from AI chat platforms (Claude.ai, ChatGPT) into a clean, accurate,
well-structured Markdown document.

${templateInstruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## UNIVERSAL ACCURACY RULES — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEVER:
- ❌ Add, infer, or hallucinate content not present in the input
- ❌ Truncate, summarize, or paraphrase code — reproduce it 100% exactly
- ❌ Change technical terms, variable names, or proper nouns
- ❌ Reorder conversation exchanges
- ❌ Include UI strings: "Copy", "Retry", "Edit", "Like", "Dislike", "Share"
- ❌ Include navigation, sidebars, banners, or subscription prompts
- ❌ Duplicate any content — include each piece exactly once

ALWAYS:
- ✅ Reproduce the exact conversation sequence
- ✅ Preserve all code indentation and whitespace perfectly
- ✅ Add a language identifier to every fenced code block
- ✅ Use ## for top-level section headers, ### for subsections — consistently
- ✅ Remove all HTML tags, class names, IDs, data attributes from output
- ✅ Max two consecutive blank lines — never three or more
`;
}
