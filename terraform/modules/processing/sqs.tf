resource "aws_sqs_queue" "dead_letter_queue" {
  name                      = "dead-letter-queue"
  message_retention_seconds = 1209600 # 14 days

  tags = var.tags
}

resource "aws_sqs_queue" "process_queue" {
  name                       = "process-queue"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 604800 # 7 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter_queue.arn
    maxReceiveCount     = 5
  })

  tags = var.tags
}

resource "aws_sqs_queue" "reprocess_dead_letter_queue" {
  name                      = "reprocess-dead-letter-queue"
  message_retention_seconds = 1209600 # 14 days

  tags = var.tags
}

resource "aws_sqs_queue" "reprocess_queue" {
  name                       = "reprocess-queue"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 604800 # 7 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.reprocess_dead_letter_queue.arn
    maxReceiveCount     = 5
  })

  tags = var.tags
}

data "aws_iam_policy_document" "process_queue_policy" {
  statement {
    sid    = "AllowS3SendMessage"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.process_queue.arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [var.bucket_arn]
    }
  }
}

resource "aws_sqs_queue_policy" "process_queue_policy" {
  queue_url = aws_sqs_queue.process_queue.url
  policy    = data.aws_iam_policy_document.process_queue_policy.json
}
