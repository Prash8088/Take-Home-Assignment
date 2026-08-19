# Intelligent Media Processing Pipeline

An asynchronous Node.js service for accepting field vehicle images and returning transparent, heuristic image-quality and vehicle-text findings. It is intentionally a small, locally runnable architecture—not a claim of forensic or ML certainty.

## Architecture and flow

```text
client -> Express API -> PostgreSQL (Media + ProcessingJob) -> Redis/BullMQ
                                                             -> Worker -> Sharp/OCR analyzers
                                                                          -> PostgreSQL AnalysisResult
```

`POST /api/v1/media` validates and stores a random safe filename, persists a pending job, and queues it, returning `202`. CPU/OCR work never runs on the request path. The worker marks a job processing, writes an idempotent upserted result, then completes it. Queue jobs use the processing ID as their deterministic job ID; BullMQ retries failures with exponential backoff (three attempts by default).

## Features

- JPEG/PNG/WebP MIME, extension, size, decode and configurable dimension validation
- SHA-256 binary hash and 64-bit average perceptual hash comparison
- Sharp-based Laplacian-variance blur heuristic and average brightness classification
- Local Tesseract OCR, normalization, and Indian registration-format heuristic
- EXIF/dimension metadata and explicitly inconclusive screenshot-like-dimension signal
- Structured confidence/reasons, transparent risk aggregation, Pino request/job logging
- PostgreSQL/Prisma, Redis/BullMQ worker, Helmet, CORS, rate limiting, Docker, Postman, and tests

## Analysis methodology and limitations

Blur uses variance of a grayscale Laplacian edge response as a low-detail signal (configured `BLUR_THRESHOLD`); brightness uses average RGB intensity. This is implemented with Sharp's raw pixel output rather than OpenCV: OpenCV is optional in the assignment (“where appropriate”), and adding its native dependency would increase local/Docker setup complexity without improving these lightweight checks. Duplicate matching compares average perceptual hashes and is limited to 500 existing records, so it can miss edits and is not suitable as a global production index. OCR confidence comes from Tesseract; the registration regex only says text resembles a format and does not verify registration. Screenshot dimensions and EXIF presence are weak metadata signals: missing EXIF is never treated as proof of tampering. `overallRisk` counts suspicious blur, lighting, duplicate, vehicle-format, and screenshot signals: 0=low, 1–2=medium, 3+=high. This is a documented heuristic, not a trained fraud model.

## Data model

`Media` owns stored file facts, metadata and hashes. `ProcessingJob` owns the lifecycle (`pending`, `processing`, `completed`, `failed`), attempts/errors and timestamps. A one-to-one `AnalysisResult` keeps flexible JSON output separately. Unique stored paths, file hashes, processing IDs and result IDs prevent unsafe duplicates; result persistence is upserted to make worker redelivery safe.

## Run locally

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run dev                 # API
npm run worker              # separate terminal
```

Or, keep the values from `.env.example` (the Compose services override their own internal hostnames), then run:

```bash
docker compose up --build
```

The compose stack runs PostgreSQL, Redis, API, and a separate worker. `GET /health` is a liveness endpoint. `GET /health/ready` verifies PostgreSQL and Redis connectivity and returns `503` when either dependency is unavailable.

## API

```bash
curl -F "file=@./vehicle.jpg" http://localhost:3000/api/v1/media
# {"processingId":"proc_...","mediaId":"media_...","status":"pending"}
curl http://localhost:3000/api/v1/media/proc_.../status
curl http://localhost:3000/api/v1/media/proc_.../result
```

The result endpoint returns `202` while queued/processing, a structured completed analysis when done, and `422` with `{ error: { code, message } }` when permanently failed. Validation errors use `{ error: { code, message }, requestId }`. Import `postman/intelligent-media-pipeline.json` for the same three requests.

## Reliability, security, and performance

The worker catches each job failure, records retry state, and only marks `failed` after the final attempt; a bad image cannot crash the process. Database work is transactional at upload and result persistence is an upsert. A worker crash between analyzer completion and persistence can safely replay. Redis/database outages surface as failures/retries. For production, use S3/object storage, an image-size/pixel ceiling, separate OCR service/workers, distributed tracing/metrics, health dependency checks, and perceptual-hash indexing/vector search.

Input filenames never form storage paths; only generated IDs do. The service uses MIME and extension checks, Sharp decode validation, Multer limits, Helmet, CORS, rate limiting, configurable environment variables, and no committed secrets. Sharp reads metadata before expensive OCR; worker concurrency remains configurable. Local storage and in-memory upload buffering are intentional take-home simplifications.

## Tests and sample data

```bash
npm test
npm run build
```

Tests cover Laplacian blur classification, brightness, OCR normalization, vehicle format validation, perceptual hashing, multipart upload validation, status/result response states, and worker retry/final-failure behavior. Generated images use Sharp rather than private/copyrighted vehicle images; API/worker dependencies are mocked for deterministic execution.

## AI usage disclosure

AI was used for architecture brainstorming, boilerplate generation, edge-case review, test ideas, and documentation drafting. It did not validate runtime dependencies or image-analysis accuracy; those require `npm install`, Prisma migration, compile/tests and manual sample-image runs. During review, the key correction was keeping all conclusions explicitly heuristic (not presenting blur, EXIF, OCR, duplicate similarity, or vehicle regex as certainty). Generated suggestions were checked against Sharp, BullMQ and Prisma API documentation and TypeScript compilation should be run before submission.

## Trade-offs, limitations, future work

This uses local storage/local OCR, JSON results, simple pHash, and no authentication to keep the scope runnable. OCR and heuristics have false positives/negatives; pHash does not prove duplicate origin; dimensions/EXIF do not prove screenshots/editing; the regex does not validate real registrations. Next steps: S3/CDN, autoscaled workers, approximate-nearest-neighbor similarity, authenticated tenancy, Prometheus/OpenTelemetry, Kubernetes, and broader API/worker integration coverage.

## Requirement checklist

| Requirement | Implemented | Evidence |
|---|---|---|
| Upload, IDs, local storage, metadata | Yes | `media.controller.ts` |
| PostgreSQL, async Redis/BullMQ and retries | Yes | Prisma schema, queue/worker |
| Lifecycle/status/result/failure APIs | Yes | controller + routes |
| Blur, brightness, duplicate, OCR, vehicle, metadata | Yes | `image.analyzers.ts` |
| Errors, structured logging, graceful shutdown | Yes | middleware, server, worker |
| Docker, env, Postman, tests, AI disclosure | Yes | root files and this README |
