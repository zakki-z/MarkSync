# ADR-002: Application Stack and Document Storage

- **Status:** Proposed (to become *Accepted* when this PR is merged after peer review)
- **Date:** 2026-10-24
- **Deciders:** MarkSync team
- **Related:** [ADR-001: Real-Time Concurrency Architecture](ADR-001-real-time-concurrency-architecture.md)

## Context

MarkSync is an enterprise-style, real-time collaborative Markdown platform. The module brief asks us to justify four choices: the **frontend framework**, the **backend runtime**, the **database**, and the **real-time transport**. This ADR also records the supporting architectural and infrastructure decisions that follow from them.

Constraints and forces:

- **Walking skeleton (Task 1).** Signup and login with state persisted in a database; create, view and save a document (title, author, raw Markdown); basic Markdown rendering in the frontend; a bi-directional WebSocket with a live presence roster or heartbeat; runnable locally from a clear README.
- **Later tasks extend it.** The Markdown parser will be extended, and concurrent multi-user editing arrives in Task 2 (see ADR-001).
- **Team.** Three people, one module. We want the project to double as a learning exercise in a modern distributed stack, and the module convenor approved going beyond the suggested stack.
- **Domain shape.** Identity, workspaces, permissions and document metadata are relational and need transactional integrity. Real-time collaboration state is binary, append-heavy and event-driven. Content analysis (AI) and notifications are asynchronous consumers.
- **Run anywhere locally.** The whole system must start with one command on a marker's machine. Cloud deployment is not required yet.
- **Current repository.** A monorepo with service scaffolds only: a Next.js frontend, FastAPI services, Spring Boot services and a Bun-based TypeScript Collaboration service. There is no Docker Compose file or root README yet.

## Decision

### 1. Frontend: React and TypeScript

| | React + TypeScript (chosen) | Svelte | Vue |
|---|---|---|---|
| Ecosystem for our needs | Largest. Mature Markdown AST tooling (remark/rehype), and editor bindings for CodeMirror and Yjs are well documented. | Good, with smaller ecosystem. | Good. |
| Type sharing with the Collaboration service | Same language and tooling end to end. | Same. | Same. |
| Team learning value | Industry-standard skill. | Valuable, but less transferable. | Valuable. |
| Risk | Larger bundle and more boilerplate. | Fewer examples for collaborative-editor integration. | Mid. |

The repository is scaffolded with Next.js (a React framework). The editor page runs on the client because it holds a live WebSocket. Markdown is rendered with the remark/rehype pipeline so the parser can be extended through plugins in later tasks. TypeScript is mandatory for the frontend.

### 2. Real-time transport: native WebSockets

| | Native WebSocket (chosen) | Socket.io | Server-Sent Events |
|---|---|---|---|
| Full duplex | Yes | Yes | **No** (server to client only). The brief rejects this. |
| Fit with Yjs | Direct. Yjs sync and awareness messages are binary and framed for a plain socket. | Adds its own protocol and framing on top. | Not applicable. |
| Fallbacks (long-polling) | None. We do not need them on modern browsers. | Built in, but unneeded. | n/a |
| Rooms and auto-reconnect | We implement a small reconnect-with-backoff and room map ourselves. | Provided. | Built-in reconnect only. |
| Coupling | Standard protocol, any client works. | Client and server must both use Socket.io. | Standard. |

We accept writing our own reconnect, heartbeat and room handling. In exchange we avoid an extra protocol layer and stay compatible with the Yjs ecosystem. WebRTC data channels are covered in ADR-001 and rejected there.

### 3. Backend runtime: microservices, one language per fit

| Service | Technology | Reason |
|---|---|---|
| Authentication | Python, FastAPI | Lightweight async APIs; JWT issuing and validation. |
| Document | Java, Spring Boot | Transactional consistency; document lifecycle and version management. |
| Workspace | Java, Spring Boot | Business rules, access control and workspace management. |
| Collaboration | TypeScript on a Node-compatible runtime | Event-driven, non-blocking I/O for many concurrent WebSockets; shares the language of the Yjs ecosystem and the frontend. The skeleton currently runs on Bun. |
| AI | Python, FastAPI | Mature ML and LLM ecosystem for semantic search. |
| Notification | Python, FastAPI | Small service consuming events and triggering notifications. |

**Why not a single runtime?** One language (for example only TypeScript) would be simpler for three people. We accept the cost of three languages because each choice has a technical reason above, the module brief allows it, and it is part of our learning goal. To keep the cost down, every service exposes a `/health` endpoint, ships as a Docker image, and has its own job in the GitHub Actions workflow. REST contracts are described in OpenAPI.

### 4. Databases, storage and ownership

| Store | Technology | Owns | Why |
|---|---|---|---|
| Relational | PostgreSQL | Users and refresh tokens (Auth); workspaces and permissions (Workspace); document metadata, versions and the latest Markdown text (Document) | ACID transactions and relational integrity for identity, permissions and document records. |
| Document store | MongoDB | Yjs binary updates and snapshots (Collaboration); derived data for the AI service | Flexible, schema-light storage for binary and evolving data. |
| Event log | Apache Kafka | Domain events between services | Decoupled asynchronous communication. |

Alternatives considered:

- **SQLite:** rejected as the system database. It does not fit several services with separate processes and network access, although it would work for a single-service prototype.
- **PostgreSQL only** (Yjs state as `bytea`/JSONB, no MongoDB): a legitimate simpler option with one less component to run. We chose MongoDB to keep append-heavy CRDT state out of the transactional store, to match its flexible-schema strengths, and for team learning. **We will revisit this if running two databases proves too costly.**
- **AI storage:** semantic search may need a vector index, which MongoDB running locally may not provide. That choice is deferred to a separate ADR when the AI service is designed.

**Database per service.** Each service owns its data. In local development this means a separate logical database per service in a single PostgreSQL container. There are no cross-service joins: services reference each other by ID, and consistency across services is eventual and driven by events.

**Document storage rule.** The Document service stores title, author, workspace and Markdown text in PostgreSQL and is the source of truth for the saved document. Live editing state lives in MongoDB and is reflected back to the Document service as described in ADR-001.

### 5. Supporting architectural decisions

| Decision | Rationale | Cost we accept |
|---|---|---|
| Microservices | Independent deployment, modularity, service-level scaling. | More moving parts and network failure modes than a modular monolith for a three-person team. Mitigated by Docker Compose, a monorepo and a small walking skeleton. |
| Event-driven architecture (Kafka) | Loose coupling; the AI and Notification services consume events without the producer knowing them. | Kafka is heavy for a skeleton. It is introduced incrementally: not needed to pass Task 1, and the first topics arrive with the first cross-service consumer. A single-node broker runs in Docker Compose. |
| REST APIs | Simple synchronous calls between clients and services. | Chatty if overused. Real-time traffic uses WebSockets instead. |
| WebSockets | Persistent connections for live collaboration (see section 2). | Stateful connections complicate scaling, see ADR-001. |
| JWT authentication | Stateless identity between services. The Auth service signs short-lived access tokens with an asymmetric key so other services verify with the public key and never hold the signing secret. Refresh tokens and users are stored in PostgreSQL. | Revocation is not immediate. Mitigated by short lifetimes and the `permission.changed` event for open sockets. |
| Database per service | Clear data ownership and low coupling. | No cross-service transactions. A transactional outbox in the Document service is a likely follow-up to avoid losing events on a failed publish. |
| Monorepo | One place for code, reviews and CI, which suits a three-person team. | CI must stay fast as the repository grows. Path filters can be added to the workflow. |

### 6. DevOps, monitoring and testing

**Now:** Git and GitHub (pull requests, review, branch protection), GitHub Actions (lint, type-check, test and build per stack), Docker (one image per service), Docker Compose (the whole system with one command).

**Later, not decided yet:** the table lists when each becomes relevant.

| Tool | Purpose | Trigger for adopting |
|---|---|---|
| Kubernetes | Orchestration, rolling deploys, service discovery, horizontal scaling | A cloud deployment becomes a requirement. |
| Terraform | Reproducible cloud infrastructure | Same trigger. |
| Ansible | Server configuration and provisioning | A non-Kubernetes host needs configuring. |
| Prometheus and Grafana | Metrics and dashboards | Services have real behaviour worth measuring. |
| k6 or Locust | Load and scalability testing | Task 2 has live editing to load. To be selected, and WebSocket support is a selection criterion. |

## Consequences

**Positive**

- Each technology is used where it is strongest, and the stack matches the brief's skeleton and later-task needs.
- Clear data ownership makes failures and responsibilities easy to reason about.
- Docker Compose gives markers and teammates a single, repeatable way to run everything.
- Task 1 maps directly onto the architecture:

| Task 1 requirement | Where it is delivered |
|---|---|
| Signup and login, state in a database | Authentication service and PostgreSQL |
| Create, view and save a document | Document service and PostgreSQL |
| Markdown rendering | React frontend |
| Bi-directional WebSocket presence | Collaboration service |
| Local run with clear instructions | Docker Compose and a root README |

**Negative and risks**

- Operational overhead is high for the team size: three languages, two databases, and Kafka. This is the main risk of the whole decision. We will review it after Task 1 and simplify (for example, drop MongoDB or defer Kafka) if it slows delivery.
- The repository currently has no Docker Compose file and no root README. Both are required for the skeleton and are the next work items.
- Separate PostgreSQL logical databases and event-driven synchronisation mean data may be briefly out of date between services.
- Skills are spread across Python, Java and TypeScript, so reviews of unfamiliar languages need extra care.

**Follow-ups**

- Add `docker-compose.yml` (frontend, all services, PostgreSQL, MongoDB; Kafka when first needed) and a root README with start-up steps.
- Declare the missing dependencies and a `pyproject.toml` for the AI and Notification services so they can join CI.
- Commit `uv.lock` files for Python services.
- Write a separate ADR for the AI service's storage and semantic-search approach.
- Select k6 or Locust and record the decision.

## AI Prompt Appendix

### Prompts used

Rows 1 to 3 are from our earlier MarkSync conversations with ChatGPT; the exact model variant was not recorded. Rows 4 and 5 are consultations with Claude.

| # | Prompt (verbatim) | AI tool and date | What we took from the answer |
|---|---|---|---|
| 1 | “do you recommend python or java for authentication?
what message broker you recommend?
answer briefly” | ChatGPT, 19 October 2026 | We examined language fit for authentication and the trade-off between lightweight messaging and a more capable event platform. We subsequently chose FastAPI for authentication. |
| 2 | “what about Kafka” | ChatGPT, 19 October 2026 | The response helped distinguish asynchronous event delivery from live collaborative editing: Kafka can distribute domain events, but WebSockets handle client connections and Kafka does not resolve concurrent text edits. |
| 3 | “I need you briefly mention every technology within our stock and why we chose it” | ChatGPT, 24 October 2026 | We consolidated the reasons for React/TypeScript, FastAPI, Spring Boot, Node.js, PostgreSQL, MongoDB, Kafka, Docker and GitHub Actions, with Kubernetes, Terraform and Ansible deferred until later. This summary informed the documented stack but was not independent validation of each choice. |
| 4 | “how would the project structure would look like” | Claude, 24 October 2026 | A layout of the monorepo (one Next.js frontend and six backend services, each with its own toolchain). It showed that the repository had no Docker Compose file or root README, which we recorded as follow-ups. |
| 5 | “do you think we made all the requirement apart from the walking skeleton” | Claude, 25 October 2026 | A requirement-by-requirement check against the brief. It identified gaps in our CI and prompt log, which we then fixed. |

### Critical commentary

The AI helped us organise a **polyglot stack** around specific service responsibilities and distinguish synchronous REST calls, real-time WebSockets and asynchronous Kafka events. Identifying PostgreSQL as a good fit for transactional identity and document metadata was sound advice, as was articulating why Python suits AI-oriented services and TypeScript suits collaboration. Claude also usefully raised alternatives we had not written down, such as a PostgreSQL-only option and introducing Kafka incrementally. Its weaker advice was that a large microservice stack can sound straightforward on paper even though **six services, three languages, two databases and Kafka** create considerable build, integration, debugging and deployment overhead for a three-person student team. Some of Claude's suggestions, such as a transactional outbox and asymmetric JWT signing keys, go beyond what the Task 1 skeleton needs and we have not validated them. Neither tool could establish performance or cost without testing, and running MongoDB alongside PostgreSQL may not yet be justified. For that reason we keep CI on GitHub Actions, local development on Docker Compose and cloud and Kubernetes provisioning for later phases, and we will reconsider Kafka and the second database if they delay the required end-to-end functionality.
