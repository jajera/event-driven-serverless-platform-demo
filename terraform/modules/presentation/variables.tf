variable "bucket_name" {
  description = "Name of the Data Lake bucket for Query API reads"
  type        = string
}

variable "reprocess_queue_url" {
  description = "URL of the Reprocess_Queue for Reprocess API"
  type        = string
}

variable "reprocess_queue_arn" {
  description = "ARN of the Reprocess_Queue for Reprocess API IAM"
  type        = string
}

variable "jobs_table_name" {
  description = "Name of the DynamoDB Jobs table"
  type        = string
}

variable "jobs_table_arn" {
  description = "ARN of the DynamoDB Jobs table for IAM"
  type        = string
}

variable "web_source_dir" {
  description = "Path to the web/ directory containing Portal source assets"
  type        = string
}

variable "amplify_domain" {
  description = "Amplify branch hostname for API Gateway CORS (e.g. main.xxx.amplifyapp.com). Use '*' to auto-derive from the Amplify branch."
  type        = string
  default     = "*"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
