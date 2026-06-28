resource "aws_s3_bucket_notification" "raw_rinexhourly" {
  bucket = var.bucket_id

  queue {
    queue_arn     = aws_sqs_queue.process_queue.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = trimsuffix(var.source_prefix, "/")
  }

  depends_on = [
    aws_sqs_queue_policy.process_queue_policy,
  ]
}
