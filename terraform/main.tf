# =============================================================================
# Root Module — five modules aligned with docs/ARCHITECTURE.md
# =============================================================================
#   ingest       → S3 data lake, ingest-sync Lambda
#   ingest-scheduler → EventBridge Scheduler + invoke role/permission
#   processing   → SQS/DLQ, S3 notifications, DynamoDB jobs, processor Lambda container
#   presentation → query/reprocess Lambdas, API Gateway, Amplify portal
#   observability → CloudWatch alarms, SNS, dashboard (when processing enabled)
#
# Dependency chain: ingest → processing → presentation
# Toggle each layer with enable_ingest / enable_processing / enable_presentation.
# Variable validation enforces the chain (processing needs ingest; presentation needs processing).
# =============================================================================

module "ingest" {
  count  = var.enable_ingest ? 1 : 0
  source = "./modules/ingest"

  source_bucket  = var.source_bucket
  lookback_hours = var.lookback_hours
  source_prefix  = var.source_prefix
  tags           = var.tags
}

module "ingest_scheduler" {
  count  = var.enable_ingest ? 1 : 0
  source = "./modules/ingest-scheduler"

  schedule_expression       = var.schedule_expression
  ingest_sync_function_arn  = module.ingest[0].function_arn
  ingest_sync_function_name = module.ingest[0].ingest_sync_function_name
  tags                      = var.tags
}

module "processing" {
  count  = var.enable_processing ? 1 : 0
  source = "./modules/processing"

  bucket_arn                    = module.ingest[0].bucket_arn
  bucket_id                     = module.ingest[0].bucket_id
  bucket_name                   = module.ingest[0].bucket_name
  source_prefix                 = var.processor_source_prefix
  destination_prefix            = var.destination_prefix
  processor_image_uri           = var.processor_image_uri
  processor_image_tag           = var.processor_image_tag
  processor_maximum_concurrency = var.processor_maximum_concurrency
  reprocess_maximum_concurrency = var.reprocess_maximum_concurrency
  processor_memory_mb           = var.processor_memory_mb
  processor_timeout_seconds     = var.processor_timeout_seconds
  tags                          = var.tags
}

module "presentation" {
  count  = var.enable_presentation ? 1 : 0
  source = "./modules/presentation"

  bucket_name         = module.ingest[0].bucket_name
  reprocess_queue_url = module.processing[0].reprocess_queue_url
  reprocess_queue_arn = module.processing[0].reprocess_queue_arn
  jobs_table_name     = module.processing[0].jobs_table_name
  jobs_table_arn      = module.processing[0].jobs_table_arn
  web_source_dir      = var.web_source_dir
  amplify_domain      = var.amplify_domain
  tags                = var.tags
}

module "observability" {
  count  = var.enable_processing ? 1 : 0
  source = "./modules/observability"

  aws_region                        = var.region
  tags                              = var.tags
  enable_presentation               = var.enable_presentation
  dlq_visible_threshold             = var.dlq_visible_threshold
  queue_stale_age_seconds_threshold = var.queue_stale_age_seconds_threshold
  process_queue_visible_threshold   = var.process_queue_visible_threshold

  process_queue_name                = module.processing[0].process_queue_name
  reprocess_queue_name              = module.processing[0].reprocess_queue_name
  dead_letter_queue_name            = module.processing[0].dead_letter_queue_name
  reprocess_dead_letter_queue_name  = module.processing[0].reprocess_dead_letter_queue_name
  processor_function_name           = module.processing[0].processor_function_name
  ingest_sync_function_name         = module.ingest[0].ingest_sync_function_name

  query_api_function_name     = var.enable_presentation ? module.presentation[0].query_api_function_name : null
  reprocess_api_function_name = var.enable_presentation ? module.presentation[0].reprocess_api_function_name : null
}
