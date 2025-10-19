# manage-social-messages-api

1. Description

This is a service that fetches comments of the social media posts submitted within a period (controlled by environment variable SOCIAL_MEDIA_API_HISTORY_LAST_DAYS) from each social platform (controlled by environment variable SOCIAL_PLATFORMS), using the social media api of Ayrshare.

2. How It Works

The service works as follows,

- Fetches comments of the posts created in the past week from each social platform, using the social media api.
- Stores the comments in the database, that don't already exist.
- Uses background tasks (transaction outbox pattern) to process fetching of comments to,
  - Track processing of comments.
  - Support eventual consistency in case the system is interrupted.
  - Prevent fetching comments of the same posts concurrently, to avoid redundant processing.
- When a user replies to a comment, the service creates a background task (transaction outbox pattern) and processes it. In order to track processing and support eventual consistency. Also ensuring no other task is created at the same time for the same post. Preventing redundant replies and duplication.
- The service calls external social media api (Ayrshare) to interact with the social platforms.
- All calls are targeting specific platform and use dedicated http handlers with exponential backoff retrying and circuit breaker logic.
- Circuit breaker logic follows a distributed pattern, using the database to store the state.

3. Features and Requirements

- Applies transactional outbox pattern when fetching data and replying to comments. Ensuring caching, single processing during concurrent actions and eventually consistency in case of interrupt. Also tracking of actions, storing data for tracing and durations.
- Uses distributed circuit breaker logic per social platform, using the database to store the state.
- Applies exponential backoff retrying, following http status codes, with appropriate logging and combined with the circuit breaker functionality.

Requirements

1. Ingest messages and comments
   Supports fetching data from social media api of Ayrshare and transforming it into a common format of "mentions". Uses adapter pattern to transform data from each type of data (comments, messages) into a common format.
   Polls for comments of the posts created in the past week (controlled by environment variable SOCIAL_MEDIA_API_HISTORY_LAST_DAYS) from each social platform (controlled by environment variable SOCIAL_PLATFORMS), using the social media api.
   Stores the comments in the database, that don't already exist.
   Uses background tasks (transaction outbox pattern) to process fetching of comments to,

- Track processing of comments.
- Support eventual consistency in case the system is interrupted.
- Prevent fetching comments of the same posts concurrently, to avoid redundant processing.

2. Triage & assignment
   Supports assigning mentions to users and setting disposition values.

3. Reply once and only once
   The service supports different statuses of mentions as they are being processed.
4. Dedup + idempotency
   Supports idempotency and deduplication, by allowing only a single reply per mention with unique content.
   Meeting the requirements of concurrent interactions with the same mention.

5. Rate limits, backoff, and resilience
   Supports rate limiting around processing redundant actions and excessive http requests to the external services.
   Includes exponential backoff for 429 and 5xx type of errors.
   Includes distributed circuit breaker logic per social platform, using the database to store the state.
   Includes observability through structured logs, tracing actions in database and providing health endpoint.
6. Auditability
   Supports auditability through immutable audit log with actor, timestamp, and payload excerpt.
   ○ Every state change (assignment, reply attempt, provider error) is written to
   an immutable audit log with actor, timestamp, and payload excerpt.

7. Pre-requisites

- Node.js 22+
- PostgresSQL 14+
- Ayrshare API Key

5. Setup and Running
   There are two ways to setup the project,

- setting up the database and running using npm
- using docker

  4.1 Setting up the database and running using npm

First, create the database and user.

```bash
CREATE USER social_messages WITH PASSWORD 'social_messages';
CREATE DATABASE social_messages OWNER social_messages;
GRANT ALL PRIVILEGES ON DATABASE social_messages TO social_messages;
```

Navigate to the project root directory and run installation of all dependencies,

```bash
npm install
```

Afterwards run database migration scripts,

```bash
npm run db:migrate
```

To run in development mode, with watch and debugger support,

```bash
npm run dev
```

To start the service in production mode, run,

```bash
npm run start
```

5.2 Using docker
Navigate to the project root directory and run,

```bash
docker-compose up -d
```

To start the service in production mode, run,

```bash
docker-compose up
```

To stop the service, run,

```bash
docker-compose down
```

To view the logs, run,

```bash
docker-compose logs -f
```

6. Configuration

The service uses environment variables to configure the service.

The environment variables can be configured in the .env file.

To view the environment variables, visit the .env.sample file.

7. Project Structure
   src/
   ├── controllers/ # HTTP request handlers
   ├── services/
   │ ├── data/ # Business logic & data access
   │ │ └── mention/ # Mention-specific logic
   │ ├── social-media/ # External API integration
   │ ├── http/ # HTTP service and decorators (retry, logging)
   │ └── utils/ # Utilities (logger, circuit-breaker)
   ├── models/ # ORM (Sequelize) models
   ├── routes/ # Express routes
   ├── middleware/ # Auth handling
   └── enums/ # Constants/Enumerations

8. Database

9. Architecture
   The system implements several distributed system patterns:
   ┌─────────────┐
   │ Client │
   └──────┬──────┘
   │
   ▼
   ┌─────────────────────────────────────┐
   │ Express API (Controllers) │
   └──────┬──────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────┐
   │ Service Layer (Business Logic) │
   │ - MentionDataService │
   │ - UserDataService │
   └──────┬──────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────┐
   │ Adapter Pattern │
   │ - MentionCommentAdapter │
   │ - (Future: MentionMessageAdapter) │
   └──────┬──────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────┐
   │ Social Media Service Layer │
   │ - Circuit Breaker (per platform) │
   │ - Exponential Backoff Retry │
   │ - HTTP Logging & Monitoring │
   └──────┬──────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────┐
   │ External Social Media APIs │
   └─────────────────────────────────────┘

Key Patterns

- Transactional Outbox Pattern
  Ensures eventual consistency and prevents duplicate processing:

Creates task records in database
Background processors handle tasks asynchronously
Unique constraints prevent concurrent processing of same entity

- Distributed Circuit Breaker
  Protects against cascading failures:

Per-platform circuit breaker state
Stored in database for multi-instance coordination.

- Adapter Pattern
  Extensible mention type handling:

BaseMentionAdapter
defines contract
Each mention type (comment, message, DM) has dedicated adapter
Easy to add new mention types

- Decorator Pattern for HTTP
  Composable HTTP enhancements:

javascript
withLogging(baseHttp) → exponentialBackoff → circuitBreaker → axios
Project Structure

10. Known Issues

- It currently works only for Ayrshare posts, not all posts could be retrieved from the social media API because /history/:platform gives 404 for some eg bluesky. Also the query param "platforms" does not accept array.
- No messages could be retrieved from the social media API. The endpoint /messages/:platform gives 403.
- I would prefer if path params didn't support multiple values only if combined with query params. Instead just use the query params directly.
- X/Twitter comments include replies on the same level.
- From UI when hitting the social platform tag of bluesky for a post it does not show the post, because of the user value which is the email instead of the bsk handle.
- When replying to a comment and the call to social media api succeeds, but the service fails to record the success, could result in eventually replying more than once. The reason is that after the system comes back up and tries to process unfinished tasks, the social media api might not return the reply data yet due to cache.
- Twitter's different comments structure, not having replies, but instead treating all as comments shifts parsing logic to the calling service. There is a TODO to check if the same reply has been sent already to the social media api using specific parsing comment handlers per platform.

Platform-Specific Issues

- Bluesky: /history endpoint returns 404 for some posts
- Twitter: Comments include replies at same level (parsing required)
- All: /messages endpoint returns 403
  Edge Cases
- Reply success but failure to record: May cause duplicate reply on retry
- Mitigation: Check if reply exists before sending (TODO)
  API Limitations
- Path params don't support multiple values consistently
- Query param "platforms" doesn't accept arrays

11. TODO

- Add support for messages.
- Identify replies from all social platforms, using dedicated parsing handlers per platform and store to db for display.
- Add better validation of input data eg type of data as well as logic around updates.
- Add rate limiting excessive http requests to the service.
- Split mentions adapters to fetch and reply based interfaces.
- Optimize according to next possible update indicated by the social media api.
