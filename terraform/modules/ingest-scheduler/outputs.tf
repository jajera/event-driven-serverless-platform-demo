output "schedule_arn" {
  description = "ARN of the ingest-sync EventBridge scheduler"
  value       = aws_scheduler_schedule.ingest_sync.arn
}
