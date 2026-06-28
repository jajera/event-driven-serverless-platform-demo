locals {
  alarm_sns_topic_arn = aws_sns_topic.alarm_notifications.arn
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages_visible" {
  alarm_name          = "dlq-messages-visible"
  alarm_description   = "Alarm when Dead_Letter_Queue has visible messages above configured threshold"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = var.dlq_visible_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.dead_letter_queue_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "reprocess_dlq_messages_visible" {
  alarm_name          = "reprocess-dlq-messages-visible"
  alarm_description   = "Alarm when Reprocess_Dead_Letter_Queue has visible messages above configured threshold"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = var.dlq_visible_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.reprocess_dead_letter_queue_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "processor_lambda_errors" {
  alarm_name          = "processor-lambda-errors"
  alarm_description   = "Processor Lambda reported one or more errors within 5 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.processor_function_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "processor_lambda_throttles" {
  alarm_name          = "processor-lambda-throttles"
  alarm_description   = "Processor Lambda was throttled within 5 minutes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.processor_function_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "process_queue_stale_messages" {
  alarm_name          = "process-queue-stale-messages"
  alarm_description   = "Oldest message on process-queue has been waiting beyond configured threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.queue_stale_age_seconds_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.process_queue_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "reprocess_queue_stale_messages" {
  alarm_name          = "reprocess-queue-stale-messages"
  alarm_description   = "Oldest message on reprocess-queue has been waiting beyond configured threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.queue_stale_age_seconds_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.reprocess_queue_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "process_queue_messages_visible" {
  alarm_name          = "process-queue-messages-visible"
  alarm_description   = "process-queue visible messages above configured threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.process_queue_visible_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.process_queue_name
  }

  alarm_actions = [local.alarm_sns_topic_arn]

  tags = var.tags
}
