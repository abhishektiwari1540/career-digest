#!/usr/bin/env bash
set -e

# ==============================================================================
# Google Cloud Platform (GCP) Deployment Script for Career Digest System
# Utilizes Google Cloud Run Jobs & GCP Cloud Scheduler ($300 GCP Credit Compatible)
# ==============================================================================

GCP_PROJECT_ID="${GCP_PROJECT_ID:-your-gcp-project-id}"
GCP_REGION="${GCP_REGION:-asia-south1}" # Defaulting to Mumbai / India region
IMAGE_NAME="career-digest-runner"
JOB_NAME="daily-career-digest-job"

echo "=== 1. Checking GCP configuration ==="
gcloud config set project "$GCP_PROJECT_ID" || {
  echo "Error: Please set GCP_PROJECT_ID env variable or run 'gcloud auth login'"
  exit 1
}

echo "=== 2. Enabling required GCP APIs ==="
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

echo "=== 3. Creating Artifact Registry Repository ==="
gcloud artifacts repositories create career-digest-repo \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="Container repository for Daily Career Digest" || true

IMAGE_PATH="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/career-digest-repo/${IMAGE_NAME}:latest"

echo "=== 4. Building and Pushing Container Image ==="
gcloud builds submit --tag "$IMAGE_PATH" .

echo "=== 5. Creating / Updating Cloud Run Job ==="
gcloud run jobs deploy "$JOB_NAME" \
  --image "$IMAGE_PATH" \
  --region "$GCP_REGION" \
  --tasks 1 \
  --max-retries 1 \
  --task-timeout 10m

echo "=== 6. Scheduling Daily Cron (03:00 UTC = 08:30 IST) ==="
gcloud scheduler jobs create http daily-digest-trigger \
  --location="$GCP_REGION" \
  --schedule="0 3 * * *" \
  --uri="https://${GCP_REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCP_PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --http-method=POST \
  --oauth-service-account-email="$(gcloud config get-value core/account)" || true

echo "=== GCP Deployment Completed Successfully! ==="
echo "You can trigger a manual run on GCP with:"
echo "gcloud run jobs execute $JOB_NAME --region $GCP_REGION"
