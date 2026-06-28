locals {
  processing_alarm_arns = [
    aws_cloudwatch_metric_alarm.dlq_messages_visible.arn,
    aws_cloudwatch_metric_alarm.reprocess_dlq_messages_visible.arn,
    aws_cloudwatch_metric_alarm.processor_lambda_errors.arn,
    aws_cloudwatch_metric_alarm.processor_lambda_throttles.arn,
    aws_cloudwatch_metric_alarm.process_queue_messages_visible.arn,
    aws_cloudwatch_metric_alarm.process_queue_stale_messages.arn,
    aws_cloudwatch_metric_alarm.reprocess_queue_stale_messages.arn,
    aws_cloudwatch_metric_alarm.ingest_sync_errors.arn,
  ]

  presentation_alarm_arns = var.enable_presentation ? [
    aws_cloudwatch_metric_alarm.query_api_errors[0].arn,
    aws_cloudwatch_metric_alarm.reprocess_api_errors[0].arn,
  ] : []

  platform_alarm_arns = concat(local.processing_alarm_arns, local.presentation_alarm_arns)

  presentation_widgets = var.enable_presentation ? [
    {
      type   = "metric"
      x      = 0
      y      = 29
      width  = 24
      height = 6
      properties = {
        title  = "Presentation APIs"
        region = var.aws_region
        view   = "timeSeries"
        period = 300
        metrics = [
          ["AWS/Lambda", "Invocations", "FunctionName", var.query_api_function_name, { stat = "Sum", label = "query-api invocations" }],
          [".", "Errors", ".", ".", { stat = "Sum", label = "query-api errors", color = "#d62728" }],
          ["AWS/Lambda", "Invocations", "FunctionName", var.reprocess_api_function_name, { stat = "Sum", label = "reprocess-api invocations" }],
          [".", "Errors", ".", ".", { stat = "Sum", label = "reprocess-api errors", color = "#ff7f0e" }],
        ]
      }
    },
  ] : []
}

resource "aws_cloudwatch_dashboard" "platform" {
  dashboard_name = "event-driven-platform"

  dashboard_body = jsonencode({
    widgets = concat(
      [
        {
          type   = "alarm"
          x      = 0
          y      = 0
          width  = 24
          height = 5
          properties = {
            title  = "Platform alarms"
            alarms = local.platform_alarm_arns
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 5
          width  = 12
          height = 6
          properties = {
            title  = "SQS queue depth"
            region = var.aws_region
            view   = "timeSeries"
            stat   = "Maximum"
            period = 300
            metrics = [
              ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.process_queue_name, { label = "process-queue" }],
              ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.reprocess_queue_name, { label = "reprocess-queue" }],
              [".", ".", ".", var.dead_letter_queue_name, { label = "ingest-dlq" }],
              [".", ".", ".", var.reprocess_dead_letter_queue_name, { label = "reprocess-dlq" }],
            ]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 5
          width  = 12
          height = 6
          properties = {
            title  = "SQS oldest message age (seconds)"
            region = var.aws_region
            view   = "timeSeries"
            stat   = "Maximum"
            period = 300
            metrics = [
              ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", var.process_queue_name, { label = "process-queue" }],
              ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", var.reprocess_queue_name, { label = "reprocess-queue" }],
            ]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 11
          width  = 12
          height = 6
          properties = {
            title  = "Processor Lambda throughput"
            region = var.aws_region
            view   = "timeSeries"
            period = 300
            metrics = [
              ["AWS/Lambda", "Invocations", "FunctionName", var.processor_function_name, { stat = "Sum", label = "invocations" }],
              [".", "Errors", ".", ".", { stat = "Sum", label = "errors", color = "#d62728" }],
              [".", "Throttles", ".", ".", { stat = "Sum", label = "throttles", color = "#ff7f0e" }],
            ]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 11
          width  = 12
          height = 6
          properties = {
            title  = "Processor Lambda duration and concurrency"
            region = var.aws_region
            view   = "timeSeries"
            period = 300
            metrics = [
              ["AWS/Lambda", "Duration", "FunctionName", var.processor_function_name, { stat = "Average", label = "avg duration ms" }],
              [".", "ConcurrentExecutions", ".", ".", { stat = "Maximum", label = "max concurrent", yAxis = "right" }],
            ]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 17
          width  = 12
          height = 6
          properties = {
            title  = "Ingest sync"
            region = var.aws_region
            view   = "timeSeries"
            period = 300
            metrics = [
              ["AWS/Lambda", "Invocations", "FunctionName", var.ingest_sync_function_name, { stat = "Sum", label = "invocations" }],
              [".", "Errors", ".", ".", { stat = "Sum", label = "errors", color = "#d62728" }],
              [".", "Duration", ".", ".", { stat = "Average", label = "avg duration ms", yAxis = "right" }],
            ]
          }
        },
      ],
      local.presentation_widgets,
    )
  })
}
