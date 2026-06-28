data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "reprocess_api" {
  name               = "reprocess-api-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "cloudwatch_logs" {
  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role_policy" "cloudwatch_logs" {
  name   = "cloudwatch-logs"
  role   = aws_iam_role.reprocess_api.id
  policy = data.aws_iam_policy_document.cloudwatch_logs.json
}

data "aws_iam_policy_document" "sqs_send" {
  statement {
    effect = "Allow"

    actions = ["sqs:SendMessage"]

    resources = [var.reprocess_queue_arn]
  }
}

resource "aws_iam_role_policy" "sqs_send" {
  name   = "sqs-send-message"
  role   = aws_iam_role.reprocess_api.id
  policy = data.aws_iam_policy_document.sqs_send.json
}

data "aws_iam_policy_document" "dynamodb_access" {
  statement {
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]

    resources = [var.jobs_table_arn]
  }
}

resource "aws_iam_role_policy" "dynamodb_access" {
  name   = "dynamodb-read-write"
  role   = aws_iam_role.reprocess_api.id
  policy = data.aws_iam_policy_document.dynamodb_access.json
}

resource "aws_iam_role_policy" "reprocess_api_s3_read" {
  name = "reprocess-api-s3-read"
  role = aws_iam_role.reprocess_api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.bucket_name}"
        Condition = {
          StringLike = {
            "s3:prefix" = ["raw/rinexhourly/*"]
          }
        }
      }
    ]
  })
}

data "archive_file" "reprocess_api" {
  type        = "zip"
  source_dir  = "${path.module}/../../../services/reprocess-api/src"
  output_path = "${path.module}/reprocess_api.zip"
}

resource "aws_cloudwatch_log_group" "reprocess_api" {
  name              = "/aws/lambda/reprocess-api"
  retention_in_days = 1
  skip_destroy      = false

  tags = var.tags
}

resource "aws_lambda_function" "reprocess_api" {
  function_name    = "reprocess-api"
  role             = aws_iam_role.reprocess_api.arn
  handler          = "reprocess_api.handler.handler"
  runtime          = "python3.14"
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.reprocess_api.output_path
  source_code_hash = data.archive_file.reprocess_api.output_base64sha256

  depends_on = [aws_cloudwatch_log_group.reprocess_api]

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.reprocess_api.name
  }

  environment {
    variables = {
      REPROCESS_QUEUE_URL = var.reprocess_queue_url
      JOBS_TABLE_NAME     = var.jobs_table_name
      DATA_LAKE_BUCKET    = var.bucket_name
      CORS_ALLOW_ORIGIN   = local.cors_allow_origin
    }
  }

  tags = var.tags
}
