locals {
  processor_function_name = "processor"
}

resource "aws_iam_role" "processor" {
  name               = "processor-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "processor" {
  name              = "/aws/lambda/${local.processor_function_name}"
  retention_in_days = 1
  skip_destroy      = false

  tags = var.tags
}

data "aws_iam_policy_document" "processor_logs" {
  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      aws_cloudwatch_log_group.processor.arn,
      "${aws_cloudwatch_log_group.processor.arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "processor_logs" {
  name   = "processor-cloudwatch-logs"
  role   = aws_iam_role.processor.id
  policy = data.aws_iam_policy_document.processor_logs.json
}

data "aws_iam_policy_document" "processor_s3" {
  statement {
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values = [
        "${trimsuffix(var.source_prefix, "/")}/*",
        "${trimsuffix(var.destination_prefix, "/")}/*",
      ]
    }
  }

  statement {
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = [
      "${var.bucket_arn}/${trimsuffix(var.source_prefix, "/")}/*",
    ]
  }

  statement {
    effect  = "Allow"
    actions = ["s3:PutObject"]
    resources = [
      "${var.bucket_arn}/${trimsuffix(var.destination_prefix, "/")}/*",
    ]
  }
}

resource "aws_iam_role_policy" "processor_s3" {
  name   = "processor-s3-access"
  role   = aws_iam_role.processor.id
  policy = data.aws_iam_policy_document.processor_s3.json
}

data "aws_iam_policy_document" "processor_dynamodb" {
  statement {
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]

    resources = [aws_dynamodb_table.jobs.arn]
  }
}

resource "aws_iam_role_policy" "processor_dynamodb" {
  name   = "processor-dynamodb-access"
  role   = aws_iam_role.processor.id
  policy = data.aws_iam_policy_document.processor_dynamodb.json
}

data "aws_iam_policy_document" "processor_sqs" {
  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [
      aws_sqs_queue.process_queue.arn,
      aws_sqs_queue.reprocess_queue.arn,
    ]
  }
}

resource "aws_iam_role_policy" "processor_sqs" {
  name   = "processor-sqs-access"
  role   = aws_iam_role.processor.id
  policy = data.aws_iam_policy_document.processor_sqs.json
}

resource "aws_lambda_function" "processor" {
  function_name = local.processor_function_name
  role          = aws_iam_role.processor.arn
  package_type  = "Image"
  image_uri     = local.processor_image_uri
  timeout       = var.processor_timeout_seconds
  memory_size   = var.processor_memory_mb

  depends_on = [aws_cloudwatch_log_group.processor]

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.processor.name
  }

  environment {
    variables = {
      PROCESSOR_MODE         = "lambda"
      SOURCE_BUCKET          = var.bucket_name
      SOURCE_PREFIX          = var.source_prefix
      DESTINATION_BUCKET     = var.bucket_name
      DESTINATION_PREFIX     = var.destination_prefix
      NAV_DAY_OFFSET         = "1"
      NUMBA_CACHE_DIR        = "/tmp/numba-cache"
      SAVE_PARQUET           = "true"
      SAVE_CSV               = "true"
      SAVE_JSON              = "true"
      SAVE_STATIC_PLOTS      = "false"
      SAVE_INTERACTIVE_PLOTS = "false"
      JOBS_TABLE_NAME        = aws_dynamodb_table.jobs.name
    }
  }

  tags = var.tags
}

resource "aws_lambda_event_source_mapping" "processor_sqs_trigger_ingest" {
  event_source_arn        = aws_sqs_queue.process_queue.arn
  function_name           = aws_lambda_function.processor.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
  enabled                 = true

  scaling_config {
    maximum_concurrency = var.processor_maximum_concurrency
  }
}

resource "aws_lambda_event_source_mapping" "processor_sqs_trigger_reprocess" {
  event_source_arn        = aws_sqs_queue.reprocess_queue.arn
  function_name           = aws_lambda_function.processor.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
  enabled                 = true

  scaling_config {
    maximum_concurrency = var.reprocess_maximum_concurrency
  }
}
