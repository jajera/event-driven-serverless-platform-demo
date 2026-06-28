resource "aws_cloudwatch_metric_alarm" "query_api_errors" {
  count = var.enable_presentation ? 1 : 0

  alarm_name          = "query-api-errors"
  alarm_description   = "Query API Lambda reported one or more errors within 5 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.query_api_function_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "reprocess_api_errors" {
  count = var.enable_presentation ? 1 : 0

  alarm_name          = "reprocess-api-errors"
  alarm_description   = "Reprocess API Lambda reported one or more errors within 5 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.reprocess_api_function_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}
