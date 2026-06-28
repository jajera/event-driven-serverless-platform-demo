variable "aws_region" {
  description = "AWS region for CloudWatch dashboard widgets"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "enable_presentation" {
  description = "When true, create presentation-layer alarms and dashboard widgets"
  type        = bool
  default     = false
}

variable "process_queue_name" {
  description = "Name of the ingest process-queue"
  type        = string
}

variable "reprocess_queue_name" {
  description = "Name of the reprocess-queue"
  type        = string
}

variable "dead_letter_queue_name" {
  description = "Name of the ingest dead-letter-queue"
  type        = string
}

variable "reprocess_dead_letter_queue_name" {
  description = "Name of the reprocess dead-letter-queue"
  type        = string
}

variable "processor_function_name" {
  description = "Name of the processor Lambda container function"
  type        = string
}

variable "ingest_sync_function_name" {
  description = "Name of the ingest-sync Lambda function"
  type        = string
}

variable "query_api_function_name" {
  description = "Name of the query-api Lambda function (required when enable_presentation is true)"
  type        = string
  default     = null

  validation {
    condition     = !var.enable_presentation || var.query_api_function_name != null
    error_message = "query_api_function_name is required when enable_presentation is true."
  }
}

variable "reprocess_api_function_name" {
  description = "Name of the reprocess-api Lambda function (required when enable_presentation is true)"
  type        = string
  default     = null

  validation {
    condition     = !var.enable_presentation || var.reprocess_api_function_name != null
    error_message = "reprocess_api_function_name is required when enable_presentation is true."
  }
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
