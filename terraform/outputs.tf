output "api_url" {
  description = "Base URL of the deployed API Gateway stage (null when presentation layer is disabled)"
  value       = var.enable_presentation ? module.presentation[0].api_url : null
}

output "amplify_app_id" {
  description = "Amplify application ID (null when presentation layer is disabled)"
  value       = var.enable_presentation ? module.presentation[0].amplify_app_id : null
}

output "app_domain" {
  description = "Default domain of the Amplify app (null when presentation layer is disabled)"
  value       = var.enable_presentation ? module.presentation[0].app_domain : null
}

output "app_url" {
  description = "Full HTTPS URL of the Amplify portal (null when presentation layer is disabled)"
  value       = var.enable_presentation ? module.presentation[0].app_url : null
}

output "cors_domain" {
  description = "Amplify branch hostname for API Gateway CORS (null when presentation layer is disabled)"
  value       = var.enable_presentation ? module.presentation[0].cors_domain : null
}

output "bucket_name" {
  description = "Name of the Data Lake S3 bucket (null when ingest layer is disabled)"
  value       = var.enable_ingest ? module.ingest[0].bucket_name : null
}

output "queue_url" {
  description = "URL of the ingest Process_Queue (S3 notifications; null when processing layer is disabled)"
  value       = var.enable_processing ? module.processing[0].queue_url : null
}

output "reprocess_queue_url" {
  description = "URL of the Reprocess_Queue (Reprocess API; null when processing layer is disabled)"
  value       = var.enable_processing ? module.processing[0].reprocess_queue_url : null
}

output "jobs_table_name" {
  description = "Name of the DynamoDB Jobs table (null when processing layer is disabled)"
  value       = var.enable_processing ? module.processing[0].jobs_table_name : null
}

output "processor_image_uri" {
  description = "Container image URI used by processor Lambda container (null when processing layer is disabled)"
  value       = var.enable_processing ? module.processing[0].processor_image_uri : null
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard for platform metrics and alarms (null when processing layer is disabled)"
  value       = var.enable_processing ? module.observability[0].cloudwatch_dashboard_name : null
}

output "alarm_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarm notifications (null when processing layer is disabled)"
  value       = var.enable_processing ? module.observability[0].alarm_topic_arn : null
}

output "layers_enabled" {
  description = "Which platform layers are deployed"
  value = {
    ingest       = var.enable_ingest
    processing   = var.enable_processing
    presentation = var.enable_presentation
  }
}
