output "bucket_name" {
  description = "Name of the Data Lake S3 bucket"
  value       = aws_s3_bucket.data_lake.id
}

output "bucket_arn" {
  description = "ARN of the Data Lake S3 bucket"
  value       = aws_s3_bucket.data_lake.arn
}

output "bucket_id" {
  description = "ID of the Data Lake S3 bucket (for S3 notifications)"
  value       = aws_s3_bucket.data_lake.id
}

output "function_arn" {
  description = "ARN of the Ingest Sync Lambda function"
  value       = aws_lambda_function.ingest_sync.arn
}

output "ingest_sync_function_name" {
  description = "Name of the ingest-sync Lambda function"
  value       = aws_lambda_function.ingest_sync.function_name
}
