variable "schedule_expression" {
  description = "EventBridge Scheduler expression for ingest sync (rate or cron, UTC)."
  type        = string
}

variable "ingest_sync_function_arn" {
  description = "ARN of the ingest-sync Lambda function to invoke"
  type        = string
}

variable "ingest_sync_function_name" {
  description = "Name of the ingest-sync Lambda function to invoke"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
