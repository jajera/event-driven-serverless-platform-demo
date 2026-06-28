output "queue_arn" {
  description = "ARN of the ingest Process_Queue (S3 notifications)"
  value       = aws_sqs_queue.process_queue.arn
}

output "queue_url" {
  description = "URL of the ingest Process_Queue (S3 notifications)"
  value       = aws_sqs_queue.process_queue.url
}

output "reprocess_queue_arn" {
  description = "ARN of the Reprocess_Queue (Reprocess API)"
  value       = aws_sqs_queue.reprocess_queue.arn
}

output "reprocess_queue_url" {
  description = "URL of the Reprocess_Queue (Reprocess API)"
  value       = aws_sqs_queue.reprocess_queue.url
}

output "dlq_arn" {
  description = "ARN of the ingest Dead_Letter_Queue"
  value       = aws_sqs_queue.dead_letter_queue.arn
}

output "reprocess_dlq_arn" {
  description = "ARN of the Reprocess_Dead_Letter_Queue"
  value       = aws_sqs_queue.reprocess_dead_letter_queue.arn
}

output "jobs_table_name" {
  description = "Name of the DynamoDB Jobs table"
  value       = aws_dynamodb_table.jobs.name
}

output "jobs_table_arn" {
  description = "ARN of the DynamoDB Jobs table"
  value       = aws_dynamodb_table.jobs.arn
}

output "processor_image_uri" {
  description = "ECR image URI used by processor Lambda container"
  value       = local.processor_image_uri
}

output "process_queue_name" {
  description = "Name of the ingest process-queue"
  value       = aws_sqs_queue.process_queue.name
}

output "reprocess_queue_name" {
  description = "Name of the reprocess-queue"
  value       = aws_sqs_queue.reprocess_queue.name
}

output "dead_letter_queue_name" {
  description = "Name of the ingest dead-letter-queue"
  value       = aws_sqs_queue.dead_letter_queue.name
}

output "reprocess_dead_letter_queue_name" {
  description = "Name of the reprocess dead-letter-queue"
  value       = aws_sqs_queue.reprocess_dead_letter_queue.name
}

output "processor_function_name" {
  description = "Name of the processor Lambda container function"
  value       = aws_lambda_function.processor.function_name
}

output "processor_function_arn" {
  description = "ARN of the processor Lambda container function"
  value       = aws_lambda_function.processor.arn
}

