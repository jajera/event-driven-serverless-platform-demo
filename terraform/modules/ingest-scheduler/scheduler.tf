resource "aws_iam_role" "scheduler_invoke" {
  name = "ingest-sync-scheduler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "scheduler_invoke_lambda" {
  name = "invoke-ingest-sync"
  role = aws_iam_role.scheduler_invoke.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = var.ingest_sync_function_arn
      }
    ]
  })
}

resource "aws_scheduler_schedule" "ingest_sync" {
  name        = "ingest-sync-schedule"
  description = "Triggers ingest-sync Lambda on a recurring UTC schedule"
  group_name  = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = "UTC"

  target {
    arn      = var.ingest_sync_function_arn
    role_arn = aws_iam_role.scheduler_invoke.arn
  }
}

resource "aws_lambda_permission" "scheduler_invoke" {
  statement_id  = "AllowSchedulerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.ingest_sync_function_name
  principal     = "scheduler.amazonaws.com"
  source_arn    = aws_scheduler_schedule.ingest_sync.arn
}
