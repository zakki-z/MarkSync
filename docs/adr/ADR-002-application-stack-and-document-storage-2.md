# ADR-002: Application Stack and Document Storage

- **Status:** Proposed (to become *Accepted* when this PR is merged after peer review)
- **Date:** 2026-10-24
- **Deciders:** MarkSync team
- **Related:** [ADR-001: Real-Time Concurrency Architecture](ADR-001-real-time-concurrency-architecture-2.md)

## Task 1 implementation scope (2026-10-28)

The implemented walking skeleton uses Next.js 16 / React 19 / Tailwind 4, FastAPI on Python 3.12, Spring Boot 4 on Java 21, Bun native WebSockets, PostgreSQL 17, Nginx, and `compose.yaml`. Authentication uses Argon2 password hashes and one-hour **HS256** JWTs with a shared environment secret, stored by the browser in an HttpOnly SameSite cookie. There are no refresh tokens or asymmetric signing keys in Task 1. Next.js protects the page and browser adapters; Spring independently enforces JWT authentication and document ownership. Flyway manages the document schema, with Hibernate validation only.

Presence authenticates upgrades, checks document ownership before joining, deduplicates users across connections, and handles heartbeat/disconnect cleanup. Documents remain private: two sessions of the same owner produce one roster entry with two active sessions. Two distinct accounts cannot share a document without a future sharing design. Task 1 contains no concurrent editing, Yjs, MongoDB, Kafka, permission events, or CRDT persistence. References to those technologies below describe proposed later phases, not currently deployed services. The Markdown preview is an escaped React-rendered subset; remark/rehype remains a future parser option.

The original decision format and AI prompt appendix below are preserved. This implementation update records repository behavior, not a new AI consultation or peer acceptance.

## Context

MarkSync is a Markdown collaboration tool designed with the enterprise in mind, using real-time collaboration features. This ADR outlines the justification for four key choices: the **frontend framework**, the **backend runtime**, the **database** and the **real-time transport**. It also documents the architectural and infrastructure decisions implied by those choices.

Constraints and forces:

- **Walking skeleton (Task 1).** Signup and login with state stored in a database; creating, viewing and saving a document (title, author, raw Markdown); basic Markdown rendering in the frontend; a two-way WebSocket with a presence roster or heartbeat; runs locally using a clear README.
- **Subsequent tasks build on it.** The Markdown parser will gain further functionality, and multi-user editing will be added in Task 2 (see ADR-001).
- **The team.** Three people, one module. The team wants the assignment to double as a learning opportunity with a modern distributed stack, and the module convenor agreed to us going beyond the recommended stack.
- **Shape of the domain.** Identity, workspaces, permissions and document metadata are relational and require transactional integrity. The state of real-time collaboration is binary, append-heavy and event-driven. Content analysis (AI) and notifications are consumers running asynchronously.
- **Local deployment only.** Everything needs to run with one command on a marker's machine. There is no requirement to deploy to the cloud at the moment.
- **The current repository.** A monorepo containing service skeletons: a Next.js frontend, FastAPI services, Spring Boot services and a Bun-based Collaboration service written in TypeScript. The Task 1 implementation now supplies `compose.yaml` and a root README.

## Decision

### 1. Frontend: React and TypeScript

| | React + TypeScript (chosen) | Svelte | Vue |
|---|---|---|---|
| Ecosystem for our needs | Largest. Mature Markdown AST tooling (remark/rehype), and editor bindings for CodeMirror and Yjs are well documented | Good, with a smaller ecosystem | Good |
| Type sharing with the Collaboration service | Same language and tooling end to end | Same | Same |
| Team learning value | Industry-standard skill | Valuable, but less transferable | Valuable |
| Risk | Larger bundle and more boilerplate | Fewer examples for collaborative-editor integration | Mid |

The repository is scaffolded using Next.js, which is a React framework. The editor page runs in the browser because it holds a live WebSocket connection. Task 1 renders a small Markdown subset safely as React elements; remark/rehype is the intended extensible parser for later tasks. TypeScript is mandatory for the frontend.

### 2. Real-time transport: native WebSockets

| | Native WebSocket (chosen) | Socket.io | Server-Sent Events |
|---|---|---|---|
| Full duplex | Yes | Yes | **No** (server to client only). The brief rejects this |
| Fit with Yjs | Direct. Yjs sync and awareness messages are binary and framed for a plain socket | Adds its own protocol and framing on top | Not applicable |
| Fallbacks (long-polling) | None. We do not need them on modern browsers | Built in, but unneeded | n/a |
| Rooms and auto-reconnect | We implement a small reconnect-with-backoff and room map ourselves | Provided | Built-in reconnect only |
| Coupling | Standard protocol, any client works | Client and server must both use Socket.io | Standard |

We accept writing our own reconnect, heartbeat and room handling. In exchange, we skip an extra protocol layer and remain compatible with the Yjs ecosystem. WebRTC data channels are discussed in ADR-001 and rejected there.

### 3. Backend runtime: microservices, one language per fit

| Service | Technology | Reason |
|---|---|---|
| Authentication | Python, FastAPI | Lightweight async APIs; JWT issuing and validation |
| Document | Java, Spring Boot | Transactional consistency; document lifecycle and version management |
| Workspace | Java, Spring Boot | Business rules, access control and workspace management |
| Collaboration | TypeScript on a Node-compatible runtime | Event-driven, non-blocking I/O for many concurrent WebSockets; shares the language of the Yjs ecosystem and the frontend. The skeleton currently runs on Bun |
| AI | Python, FastAPI | Mature ML and LLM ecosystem for semantic search |
| Notification | Python, FastAPI | Small service consuming events and triggering notifications |

**Why not just one runtime?** Having one language (for example, only TypeScript) would be easier for three developers. The cost of using three different languages is justified because each choice has a technical reason given above, the module brief permits it, and it fits our learning objective. To minimise the overhead, every service exposes a `/health` endpoint, ships as a Docker image and has its own job in the GitHub Actions workflow. REST contracts are described in OpenAPI.

### 4. Databases, storage and ownership

| Store | Technology | Owns | Why |
|---|---|---|---|
| Relational | PostgreSQL | Users and refresh tokens (Auth); workspaces and permissions (Workspace); document metadata, versions and the latest Markdown text (Document) | ACID transactions and relational integrity for identity, permissions and document records |
| Document store | MongoDB | Yjs binary updates and snapshots (Collaboration); derived data for the AI service | Flexible, schema-light storage for binary and evolving data |
| Event log | Apache Kafka | Domain events between services | Decoupled asynchronous communication |

Alternative approaches considered:

- **SQLite:** rejected as the system database. SQLite does not support multiple services with separate processes and network access, though it could be used for a single-service prototype.
- **PostgreSQL only** (Yjs state as `bytea`/JSONB, no MongoDB): a viable alternative with one less moving part. MongoDB was chosen to keep append-heavy CRDT state outside the transactional store, for the flexibility of schema-light storage, and for team learning purposes. **This will be reconsidered if running two databases proves too costly.**
- **AI storage:** semantic search may require a vector index that MongoDB running locally does not provide. The approach will be decided in a separate ADR when the AI service is designed.

**One database per service.** Each service owns its data. In local development this means a separate logical database for each service, running in a single PostgreSQL container. There are no cross-service joins: services reference each other by ID, and consistency between services is eventual and event-driven.

**Document storage principle.** The Document service keeps title, author, workspace and Markdown content in PostgreSQL and is the single source of truth for the saved document. Live-editing state is kept in MongoDB and is reflected back to the Document service as defined in ADR-001.

### 5. Supporting architectural decisions

| Decision | Rationale | Cost we accept |
|---|---|---|
| Microservices | Independent deployment, modularity, service-level scaling | More moving parts and network failure modes than a modular monolith for a three-person team. Mitigated by Docker Compose, a monorepo and a small walking skeleton |
| Event-driven architecture (Kafka) | Loose coupling; the AI and Notification services consume events without the producer knowing them | Kafka is heavy for a skeleton. It is introduced incrementally: not needed to pass Task 1, and the first topics arrive with the first cross-service consumer. A single-node broker may be added to Compose in a later phase |
| REST APIs | Simple synchronous calls between clients and services | Chatty if overused. Real-time traffic uses WebSockets instead |
| WebSockets | Persistent connections for live collaboration (see section 2) | Stateful connections complicate scaling, see ADR-001 |
| JWT authentication | Stateless identity between services. Task 1 signs one-hour HS256 access tokens with a shared environment secret and stores users in PostgreSQL. Asymmetric signing and refresh tokens are future work | Revocation is not immediate. Task 1 revalidates socket auth and ownership periodically; a `permission.changed` event is a future option |
| Database per service | Clear data ownership and low coupling | No cross-service transactions. A transactional outbox in the Document service is a likely follow-up to avoid losing events on a failed publish |
| Monorepo | One place for code, reviews and CI, which suits a three-person team | CI must stay fast as the repository grows. Path filters can be added to the workflow |

### 6. DevOps, monitoring and testing

**Current state:** Git and GitHub (pull requests, code review, branch protection), GitHub Actions (linting, type-checking, testing and building for each stack), Docker (one image per service), Docker Compose (the entire system with one command).

**Future (not yet decided):** the table below shows when each tool becomes relevant.

| Tool | Purpose | Trigger for adopting |
|---|---|---|
| Kubernetes | Orchestration, rolling deploys, service discovery, horizontal scaling | A cloud deployment becomes a requirement |
| Terraform | Reproducible cloud infrastructure | Same trigger |
| Ansible | Server configuration and provisioning | A non-Kubernetes host needs configuring |
| Prometheus and Grafana | Metrics and dashboards | Services have real behaviour worth measuring |
| k6 or Locust | Load and scalability testing | Task 2 has live editing to load. To be selected, and WebSocket support is a selection criterion |

## Consequences

**Positive**

- Each technology is used where it is strongest, and the stack fits the brief's skeleton and the requirements of future tasks.
- Clear data ownership makes failures and responsibilities easy to understand.
- Docker Compose gives markers and the team a single, standardised way of running everything.
- Task 1 maps directly onto the architecture:

| Task 1 requirement | Where it is delivered |
|---|---|
| Signup and login, state in a database | Authentication service and PostgreSQL |
| Create, view and save a document | Document service and PostgreSQL |
| Markdown rendering | React frontend |
| Bi-directional WebSocket presence | Collaboration service |
| Local run with clear instructions | Docker Compose and a root README |

**Negative and risks**

- Operational overhead is high for the team size: three languages, two databases and Kafka. This is the primary risk of the entire decision. We will review it after Task 1 and simplify (for example, drop MongoDB or defer Kafka) if it slows delivery.
- Task 1 now supplies Compose and a root README; future service additions must keep the local setup manageable.
- Separate logical PostgreSQL databases and event-driven synchronisation mean data may be temporarily out of date between services.
- Skills are spread across Python, Java and TypeScript, so code reviews in an unfamiliar language need extra attention.

**Follow-ups**

- Keep `compose.yaml` and the root README aligned with active services; MongoDB and Kafka remain deferred.
- Declare the missing dependencies and a `pyproject.toml` for the AI and Notification services so they can join CI.
- Commit `uv.lock` files for the Python services.
- Write a separate ADR for the AI service's storage and semantic-search approach.
- Choose between k6 and Locust and record the decision.

## AI Prompt Appendix

### Prompts used

Rows 1 to 3 are from our earlier MarkSync conversations with ChatGPT; the exact model variant was not recorded. Rows 4 and 5 are consultations with Claude.

| # | Prompt (verbatim) | AI tool and date | What we took from the answer |
|---|---|---|---|
| 1 | “do you recommend python or java for authentication?<br>what message broker you recommend?<br>answer briefly” | ChatGPT, 19 October 2026 | We examined language fit for authentication and the trade-off between lightweight messaging and a more capable event platform. We subsequently chose FastAPI for authentication |
| 2 | “what about Kafka” | ChatGPT, 19 October 2026 | The response helped distinguish asynchronous event delivery from live collaborative editing: Kafka can distribute domain events, but WebSockets handle client connections and Kafka does not resolve concurrent text edits |
| 3 | “I need you briefly mention every technology within our stock and why we chose it” | ChatGPT, 24 October 2026 | We consolidated the reasons for React/TypeScript, FastAPI, Spring Boot, Node.js, PostgreSQL, MongoDB, Kafka, Docker and GitHub Actions, with Kubernetes, Terraform and Ansible deferred until later. This summary informed the documented stack but was not independent validation of each choice |
| 4 | “how would the project structure would look like” | Claude, 24 October 2026 | A layout of the monorepo (one Next.js frontend and six backend services, each with its own toolchain). It showed that the repository had no Docker Compose file or root README, which we recorded as follow-ups |
| 5 | “do you think we made all the requirement apart from the walking skeleton” | Claude, 25 October 2026 | A requirement-by-requirement check against the brief. It identified gaps in our CI and prompt log, which we then fixed |

### Critical commentary

The AI helped us structure a **polyglot stack** around specific service responsibilities and distinguish between synchronous REST calls, real-time WebSocket interactions and asynchronous Kafka events. Identifying PostgreSQL as an appropriate database for transactional identity and document metadata was good advice, as was explaining why Python suits AI-based services and TypeScript suits collaborative work. Claude also suggested options we had not listed, including a PostgreSQL-only solution and a gradual introduction of Kafka. Its weaker advice is that a microservice stack of this size can look easy in theory, but **six services, three programming languages, two databases and Kafka** mean a lot of build, integration, debugging and deployment effort for a student team of three. Some of Claude's suggestions, including a transactional outbox and asymmetric signing keys for JWTs, go beyond what our Task 1 skeleton requires and have not yet been validated by us. Neither tool can tell us about performance or cost without testing, and running MongoDB alongside PostgreSQL may not be justified yet. Therefore we will keep CI on GitHub Actions, local development on Docker Compose, and cloud and Kubernetes provisioning for later phases, and we will reconsider Kafka and the second database if they delay the required end-to-end functionality.
