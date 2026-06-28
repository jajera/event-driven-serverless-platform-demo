resource "aws_iam_role" "query_api" {
  name = "query-api-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "query_api_logs" {
  name = "query-api-cloudwatch-logs"
  role = aws_iam_role.query_api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "query_api_s3_read" {
  name = "query-api-s3-read"
  role = aws_iam_role.query_api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
        ]
        Resource = "arn:aws:s3:::${var.bucket_name}/processed/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.bucket_name}"
        Condition = {
          StringLike = {
            "s3:prefix" = ["processed/*"]
          }
        }
      }
    ]
  })
}

locals {
  query_api_source_hash = sha256(join("", [
    filesha256("${path.module}/../../../services/lambda-requirements.txt"),
    filesha256("${path.module}/../../../scripts/build-lambda-packages.sh"),
    filesha256("${path.module}/../../../services/query-api/src/query_api/handler.py"),
    filesha256("${path.module}/../../../services/query-api/src/query_api/logic.py"),
    filesha256("${path.module}/../../../services/query-api/src/query_api/__init__.py"),
  ]))
}

data "external" "query_api_package" {
  program = ["bash", "${path.module}/../../../scripts/build-lambda-packages.sh"]

  query = {
    source_hash = local.query_api_source_hash
    packages    = "query-api"
  }
}

resource "aws_cloudwatch_log_group" "query_api" {
  name              = "/aws/lambda/query-api"
  retention_in_days = 1
  skip_destroy      = false

  tags = var.tags
}

resource "aws_lambda_function" "query_api" {
  function_name = "query-api"
  role          = aws_iam_role.query_api.arn
  handler       = "query_api.handler.handler"
  runtime       = "python3.14"
  timeout       = 30
  memory_size   = 2048

  filename         = "${path.module}/../../.build/query_api.zip"
  source_code_hash = data.external.query_api_package.result.query_api_hash

  depends_on = [aws_cloudwatch_log_group.query_api]

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.query_api.name
  }

  environment {
    variables = {
      DATA_LAKE_BUCKET   = var.bucket_name
      QUERY_MAX_ROWS     = "2000"
      QUERY_READ_WORKERS = "8"
      CORS_ALLOW_ORIGIN  = local.cors_allow_origin
    }
  }

  tags = var.tags
}
