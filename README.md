# Manage Social Messages API

A robust Node.js service for ingesting and managing social media comments across multiple platforms. Built with reliability patterns including transactional outbox, distributed circuit breakers, and exactly-once reply guarantees.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Setup and Installation](#setup-and-installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Known Issues](#known-issues)
- [Roadmap](#roadmap)

## Overview

This service ingests comments from social media posts across multiple platforms (configurable via `SOCIAL_PLATFORMS`) within a configurable time period (`SOCIAL_MEDIA_API_HISTORY_LAST_DAYS`). It enables team collaboration on responses and ensures reliable, exactly-once reply delivery even under concurrent load and system failures.

**Technology Stack:**

- **Backend:** Node.js 22+ with Express
- **Database:** PostgreSQL 14+
- **External API:** Ayrshare Social Media API
- **Logging:** Winston
- **ORM:** Sequelize

## Key Features

### Multi-Platform Message Ingestion

- **Platform Support:** Fetches comments from multiple social platforms via Ayrshare API
- **Unified Data Model:** Uses adapter pattern to normalize platform-specific data into a common "mentions" format
- **Configurable Polling:** Retrieves posts from the past N days (default: 7 days)
- **Smart Deduplication:** Prevents duplicate ingestion using platform-specific identifiers
- **Task-Based Processing:** Ensures tracking, eventual consistency, and prevents concurrent processing of the same posts

### Team Triage & Assignment

- **User Assignment:** Assign mentions to specific team members
- **Disposition Management:** Set disposition values (reply, ignore, escalate)
- **State Tracking:** Monitor mention states (assignment, reply_attempt, provider_error, replied)

### Exactly-Once Reply Guarantee

- **Idempotency:** Database-level constraints prevent duplicate replies
- **Transactional Outbox Pattern:** Reliable message processing with failure recovery
- **Concurrent Safety:** Handles multiple simultaneous reply attempts gracefully
- **Test Verified:** Automated tests confirm 5 concurrent replies → 1 actual reply sent

### Resilience & Observability

- **Distributed Circuit Breaker:** Per-platform protection against cascading failures (database-backed for multi-instance coordination)
- **Exponential Backoff:** Smart retry logic for 429/5xx errors with jitter
- **Structured Logging:** Request tracing and metrics via Winston
- **Health Monitoring:** Endpoints expose circuit breaker states and system health
- **Performance Metrics:** Track duration of external API calls

### Auditability

- **Immutable Audit Log:** Records all state changes
- **Complete Context:** Captures actor (user ID), timestamp, and payload excerpts
- **End-to-End Traceability:** Full audit trail from mention creation to reply delivery

## How It Works

1. **Ingestion:** Service polls Ayrshare API for comments from recent posts across configured platforms
2. **Normalization:** Adapter pattern transforms platform-specific data into unified mention format
3. **Storage:** Comments are stored in PostgreSQL with deduplication
4. **Task Management:** Transactional outbox pattern creates tasks for asynchronous processing
5. **Team Workflow:** Users assign, categorize, and respond to mentions via API
6. **Reply Processing:** When a user replies, a task is created and processed with idempotency guarantees
7. **External API Calls:** All social platform interactions use HTTP decorators with retry logic and circuit breakers
8. **State Coordination:** Database-backed circuit breakers coordinate across multiple service instances

## Prerequisites

- **Node.js** 22 or higher
- **PostgreSQL** 14 or higher
- **Ayrshare API Key** (obtain from [Ayrshare](https://www.ayrshare.com/))

## Setup and Installation

There are two ways to set up the project:

### Option 1: Manual Setup

#### 1. Create Database and User

Connect to PostgreSQL and run:

```sql
CREATE USER social_messages WITH PASSWORD 'social_messages';
CREATE DATABASE social_messages OWNER social_messages;
GRANT ALL PRIVILEGES ON DATABASE social_messages TO social_messages;
```

#### 2. Install Dependencies

Navigate to the project root directory:

```bash
npm install
```

#### 3. Configure Environment

Copy the sample environment file and configure it:

```bash
cp .env.sample .env
```

Edit `.env` with your configuration (see [Configuration](#configuration) section).

#### 4. Run Database Migrations

```bash
npm run db:migrate
```

#### 5. Start the Service

**Development mode** (with watch and debugger support):

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

### Option 2: Docker Setup

#### Quick Start

Navigate to the project root directory:

```bash
# Start all services (API + PostgreSQL)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Available Docker Commands

```bash
# Development mode (with volume mounts for hot reload)
npm run docker:dev

# Build images
npm run docker:build

# Restart services
npm run docker:restart

# Clean up (removes volumes - destructive)
npm run docker:clean
```

## Configuration

The service is configured via environment variables, which can be set in a `.env` file at the project root.

**Configuration Files:**

- `.env.sample` - Template with all available variables and descriptions
- `.env` - Your local configuration (create from `.env.sample`)
- `.env.docker` - Docker-specific configuration

**Key Environment Variables:**

| Variable                             | Description                                  | Example                                      |
| ------------------------------------ | -------------------------------------------- | -------------------------------------------- |
| `SOCIAL_PLATFORMS`                   | Comma-separated list of platforms to monitor | `facebook,twitter,instagram`                 |
| `SOCIAL_MEDIA_API_HISTORY_LAST_DAYS` | Number of days to fetch historical posts     | `7`                                          |
| `AYRSHARE_API_KEY`                   | Your Ayrshare API key                        | `your-api-key-here`                          |
| `DATABASE_URL`                       | PostgreSQL connection string                 | `postgres://user:pass@localhost:5432/dbname` |
| `JWT_SECRET`                         | Secret for JWT authentication                | `your-secret-key`                            |
| `LOG_LEVEL`                          | Winston log level                            | `info`                                       |

Refer to `.env.sample` for a complete list of configuration options.

## Project Structure

```
manage-social-messages-api/
├── src/
│   ├── controllers/           # HTTP request handlers (thin layer)
│   │   ├── mention-controller.js
│   │   ├── user-controller.js
│   │   └── status-controller.js
│   ├── services/              # Business logic & external integrations
│   │   ├── data/              # Domain services
│   │   │   ├── mention/       # Mention-specific logic
│   │   │   │   ├── base-mention-adapter.js
│   │   │   │   ├── mention-comment-adapter.js
│   │   │   │   └── mention-data-service.js
│   │   │   ├── audit-data-service.js
│   │   │   └── user-data-service.js
│   │   ├── social-media/      # External API integration
│   │   │   └── social-media-service.js
│   │   ├── http/              # HTTP service decorators
│   │   │   ├── index.js
│   │   │   ├── with-logging.js
│   │   │   └── with-retry.js
│   │   └── utils/             # Shared utilities
│   │       ├── circuit-breaker.js
│   │       ├── exponential-backoff.js
│   │       ├── logger/
│   │       └── sleep.js
│   ├── models/                # Sequelize ORM models
│   │   ├── migrations/        # Database migrations
│   │   ├── mention.js
│   │   ├── task.js
│   │   ├── user.js
│   │   └── audit.js
│   ├── routes/                # Express routing
│   │   ├── mention-routes.js
│   │   ├── user-routes.js
│   │   └── status-routes.js
│   ├── middleware/            # Express middleware
│   │   └── auth.js
│   ├── enums/                 # Constants & enumerations
│   │   ├── mention-types.js
│   │   ├── mention-states.js
│   │   ├── task-types.js
│   │   └── platforms.js
│   ├── config.js              # Environment configuration
│   └── index.js               # Application entry point
├── test/                      # Test suite
│   └── services/
│       └── data/
│           └── mention-data-service.integration.test.js
├── docker-compose.yml         # Docker orchestration
├── Dockerfile                 # Production container
├── Dockerfile.dev             # Development container
├── package.json               # Dependencies & scripts
└── README.md                  # This file
```

### Layer Responsibilities

- **Controllers:** Handle HTTP requests/responses, input validation
- **Services:** Implement business logic and coordinate operations
- **Models:** Define data schemas and handle database operations
- **Routes:** Map HTTP endpoints to controllers
- **Middleware:** Cross-cutting concerns (auth, logging, error handling)
- **Enums:** Centralized constants for type safety

## Architecture

### System Architecture Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│   Express API (Controllers)         │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│   Service Layer (Business Logic)    │
│   - MentionDataService               │
│   - UserDataService                  │
│   - AuditDataService                 │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│   Adapter Pattern                    │
│   - MentionCommentAdapter            │
│   - (Future: MentionMessageAdapter)  │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│   Social Media Service Layer         │
│   - Circuit Breaker (per platform)   │
│   - Exponential Backoff Retry        │
│   - HTTP Logging & Monitoring        │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│   External Social Media APIs         │
│   (via Ayrshare)                     │
└─────────────────────────────────────┘
```

### Design Patterns

#### 1. Transactional Outbox Pattern

Ensures eventual consistency and prevents duplicate processing:

- Creates task records in database transactions
- Background processors handle tasks asynchronously
- Unique constraints prevent concurrent processing of same entity
- Survives system crashes and network failures

#### 2. Distributed Circuit Breaker

Protects against cascading failures:

- Per-platform circuit breaker state stored in database
- Coordinates across multiple service instances
- Automatic recovery after configurable timeout
- Prevents resource exhaustion from failing downstream services

#### 3. Adapter Pattern

Extensible mention type handling:

- `BaseMentionAdapter` defines contract for all mention types
- Each mention type (comment, message, DM) has dedicated adapter
- Easy to add new mention types without modifying core logic
- Normalizes platform-specific data into unified format

#### 4. Decorator Pattern

Composable HTTP enhancements:

```javascript
withLogging(baseHttp) → exponentialBackoff → circuitBreaker → axios
```

Each decorator adds a specific concern (logging, retry, circuit breaking) without modifying the base HTTP client.

#### 5. Strategy Pattern

Platform-specific comment parsing:

- Dedicated handlers for each social platform
- Handles platform-specific quirks (e.g., Twitter's flat comment structure)
- Isolates platform differences from core business logic

## Database Schema

### Key Tables

| Table                    | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `mentions`               | Social media mentions/comments with platform metadata |
| `tasks`                  | Outbox pattern task queue for async operations        |
| `users`                  | User accounts and authentication data                 |
| `audits`                 | Immutable audit trail of all state changes            |
| `circuit_breaker_states` | Distributed circuit breaker coordination              |

### Entity Relationships

- `mentions` ← many-to-one → `users` (assigned_to)
- `tasks` ← many-to-one → `mentions` (for reply tasks)
- `audits` ← many-to-one → `mentions` (audit trail)
- `audits` ← many-to-one → `users` (actor)

## Known Issues

### Ayrshare API Constraints

- **Incomplete Platform Support:** `/history/:platform` returns 404 for some platforms (e.g., Bluesky)
- ~~**Direct Messages Inaccessible:** `/messages/:platform` returns 403 (not available in current API tier)~~ after it is enabled it works for some platforms eg twitter; didn't work on bluesky, instagram, reddit
- **Query Parameter Limitations:** `platforms` parameter doesn't accept arrays consistently
- **Path Parameter Inconsistency:** Multiple values not supported uniformly across endpoints; some path param values need additional query params in order to work

### Platform-Specific Issues

- **Twitter/X:**
  - Comments include replies at the same hierarchical level (requires client-side filtering)
  - Shifts parsing logic to the consuming service
- **Bluesky:**
  - User identifier is email instead of Bluesky handle, breaking UI links to posts
  - Some posts return 404 from history endpoint

### Edge Cases & Limitations

- **Reply Verification Race Condition:**
  - If reply succeeds externally but service fails to record success, may cause duplicate reply on retry
  - Root cause: Ayrshare API cache delay prevents immediate verification
  - **Mitigation (TODO):** Implement platform-specific reply detection before sending
- **Polling vs. Webhooks:**
  - Currently uses polling (Ayrshare doesn't provide webhooks)
  - Increases API calls and latency

## Roadmap

- [ ] ~~Add direct message support (pending API access)~~
- [ ] Implement request validation middleware (`express-validator`)
- [ ] Add controller level error handling
- [ ] Add API rate limiting middleware
- [ ] Replace polling with webhooks (when available from Ayrshare)
- [ ] Add comprehensive unit test coverage
- [ ] Implement OpenAPI/Swagger documentation
- [ ] Split mention adapters into fetch and reply interfaces
- [ ] Store additional info in tasks
