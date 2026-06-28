resource "aws_cloudwatch_metric_alarm" "ingest_sync_errors" {
  alarm_name          = "ingest-sync-errors"
  alarm_description   = "Ingest-sync Lambda reported one or more errors within 5 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.ingest_sync_function_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}
