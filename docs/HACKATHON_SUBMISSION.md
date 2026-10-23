# Root & Reason — Hackathon Submission Package

## 1. Project Description (Devpost / Short Form)

**Elevator Pitch:**
Root & Reason is an AI-assisted SOC incident investigator that ingests security logs, detects credential attacks with deterministic TypeScript rules, correlates event timelines into deduplicated incidents, and powers an evidence-grounded **Alexa+ simulated conversational copilot** using Google Gemini.

**The Problem:**
Modern SOC analysts face severe alert fatigue and struggle to piece together multi-step attacks across disjointed log streams. Meanwhile, conventional LLM chatbots frequently hallucinate timestamps, invent IP addresses, and fail to provide verifiable proof for their claims.

**The Solution:**
Root & Reason combines strict deterministic security detection and correlation with an intelligent conversational assistant. Every claim made by the assistant is programmatically verified against backend log records. If a cited event ID does not exist in the verified backend bundle, the AI output is rejected in favor of an evidence-backed deterministic report.

---

## 2. Selected Track & Alignment

- **Primary Track:** Alexa+ Simulated Web Experience
- **Track Boundary:** Root & Reason simulates the next-generation Alexa+ conversational intelligence experience in a high-density security operations web application. It integrates voice synthesis simulation, structured multi-turn dialogue, incident context retention, and strict grounding in backend enterprise data records without claiming access to restricted production Alexa hardware or unreleased internal SDKs.

---

## 3. Tooling, APIs, & SDKs Genuinely Used

| Category | Tool / API / SDK | Usage in Root & Reason |
|---|---|---|
| **Development Tooling** | Amazon Devices Builder Tools (ADBT MCP) | Context steering document (`GEMINI.md v7.0`), 19 Amazon agent skills, MCP configuration in Antigravity |
| **Frontend Framework** | Next.js 16.4.2 & React 19 | App Router, Turbopack, Partial Prerendering, TypeScript Strict Mode |
| **AI SDK** | Google GenAI SDK (`@google/genai`) | Server-side Gemini model execution, structured JSON schema outputs, multi-turn conversational investigation |
| **Database & Schema** | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) | PostgreSQL relational schema with 9 tables, indexes, RLS policies, and migrations |
| **Security Core** | PapaParse, Custom Detection Engine | CSV/JSON parsing, UTC timestamp normalization, sliding-window detection rules, idempotent correlation |
| **Testing** | Vitest 5.0.5 | 14 automated unit tests covering parser, rules, scoring, and zero-hallucination verifier |

---

## 4. Product Feedback & Friction Log for Amazon Devices Builder Tools (ADBT)

### Friction Log Item 1: Git Requirement during Skill Installation
- **Tool**: `@amazon-devices/amazon-devices-buildertools-mcp@1.0.17` (`init-context`)
- **Observed Behavior**: `⚠️ git not found. Skipping Amazon Developers led community skills installation. Install Git from https://git-scm.com/downloads and try again.`
- **Impact**: While curated skills installed properly, community skills required external Git CLI rather than falling back to an HTTPS zip/tarball download.
- **Workaround**: Curated skills installed cleanly without Git; workspace proceeded using curated context.
- **Suggested Improvement**: Support direct GitHub REST API or zip archive downloads for community skills when `git` is absent from the host `PATH`.

### Friction Log Item 2: Pre-existing `.gemini` Directory Conflict with `create-next-app`
- **Tool**: `init-context` creating `.gemini/` in an empty workspace
- **Observed Behavior**: Running `npx create-next-app .` afterwards failed because the directory was no longer strictly empty due to the newly created `.gemini` folder.
- **Impact**: Developer must temporarily move `.gemini`, run `create-next-app`, and restore `.gemini`.
- **Suggested Improvement**: Document the recommended ordering (initialize project template first, then run `init-context`) or have `init-context` place context in `.agents/` or IDE-global directories.

---

## 5. Video Demonstration Script (Under 3 Minutes)

**Target Duration:** 2 minutes 45 seconds

| Timestamp | Scene | Visual | Audio Narration |
|---|---|---|---|
| **0:00 - 0:25** | Introduction | Homepage (`/`) & Problem statement | *"Welcome to Root & Reason, an AI incident investigator built for the Amazon Developer Hackathon's Alexa+ simulated track. In modern SOCs, analysts are overwhelmed by raw logs and generic chatbots that hallucinate facts. Root & Reason solves this by grounding conversational intelligence in deterministic security detections."* |
| **0:25 - 0:50** | Dashboard & Metrics | Dashboard (`/dashboard`) | *"Here on the SOC dashboard, we see real-time metrics: 15 events processed across our enterprise network, 3 correlated incidents, and an average risk score of 50. All numbers are calculated from actual backend records."* |
| **0:50 - 1:20** | Log Ingestion | Ingestion view (`/logs`) | *"Let's ingest a new batch of logs. We can drag and drop CSV or JSON logs, or load our synthetic credential stuffing scenario with one click. Root & Reason validates timestamps, converts them to UTC, detects malformed rows, and protects against prompt injection inside log payloads."* |
| **1:20 - 2:05** | Incident Detail & Alexa+ Copilot | Incident view (`/incidents/[id]`) | *"Let's open our critical incident: a potential compromise on analyst01. Notice the explainable risk score of 85/100 and the chronological timeline. Now, let's ask our simulated Alexa+ Copilot: 'What happened before the successful login?'. Notice how the assistant separates verified facts from hypotheses, citing exact event IDs evt_sec_101 through 104."* |
| **2:05 - 2:35** | Report Generation & Export | Report Modal (`/reports`) | *"Next, we ask the assistant to generate the investigation report. Root & Reason compiles an evidence-backed audit report with MITRE ATT&CK techniques, timeline progression, and containment steps. We can export this as Markdown or HTML."* |
| **2:35 - 2:45** | Verification & Conclusion | Vitest Terminal & Wrap-up | *"All 14 unit tests pass with zero errors, and ADBT context v7.0 steered the build. Root & Reason: bringing verified intelligence to security operations."* |

---

## 6. Submission Checklist (Devpost)

- [x] Working Next.js 16 application with TypeScript and Tailwind CSS 4.
- [x] Full vertical slice: Log Ingestion $\rightarrow$ Normalization $\rightarrow$ Detection $\rightarrow$ Correlation $\rightarrow$ Risk Scoring $\rightarrow$ Alexa+ Investigation $\rightarrow$ Report Generation.
- [x] Zero-hallucination evidence verification with deterministic fallback report generation.
- [x] Supabase PostgreSQL database migration (`20261021000000_root_and_reason_schema.sql`) and `seed.sql`.
- [x] Deterministic synthetic scenario fixtures (`synthetic_auth_brute_force.json`, `synthetic_password_spray.csv`, `synthetic_malformed_and_injection.csv`).
- [x] Amazon Devices Builder Tools (ADBT) initialized and verified with status `✅ Fully configured`.
- [x] 24 automated unit tests running and passing via `npm test` (includes a regression guard for shared data-store state and `/api/v1/stats` consistency).
- [x] Production build passes cleanly via `npm run build`.
- [x] Open-source MIT License included.
- [x] Public English-language video demo script prepared under 3 minutes.
