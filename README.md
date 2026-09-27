# Career Digest & Developer Intelligence Engine

A fully automated daily intelligence system that collects job opportunities, tech industry trends, GDG Jaipur & community tech workshops, and developer brand SEO presence across major platforms. Scored and cross-referenced with your imported LinkedIn history and personal projects using **Google Gen AI (Gemini 2.5)**, stored in **Supabase**, and delivered via email every morning.

Supports execution on **GitHub Actions (Free)** and **Google Cloud Platform (GCP $300 Credit)** via **Cloud Run Jobs** and **GCP Cloud Scheduler**.

---

## Architecture Overview

1. **Job Collector (`src/collectors/jobs.ts`)**: Scrapes job openings using Adzuna's official API for India/Jaipur, calculating a skill-match percentage score based on your profile skills.
2. **Trend Collector (`src/collectors/trends.ts`)**: Fetches tech stories from Hacker News and dev.to.
3. **Event & Workshop Collector (`src/collectors/events.ts`)**: Fetches GDG Jaipur developer meetups, dev.to workshops, webinars, hackathons, and Google Programmable Search upskilling events.
4. **Developer Brand SEO Collector (`src/collectors/brandSeo.ts`)**: Tracks web citations and indexation across 25 developer platforms (GitHub, dev.to, Medium, StackOverflow, LeetCode, etc.).
5. **AI Synthesis Engine (`src/llm/gemini.ts`)**: Uses the official `@google/genai` SDK with Gemini 2.5 to cross-reference trends against your imported LinkedIn posts & stored project portfolio to recommend content creation topics.
6. **Database Storage (`src/storage/supabase.ts`)**: Upserts all collected jobs, trends, events, brand citations, and daily markdown reports with versioning in Supabase.
7. **Delivery (`src/report/email.ts`)**: Converts digest markdown to HTML and sends it via Resend.

---

## Setup & Configuration

### 1. Database Setup
Create a Supabase project and execute [`supabase/schema.sql`](file:///Applications/XAMPP/xamppfiles/htdocs/career-digest/supabase/schema.sql) in the SQL Editor.

### 2. Google AI Studio & Google Cloud Keys
- **Gemini API Key**: Get a free key at [Google AI Studio](https://aistudio.google.com/apikey).
- **Google Custom Search (Optional)**: Enable Programmable Search Engine for Brand SEO & Live Event Search.

### 3. Environment File
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

### 4. Install & Test
```bash
npm install
npm run build
npm run dev
```

---

## Deploying on Google Cloud Platform (Using $300 GCP Credit)

If you have a \$300 Google Cloud credit, you can deploy this system on **Google Cloud Run Jobs** scheduled via **GCP Cloud Scheduler**:

1. Make sure `gcloud` CLI is installed and logged in (`gcloud auth login`).
2. Set your GCP Project ID in environment or edit `deploy-gcp.sh`.
3. Run the automated deployment script:
```bash
./deploy-gcp.sh
```

This will:
- Enable `run`, `cloudscheduler`, `artifactregistry`, and `secretmanager` GCP APIs.
- Build and push the multi-stage [`Dockerfile`](file:///Applications/XAMPP/xamppfiles/htdocs/career-digest/Dockerfile) image to GCP Artifact Registry.
- Deploy a Cloud Run Job and schedule it to run every morning at 08:30 IST (03:00 UTC).

---

## Deploying on GitHub Actions (Free)

1. Push this repository to GitHub.
2. Go to **Settings -> Secrets and variables -> Actions**.
3. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `RESEND_API_KEY`, `DIGEST_TO_EMAIL`, `DIGEST_FROM_EMAIL`, and `PROFILE_SKILLS`.
4. The workflow in [`.github/workflows/daily-digest.yml`](file:///Applications/XAMPP/xamppfiles/htdocs/career-digest/.github/workflows/daily-digest.yml) will execute daily automatically.

---

## Importing your LinkedIn Post History

LinkedIn explicitly prohibits web scraping, but provides your official post export under privacy settings:
1. **LinkedIn -> Settings & Privacy -> Data Privacy -> Get a copy of your data** -> Request Archive -> Unzip -> `Shares.csv`.
2. Run the importer:
```bash
npm run import:linkedin -- /path/to/Shares.csv
```
This seeds your post commentary in Supabase so Gemini can cross-reference tech trends with your previous posts to suggest relevant content ideas!

