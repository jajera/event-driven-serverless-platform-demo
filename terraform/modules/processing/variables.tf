variable "bucket_arn" {
  description = "ARN of the Data Lake bucket (from ingest layer)"
  type        = string
}

variable "bucket_id" {
  description = "ID of the Data Lake bucket for S3 event notifications"
  type        = string
}

variable "bucket_name" {
  description = "Name of the Data Lake bucket for Lambda environment and IAM"
  type        = string
}

variable "source_prefix" {
  description = "S3 prefix for raw RINEX objects written by the ingest layer (e.g. raw/rinexhourly/). Used as SOURCE_PREFIX env var and S3 notification filter."
  type        = string
  default     = "raw/rinexhourly/"
}

variable "destination_prefix" {
  description = "S3 prefix for processor output objects (e.g. processed/tec/)."
  type        = string
  default     = "processed/tec/"
}

variable "processor_image_uri" {
  description = "Override ECR image URI for processor Lambda container. When empty, uses tec-processor-image ECR repo and processor_image_tag (mirrored from GHCR)."
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

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
