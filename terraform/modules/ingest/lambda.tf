resource "aws_iam_role" "ingest_sync" {
  name = "ingest-sync-lambda-role"

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

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.ingest_sync.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "s3_access" {
  name = "ingest-sync-s3-access"
  role = aws_iam_role.ingest_sync.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListSourceBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = ["arn:aws:s3:::${var.source_bucket}"]
      },
      {
        Sid      = "GetSourceObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["arn:aws:s3:::${var.source_bucket}/*"]
      },
      {
        Sid      = "ListDataLakeBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.data_lake.arn]
      },
      {
        Sid      = "ReadWriteDataLakeObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = ["${aws_s3_bucket.data_lake.arn}/*"]
      }
    ]
  })
}

data "archive_file" "ingest_sync" {
  type        = "zip"
  source_dir  = "${path.module}/../../../services/ingest-sync/src"
  output_path = "${path.module}/ingest_sync.zip"
}

resource "aws_cloudwatch_log_group" "ingest_sync" {
  name              = "/aws/lambda/ingest-sync"
  retention_in_days = 1
  skip_destroy      = false

  tags = var.tags
}

resource "aws_lambda_function" "ingest_sync" {
  function_name = "ingest-sync"
  role          = aws_iam_role.ingest_sync.arn
  handler       = "ingest_sync.handler.handler"
  runtime       = "python3.14"
  timeout       = 900
  memory_size   = 1024

  filename         = data.archive_file.ingest_sync.output_path
  source_code_hash = data.archive_file.ingest_sync.output_base64sha256

  depends_on = [aws_cloudwatch_log_group.ingest_sync]

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.ingest_sync.name
  }

  environment {
    variables = {
      LOOKBACK_HOURS   = tostring(var.lookback_hours)
      DATA_LAKE_BUCKET = aws_s3_bucket.data_lake.id
      SOURCE_BUCKET    = var.source_bucket
      SOURCE_PREFIX    = var.source_prefix
    }
  }

  tags = var.tags
}
