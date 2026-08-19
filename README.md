# Intelligent Media Processing Pipeline

An asynchronous Node.js backend service for accepting vehicle images, processing them through a background worker, and returning structured, explainable image-quality and vehicle-text findings.

The system is intentionally designed as a small, locally runnable take-home project. Image-analysis results are **heuristic and probabilistic** and should not be interpreted as forensic or machine-learning certainty.

---

## 1. Overview

The Intelligent Media Processing Pipeline accepts uploaded vehicle images and processes them asynchronously.

The system attempts to identify potential issues such as:

* blurry images
* low-light or overexposed images
* duplicate or visually similar images
* OCR extraction problems
* invalid vehicle-number formats
* suspicious screenshot-like image characteristics
* missing or unusual image metadata
* invalid image dimensions or corrupted files

The goal is not perfect ML accuracy. Instead, the system focuses on:

* clean backend architecture
* asynchronous processing
* reliable job handling
* structured analysis results
* confidence scoring
* transparent reasoning
* failure handling
* testability
* local reproducibility

---

# 2. Key Features

* Image upload through a REST API
* Unique media and processing IDs
* Local image storage
* PostgreSQL persistence using Prisma
* Redis + BullMQ asynchronous processing
* Dedicated background worker
* Processing lifecycle:

  * `pending`
  * `processing`
  * `completed`
  * `failed`
* Automatic retry with exponential backoff
* Image MIME type and extension validation
* Configurable file-size and dimension validation
* Image decoding validation using Sharp
* SHA-256 file hashing
* 64-bit average perceptual hash (aHash)
* Blur detection using Laplacian variance
* Brightness analysis
* OCR using Tesseract.js
* OCR normalization
* Indian vehicle-registration-format validation
* EXIF and image metadata analysis
* Screenshot-like dimension heuristic
* Confidence scores
* Explainable analysis reasons
* Transparent overall-risk calculation
* Idempotent processing behavior
* Structured Pino logging
* Centralized error handling
* Helmet security headers
* CORS
* Rate limiting
* Health and readiness endpoints
* Automated tests
* Docker and Docker Compose
* Postman collection

---

# 3. Architecture

```text
                         Client / Postman
                               |
                               | POST /api/v1/media
                               v
                       +----------------+
                       |  Express API   |
                       +-------+--------+
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
        +----------------+          +----------------+
        |   PostgreSQL   |          | Redis / BullMQ |
        |                |          |                |
        | Media          |          | Analysis Queue |
        | ProcessingJob  |          +-------+--------+
        +----------------+                  |
                                            v
                                   +----------------+
                                   | Background     |
                                   | Worker         |
                                   +-------+--------+
                                           |
                    +----------------------+----------------------+
                    |          |          |          |            |
                    v          v          v          v            v
                  Blur    Brightness  Duplicate    OCR      Metadata /
                 Check      Check      Check      Check      Heuristics
                    |          |          |          |            |
                    +----------+----------+----------+------------+
                                           |
                                           v
                                   +----------------+
                                   |   PostgreSQL   |
                                   | AnalysisResult |
                                   +----------------+
```

---

# 4. Processing Flow

The upload request does not perform expensive image analysis.

The flow is:

```text
1. Client uploads image
        |
        v
2. Express validates upload
        |
        v
3. Image stored using generated safe filename
        |
        v
4. Media + ProcessingJob persisted
        |
        v
5. BullMQ job added to Redis
        |
        v
6. API immediately returns HTTP 202
        |
        v
7. Worker picks up job
        |
        v
8. Job status becomes "processing"
        |
        v
9. Image analyzers execute
        |
        v
10. Structured analysis result is persisted
        |
        v
11. Job status becomes "completed"
```

If processing fails:

```text
processing
    |
    v
worker error
    |
    v
BullMQ retry
    |
    v
processing
    |
    v
final failure
    |
    v
failed
```

Three attempts are configured by default with exponential backoff.

---

# 5. Technology Stack

| Component        | Technology                  |
| ---------------- | --------------------------- |
| Runtime          | Node.js                     |
| Language         | TypeScript                  |
| API              | Express.js                  |
| Database         | PostgreSQL                  |
| ORM              | Prisma                      |
| Queue            | BullMQ                      |
| Queue Backend    | Redis                       |
| Image Processing | Sharp                       |
| OCR              | Tesseract.js                |
| Logging          | Pino                        |
| Validation       | Request/file validation     |
| Security         | Helmet, CORS, rate limiting |
| Testing          | Jest, Supertest             |
| Containerization | Docker, Docker Compose      |
| API Testing      | Postman                     |

OpenCV is not required for the implemented checks. Sharp provides the required image-processing primitives while avoiding an additional native dependency and keeping local/Docker setup simpler.

---

# 6. Image Analysis Methodology

## 6.1 Image Validation

The upload pipeline validates:

* MIME type
* file extension
* file size
* image format
* image dimensions
* image decodability

Supported formats:

* JPEG
* PNG
* WebP

The file is also decoded with Sharp so that a file cannot rely only on a spoofed MIME type or extension.

Configuration is controlled through environment variables.

---

## 6.2 Blur Detection

Blur detection uses the variance of a grayscale Laplacian edge response.

The idea is:

```text
Image
  |
  v
Grayscale
  |
  v
Laplacian edge response
  |
  v
Variance
  |
  v
Blur score
```

A lower variance generally indicates fewer strong edges and may indicate blur.

The threshold is configurable through:

```text
BLUR_THRESHOLD
```

Example result:

```json
{
  "score": 734.86,
  "threshold": 100,
  "status": "pass",
  "confidence": 0.99
}
```

This is a quality heuristic and not a definitive statement that an image is blurry.

---

## 6.3 Brightness Detection

Average RGB intensity is calculated from the image pixels.

The system classifies brightness using configurable thresholds.

Possible classifications include:

* very dark
* low light
* acceptable
* overexposed

The result includes:

* brightness score
* classification
* confidence
* explanation

Brightness classification is heuristic and can vary depending on scene content.

---

## 6.4 Duplicate Detection

The system calculates:

* SHA-256 binary hash
* 64-bit average perceptual hash (aHash)

SHA-256 identifies exact binary duplicates.

Average perceptual hashing allows basic visual similarity comparison even when files are not byte-for-byte identical.

The current implementation compares against a limited number of existing records.

This is intentionally simplified for the take-home assignment.

### Current limitation

The comparison is limited to 500 existing records.

A production implementation could use:

* indexed perceptual hashes
* approximate nearest-neighbor search
* image embeddings
* vector databases
* dedicated similarity services

Perceptual similarity does not prove that two images originated from the same source.

---

## 6.5 OCR

OCR is performed locally using Tesseract.js.

The system returns:

* raw OCR text
* normalized text
* OCR confidence
* processing status
* explanation

OCR is inherently uncertain, particularly when:

* text is small
* the plate is partially obscured
* the image is blurry
* lighting is poor
* the viewing angle is difficult

The system therefore exposes OCR confidence rather than treating OCR output as guaranteed truth.

---

## 6.6 Vehicle Number Validation

OCR text is normalized before validation.

For example:

```text
KA 01 AB 1234
```

may become:

```text
KA01AB1234
```

A configurable Indian vehicle-registration-format heuristic is then applied.

The validation checks whether the OCR output resembles an expected registration format.

It does **not** verify:

* whether the registration exists
* whether the vehicle is real
* whether the number belongs to the photographed vehicle

Therefore, a valid regex match should not be interpreted as government-level registration verification.

---

## 6.7 Metadata and Screenshot Heuristics

The system extracts available metadata such as:

* width
* height
* format
* EXIF availability
* image dimensions

Certain dimensions may resemble common screen-capture dimensions and are therefore treated as a weak screenshot-like signal.

Example:

```json
{
  "status": "suspicious",
  "confidence": 0.58,
  "reason": "Dimensions resemble common screen captures; this is not forensic proof."
}
```

Missing EXIF metadata is **not** treated as proof of tampering.

These signals are heuristic and may produce false positives or false negatives.

---

# 7. Confidence and Risk

Every meaningful analysis attempts to provide:

* status
* score where applicable
* confidence
* explanation/reason

The overall risk is a transparent heuristic rather than a trained ML fraud model.

Current risk calculation:

```text
0 suspicious signals     -> low
1–2 suspicious signals   -> medium
3+ suspicious signals    -> high
```

Signals may include:

* suspicious blur
* problematic brightness
* possible duplicate
* invalid vehicle-number format
* screenshot-like metadata

The result explicitly communicates that this is a heuristic calculation.

Example:

```json
{
  "overallRisk": "medium",
  "riskExplanation": "Risk is a transparent heuristic count, not a trained fraud model."
}
```

---

# 8. Data Model

The project uses PostgreSQL with Prisma.

## Media

Stores uploaded file information.

Important fields include:

* `id`
* original filename
* generated storage filename
* storage path
* MIME type
* file size
* width
* height
* SHA-256 hash
* perceptual hash
* metadata
* timestamps

## ProcessingJob

Stores processing lifecycle information.

Important fields include:

* `id`
* `mediaId`
* status
* attempts
* error code
* error message
* start time
* completion time
* timestamps

Supported public states:

```text
pending
processing
completed
failed
```

## AnalysisResult

Stores the final analysis.

Important fields include:

* `id`
* `processingId`
* overall risk
* structured JSON result
* timestamps

Analysis results are persisted separately from the processing lifecycle so the schema can remain flexible as new analyzers are added.

---

# 9. Idempotency

The processing pipeline is designed to safely handle repeated delivery.

BullMQ jobs use the processing ID as a deterministic job ID.

Result persistence uses an upsert strategy.

This means a worker can safely replay a processing job without unintentionally creating multiple analysis-result records.

Repeated uploads of an already-known file can also be handled idempotently.

This is particularly important because background job systems can deliver work more than once.

---

# 10. API

## Upload Image

```http
POST /api/v1/media
Content-Type: multipart/form-data
```

Form field:

```text
file
```

Example:

```bash
curl -F "file=@./vehicle.jpg" \
  http://localhost:3000/api/v1/media
```

Successful response:

```json
{
  "processingId": "proc_...",
  "mediaId": "media_...",
  "status": "pending"
}
```

HTTP status:

```text
202 Accepted
```

---

## Processing Status

```http
GET /api/v1/media/:processingId/status
```

Example:

```bash
curl http://localhost:3000/api/v1/media/proc_.../status
```

Example response:

```json
{
  "processingId": "proc_...",
  "status": "completed",
  "attempts": 1
}
```

---

## Analysis Result

```http
GET /api/v1/media/:processingId/result
```

Example:

```bash
curl http://localhost:3000/api/v1/media/proc_.../result
```

While processing:

```text
202 Accepted
```

After successful processing:

```text
200 OK
```

The completed response contains the structured analysis.

If processing permanently fails:

```text
422 Unprocessable Entity
```

---

## Health

```http
GET /health
```

Provides a basic liveness check.

---

## Readiness

```http
GET /health/ready
```

Checks PostgreSQL and Redis connectivity.

If a required dependency is unavailable, the endpoint returns:

```text
503 Service Unavailable
```

---

# 11. HTTP Status Codes

| Situation                          |                HTTP Status |
| ---------------------------------- | -------------------------: |
| Successful upload                  |             `202 Accepted` |
| Status lookup                      |                   `200 OK` |
| Processing still queued/processing |             `202 Accepted` |
| Completed analysis                 |                   `200 OK` |
| Permanently failed processing      | `422 Unprocessable Entity` |
| Missing/invalid upload             |          `400 Bad Request` |
| Unknown processing ID              |            `404 Not Found` |
| Dependency unavailable             |  `503 Service Unavailable` |

Error responses follow a structured format:

```json
{
  "error": {
    "code": "INVALID_FILE_TYPE",
    "message": "Only JPEG, PNG and WebP images are supported."
  },
  "requestId": "req_..."
}
```

---

# 12. Reliability and Failure Handling

The worker catches job-level failures so a bad image does not crash the entire worker process.

BullMQ provides:

* retries
* exponential backoff
* configurable concurrency
* deterministic job IDs

A job is marked as `failed` only after the configured retry attempts are exhausted.

The system also records:

* attempt count
* error code
* error message
* timestamps

Result persistence is idempotent so worker redelivery can safely replay processing.

For production, additional resilience could include:

* dead-letter queues
* distributed tracing
* metrics
* circuit breakers
* external object storage
* separate OCR workers
* autoscaling

---

# 13. Security

The implementation includes reasonable security controls for the take-home assignment.

### File security

* only supported image MIME types are accepted
* file extensions are validated
* uploaded filenames are never used as filesystem paths
* generated filenames are used for storage
* file-size limits are enforced
* Sharp validates that the file can actually be decoded
* image dimensions are configurable

### API security

* Helmet
* CORS
* rate limiting
* request validation
* centralized error handling
* no secrets committed to Git

Environment-specific values are provided through `.env`.

Only `.env.example` is committed.

---

# 14. Performance Considerations

The API does not perform OCR or expensive analysis on the request path.

Heavy work is delegated to the background worker.

The implementation also:

* limits upload size
* uses Sharp for efficient image processing
* reads image metadata before expensive OCR
* keeps worker concurrency configurable
* avoids unnecessary repeated analysis through idempotent processing

The current implementation uses local filesystem storage and in-memory upload buffering as deliberate take-home simplifications.

For production, these could be replaced with:

* streaming uploads
* S3/object storage
* image resizing pipelines
* dedicated OCR workers
* autoscaled worker processes

---

# 15. Project Structure

```text
intelligent-media-pipeline/
│
├── src/
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── repositories/
│   ├── analyzers/
│   ├── queue/
│   ├── middleware/
│   ├── utils/
│   ├── types/
│   ├── app.ts
│   └── server.ts
│
├── prisma/
│   └── schema.prisma
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── scripts/
├── uploads/
├── postman/
│   └── intelligent-media-pipeline.json
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

# 16. Environment Configuration

Create a local environment file:

```bash
cp .env.example .env
```

Example configuration variables include:

```text
DATABASE_URL
REDIS_URL
PORT
UPLOAD_DIR
MAX_FILE_SIZE_MB
MIN_IMAGE_WIDTH
MIN_IMAGE_HEIGHT
BLUR_THRESHOLD
LOW_BRIGHTNESS_THRESHOLD
OVEREXPOSURE_THRESHOLD
MAX_JOB_ATTEMPTS
WORKER_CONCURRENCY
NODE_ENV
```

Do not commit `.env`.

`.env.example` contains configuration placeholders and is intentionally committed to the repository.

---

# 17. Run Locally

## Prerequisites

Install:

* Node.js
* npm
* PostgreSQL
* Redis

Then:

```bash
npm install
```

Generate Prisma client:

```bash
npx prisma generate
```

Run database migrations:

```bash
npx prisma migrate dev
```

Start the API:

```bash
npm run dev
```

Start the worker in a separate terminal:

```bash
npm run worker
```

The API will be available at:

```text
http://localhost:3000
```

---

# 18. Run with Docker

Docker Compose provides:

* PostgreSQL
* Redis
* API
* Worker

Start everything with:

```bash
docker compose up --build
```

The services are configured so the API and worker can communicate with PostgreSQL and Redis using the Docker service names.

Check:

```bash
curl http://localhost:3000/health
```

and:

```bash
curl http://localhost:3000/health/ready
```

---

# 19. End-to-End API Verification

The system was manually verified using Postman.

The verified flow is:

```text
Upload image
    |
    v
202 Accepted
    |
    v
pending
    |
    v
processing
    |
    v
completed
    |
    v
GET result
```

The completed result was verified to contain:

* blur analysis
* brightness analysis
* duplicate analysis
* OCR
* vehicle-number validation
* dimensions
* metadata
* confidence values
* overall risk
* explanation/reason fields

Additional validation scenarios were tested.

### Missing file

Submitting a multipart request without the `file` field returns:

```json
{
  "error": {
    "code": "MISSING_FILE",
    "message": "Provide an image in multipart field \"file\"."
  }
}
```

### Invalid file type

Submitting an unsupported file type returns:

```json
{
  "error": {
    "code": "INVALID_FILE_TYPE",
    "message": "Only JPEG, PNG and WebP images are supported."
  }
}
```

### Idempotent processing

Submitting the same already-known upload can return:

```json
{
  "mediaId": "media_...",
  "processingId": "proc_...",
  "status": "completed",
  "idempotent": true
}
```

This verifies duplicate request handling at the processing level.

---

# 20. Postman

A Postman collection is included at:

```text
postman/intelligent-media-pipeline.json
```

The collection covers:

1. Upload image
2. Get processing status
3. Get analysis result

The processing ID can be reused when testing the status and result endpoints.

---

# 21. Testing

Run the automated test suite:

```bash
npm test
```

Build the project:

```bash
npm run build
```

The tests cover important areas including:

* Laplacian blur classification
* brightness classification
* OCR normalization
* vehicle-number format validation
* perceptual hashing
* multipart upload validation
* API status/result states
* worker retry behavior
* final worker failure behavior

Generated test images use Sharp where practical rather than relying on private or copyrighted vehicle images.

API and worker dependencies are mocked where appropriate so tests remain deterministic.

---

# 22. AI Usage Disclosure

AI tools were used as part of the development workflow for:

* architecture brainstorming
* backend boilerplate generation
* debugging assistance
* edge-case identification
* test-case ideas
* code review
* documentation drafting

AI-generated code was **not blindly trusted**.

The implementation was validated through:

* dependency installation
* TypeScript compilation
* Prisma generation and migrations
* automated tests
* Docker Compose execution
* API testing with Postman
* manual sample-image processing
* inspection of worker and API logs

AI suggestions were reviewed against the actual behavior and documentation of technologies such as:

* Express
* Sharp
* BullMQ
* Redis
* Prisma
* Tesseract.js

One important design principle reinforced during review was that all image-analysis conclusions should remain explicitly heuristic.

The system therefore does not claim that:

* blur detection proves an image is unusable
* missing EXIF proves tampering
* OCR output is correct
* perceptual similarity proves image origin
* a vehicle-number regex proves registration validity
* screenshot heuristics provide forensic evidence

The final implementation was manually reviewed and tested rather than relying on AI output as authoritative.

---

# 23. Trade-offs

Several decisions were intentionally simplified to keep the project realistic and runnable within the take-home time limit.

## Local storage instead of S3

Local filesystem storage keeps the project easy to run without cloud credentials.

Production would use:

* S3
* object lifecycle policies
* CDN
* encrypted object storage

## Local OCR instead of managed OCR

Tesseract.js avoids external API costs and credentials.

Production could use a managed OCR service or a dedicated OCR worker.

## Average perceptual hash instead of vector search

A 64-bit aHash provides a simple demonstration of visual similarity.

Production systems with large datasets would need:

* indexed similarity search
* approximate nearest-neighbor search
* image embeddings
* vector databases

## Heuristics instead of trained ML

The assignment explicitly prioritizes engineering judgment over perfect ML accuracy.

The current solution therefore uses explainable image-processing heuristics instead of training a fraud-detection model.

## No authentication

Authentication and user management were not required by the assignment and were intentionally kept outside the core scope.

Production deployment would require:

* authentication
* authorization
* tenant isolation
* audit logging

---

# 24. Assumptions

* Authentication and user management are outside the scope of this take-home assignment.
* Images are stored locally for development and evaluation.
* OCR output is probabilistic and may contain incorrect or incomplete text.
* Indian vehicle-number validation checks format only and does not verify actual registration records.
* Duplicate detection is a lightweight similarity heuristic and does not prove image origin.
* Screenshot, photo-of-photo, and tampering signals are heuristic and may produce false positives or false negatives.
* Missing EXIF metadata does not imply tampering.
* Analysis thresholds are configurable and are not trained ML thresholds.
* A processing job is considered successfully completed only after its analysis result has been persisted.
* The local implementation is designed for take-home evaluation rather than production-scale media volume.

---

# 25. Known Limitations

The current implementation has several known limitations.

### OCR

OCR can produce incorrect text when:

* plates are small
* images are blurry
* lighting is poor
* the plate is partially hidden
* the camera angle is difficult

### Vehicle validation

Regex validation only checks whether text resembles an expected format.

It does not verify the actual vehicle registration.

### Duplicate detection

Average perceptual hashing can miss some transformed images and may occasionally produce false matches.

The current comparison is intentionally limited to a small candidate set.

### Screenshot detection

Dimensions and EXIF information are weak signals.

They cannot provide forensic proof of editing or screenshot origin.

### Local storage

Local filesystem storage is not appropriate for horizontally scaled production deployments without additional shared storage.

### In-memory upload buffering

The current implementation uses in-memory buffering for uploads.

Production workloads with very large images would benefit from streaming and object storage.

---

# 26. Scalability Considerations

For a production system, the architecture could evolve to:

```text
                    Load Balancer
                          |
                 +--------+--------+
                 |                 |
              API 1              API 2
                 |                 |
                 +--------+--------+
                          |
                     Message Queue
                          |
             +------------+------------+
             |            |            |
          Worker 1     Worker 2     Worker N
             |            |            |
             +------------+------------+
                          |
                    Object Storage
                          |
                       Database
```

Potential production improvements include:

* S3/object storage
* autoscaled workers
* dedicated OCR workers
* distributed queue infrastructure
* perceptual-hash indexing
* vector similarity search
* CDN
* database indexing and partitioning
* Prometheus metrics
* OpenTelemetry tracing
* centralized log aggregation
* authentication and authorization
* Kubernetes deployment
* dead-letter queues
* better image preprocessing

---

# 27. Future Improvements

Possible next steps include:

1. S3-compatible object storage
2. Dedicated OCR worker service
3. Better license-plate detection before OCR
4. Perspective correction before OCR
5. Advanced perceptual similarity search
6. Image embeddings and vector search
7. Improved screenshot/photo-of-photo detection
8. Authenticated multi-user support
9. Prometheus/OpenTelemetry observability
10. Dead-letter queue support
11. Horizontal worker autoscaling
12. Performance benchmarking
13. Larger integration-test coverage
14. Production deployment configuration

---

# 28. Requirement Checklist

| Requirement                      | Implemented | Evidence                          |
| -------------------------------- | ----------- | --------------------------------- |
| Image upload API                 | Yes         | Media controller/routes           |
| Unique processing ID             | Yes         | Processing ID generation          |
| Unique media ID                  | Yes         | Media ID generation               |
| Local image storage              | Yes         | Upload/storage service            |
| Metadata persistence             | Yes         | Prisma/PostgreSQL                 |
| Asynchronous processing          | Yes         | BullMQ + Redis worker             |
| Queue-based architecture         | Yes         | Analysis queue                    |
| `pending` status                 | Yes         | ProcessingJob                     |
| `processing` status              | Yes         | Worker lifecycle                  |
| `completed` status               | Yes         | Worker lifecycle                  |
| `failed` status                  | Yes         | Failure handling                  |
| Retry mechanism                  | Yes         | BullMQ retry/backoff              |
| Blur detection                   | Yes         | Laplacian variance                |
| Brightness analysis              | Yes         | Average RGB intensity             |
| Duplicate detection              | Yes         | SHA-256 + average perceptual hash |
| OCR                              | Yes         | Tesseract.js                      |
| Indian vehicle format validation | Yes         | Normalization + regex             |
| Image dimension validation       | Yes         | Configurable validation           |
| Metadata analysis                | Yes         | Image metadata/EXIF               |
| Screenshot-like heuristic        | Yes         | Dimension/metadata heuristic      |
| Structured analysis result       | Yes         | AnalysisResult JSON               |
| Confidence scoring               | Yes         | Analyzer results                  |
| Status API                       | Yes         | `/status` endpoint                |
| Result API                       | Yes         | `/result` endpoint                |
| Failure information              | Yes         | Structured error response         |
| Error handling                   | Yes         | Centralized middleware            |
| Logging                          | Yes         | Pino                              |
| Security controls                | Yes         | Helmet/CORS/rate limiting         |
| Idempotent processing            | Yes         | Deterministic jobs + upsert       |
| Graceful shutdown                | Yes         | API/worker shutdown handling      |
| Automated tests                  | Yes         | Jest/Supertest                    |
| Docker setup                     | Yes         | Dockerfile/Compose                |
| Postman collection               | Yes         | `postman/`                        |
| README                           | Yes         | This document                     |
| AI usage disclosure              | Yes         | AI Usage section                  |
| Trade-offs                       | Yes         | Trade-offs section                |
| Assumptions                      | Yes         | Assumptions section               |
| Scalability discussion           | Yes         | Scalability section               |
| Sample API requests              | Yes         | API section                       |
| Setup instructions               | Yes         | Run Locally/Docker sections       |

---

# 29. Final Validation

The project was validated using:

```bash
npm ci
npm run build
npm test
docker compose up --build
```

The end-to-end API flow was also manually verified:

```text
Upload
  ↓
202 Accepted
  ↓
pending
  ↓
processing
  ↓
completed
  ↓
structured analysis result
```

Error scenarios were also manually verified, including:

```text
Missing file
    ↓
MISSING_FILE

Unsupported file
    ↓
INVALID_FILE_TYPE
```

The final implementation prioritizes a complete, understandable, testable, and locally reproducible solution over unnecessary infrastructure complexity.
