output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard name for platform metrics and alarms"
  value       = aws_cloudwatch_dashboard.platform.dashboard_name
}

output "alarm_topic_arn" {
  description = "ARN of the SNS topic used for CloudWatch alarm notifications"
  value       = aws_sns_topic.alarm_notifications.arn
}
