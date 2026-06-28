variable "enable_ingest" {
  description = "Deploy the ingest layer (S3 data lake, EventBridge Scheduler, ingest-sync Lambda)."
  type        = bool
  default     = true
}

variable "enable_processing" {
  description = "Deploy the processing layer (SQS pipeline, processor Lambda container, DynamoDB jobs). Requires enable_ingest."
  type        = bool
  default     = true

  validation {
    condition     = !var.enable_processing || var.enable_ingest
    error_message = "enable_processing requires enable_ingest = true."
  }
}

variable "enable_presentation" {
  description = "Deploy the presentation layer (query/reprocess APIs, API Gateway, Amplify). Requires enable_processing."
  type        = bool
  default     = true

  validation {
    condition     = !var.enable_presentation || var.enable_processing
    error_message = "enable_presentation requires enable_processing = true (and thus enable_ingest)."
  }
}

variable "region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-southeast-2"
}

variable "source_bucket" {
  description = "Name of the source S3 bucket for RINEX data (e.g., geonet-open-data)"
  type        = string
  default     = "geonet-open-data"
}

variable "lookback_hours" {
  description = "UTC rolling window for ingest sync (1-168). Default 1h with hourly schedule."
  type        = number
  default     = 1
}

variable "source_prefix" {
  description = "S3 prefix for source RINEX hourly data"
  type        = string
  default     = "gnss/rinexhourly/"
}

variable "schedule_expression" {
  description = "EventBridge Scheduler expression for ingest sync (rate or cron, UTC). Default hourly; keep LOOKBACK_HOURS >= schedule interval."
  type        = string
  default     = "rate(1 hour)"
}

variable "processor_source_prefix" {
  description = "S3 prefix for raw RINEX objects in the data lake that processor Lambda reads (e.g. raw/rinexhourly/). Must match the ingest layer's output prefix."
  type        = string
  default     = "raw/rinexhourly/"
}

variable "destination_prefix" {
  description = "S3 prefix for processor output objects written by processor Lambda (e.g. processed/tec/)."
  type        = string
  default     = "processed/tec/"
}

variable "processor_image_uri" {
  description = "Override ECR image URI for processor Lambda container. When empty, uses tec-processor-image ECR repo and processor_image_tag."
  type        = string
  default     = ""
}

variable "processor_image_tag" {
  description = "Tag mirrored from ghcr.io/platformfuzz/tec-processor-image (Python 3.13). Uses the current image contract (SOURCE_BUCKET/SOURCE_PREFIX/DESTINATION_BUCKET/DESTINATION_PREFIX)."
  type        = string
  default     = "latest"
}

variable "processor_maximum_concurrency" {
  description = "Maximum concurrent SQS batches for processor ingest (process-queue) event source mapping."
  type        = number
  default     = 15
}

variable "reprocess_maximum_concurrency" {
  description = "Maximum concurrent SQS batches for processor reprocess-queue event source mapping."
  type        = number
  default     = 2
}

variable "processor_memory_mb" {
  description = "Memory (MiB) allocated to the processor Lambda container (max 2048 for container images)"
  type        = number
  default     = 2048

  validation {
    condition     = var.processor_memory_mb >= 128 && var.processor_memory_mb <= 2048
    error_message = "processor_memory_mb must be between 128 and 2048 for Lambda container images."
  }
}

variable "processor_timeout_seconds" {
  description = "Maximum duration in seconds for each processor Lambda invocation"
  type        = number
  default     = 900
}

variable "dlq_visible_threshold" {
  description = "Visible message threshold for ingest/reprocess DLQ alarms"
  type        = number
  default     = 1
}

variable "queue_stale_age_seconds_threshold" {
  description = "Oldest message age threshold in seconds for process/reprocess queue stale alarms"
  type        = number
  default     = 1800
}

variable "process_queue_visible_threshold" {
  description = "Visible message threshold for early process-queue depth alarm"
  type        = number
  default     = 100
}

variable "deploy_amplify_on_apply" {
  description = "Build and deploy the portal to Amplify after apply via manual zip upload (no Git repo). Set false for CI or when Node.js is unavailable."
  type        = bool
  default     = true
}

variable "web_source_dir" {
  description = "Path to the web/ directory containing Portal source assets"
  type        = string
  default     = "../web"
}

variable "amplify_domain" {
  description = "Amplify branch hostname for API Gateway CORS. Use '*' (default) to auto-derive from the deployed Amplify branch."
  type        = string
  default     = "*"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project   = "event-driven-serverless-platform-demo"
    ManagedBy = "terraform"
  }
}
