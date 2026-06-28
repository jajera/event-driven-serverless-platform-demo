resource "aws_api_gateway_rest_api" "main" {
  name        = "event-driven-platform-api"
  description = "REST API for Query and Reprocess endpoints"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = var.tags
}

locals {
  amplify_host      = var.amplify_domain == "*" ? "${aws_amplify_branch.main.branch_name}.${aws_amplify_app.portal.default_domain}" : trimprefix(var.amplify_domain, "https://")
  cors_allow_origin = "https://${local.amplify_host}"
}

resource "aws_api_gateway_resource" "catalog" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "catalog"
}

resource "aws_api_gateway_method" "catalog_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.catalog.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "catalog_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.catalog.id
  http_method             = aws_api_gateway_method.catalog_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.query_api.invoke_arn
}

resource "aws_api_gateway_method" "catalog_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.catalog.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "catalog_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.catalog.id
  http_method = aws_api_gateway_method.catalog_options.http_method
  type        = "MOCK"

  passthrough_behavior = "WHEN_NO_MATCH"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "catalog_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.catalog.id
  http_method = aws_api_gateway_method.catalog_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "catalog_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.catalog.id
  http_method = aws_api_gateway_method.catalog_options.http_method
  status_code = aws_api_gateway_method_response.catalog_options_200.status_code

  depends_on = [
    aws_api_gateway_integration.catalog_options,
    aws_api_gateway_method_response.catalog_options_200,
  ]

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
  }
}

resource "aws_api_gateway_resource" "query" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "query"
}

resource "aws_api_gateway_method" "query_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.query.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "query_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.query.id
  http_method             = aws_api_gateway_method.query_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.query_api.invoke_arn
}

resource "aws_api_gateway_method" "query_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.query.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "query_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.query.id
  http_method = aws_api_gateway_method.query_options.http_method
  type        = "MOCK"

  passthrough_behavior = "WHEN_NO_MATCH"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "query_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.query.id
  http_method = aws_api_gateway_method.query_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "query_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.query.id
  http_method = aws_api_gateway_method.query_options.http_method
  status_code = aws_api_gateway_method_response.query_options_200.status_code

  depends_on = [
    aws_api_gateway_integration.query_options,
    aws_api_gateway_method_response.query_options_200,
  ]

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
  }
}

resource "aws_api_gateway_resource" "reprocess" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "reprocess"
}

resource "aws_api_gateway_method" "reprocess_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.reprocess.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "reprocess_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.reprocess.id
  http_method             = aws_api_gateway_method.reprocess_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.reprocess_api.invoke_arn
}

resource "aws_api_gateway_method" "reprocess_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.reprocess.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "reprocess_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.reprocess.id
  http_method = aws_api_gateway_method.reprocess_options.http_method
  type        = "MOCK"

  passthrough_behavior = "WHEN_NO_MATCH"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "reprocess_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.reprocess.id
  http_method = aws_api_gateway_method.reprocess_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "reprocess_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.reprocess.id
  http_method = aws_api_gateway_method.reprocess_options.http_method
  status_code = aws_api_gateway_method_response.reprocess_options_200.status_code

  depends_on = [
    aws_api_gateway_integration.reprocess_options,
    aws_api_gateway_method_response.reprocess_options_200,
  ]

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
  }
}

resource "aws_api_gateway_resource" "reprocess_job" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.reprocess.id
  path_part   = "{job_id}"
}

resource "aws_api_gateway_method" "reprocess_job_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.reprocess_job.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.job_id" = true
  }
}

resource "aws_api_gateway_integration" "reprocess_job_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.reprocess_job.id
  http_method             = aws_api_gateway_method.reprocess_job_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.reprocess_api.invoke_arn
}

resource "aws_api_gateway_method" "reprocess_job_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.reprocess_job.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "reprocess_job_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.reprocess_job.id
  http_method = aws_api_gateway_method.reprocess_job_options.http_method
  type        = "MOCK"

  passthrough_behavior = "WHEN_NO_MATCH"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "reprocess_job_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.reprocess_job.id
  http_method = aws_api_gateway_method.reprocess_job_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "reprocess_job_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.reprocess_job.id
  http_method = aws_api_gateway_method.reprocess_job_options.http_method
  status_code = aws_api_gateway_method_response.reprocess_job_options_200.status_code

  depends_on = [
    aws_api_gateway_integration.reprocess_job_options,
    aws_api_gateway_method_response.reprocess_job_options_200,
  ]

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
  }
}

resource "aws_lambda_permission" "query_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.query_api.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "reprocess_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reprocess_api.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.catalog.id,
      aws_api_gateway_resource.query.id,
      aws_api_gateway_resource.reprocess.id,
      aws_api_gateway_resource.reprocess_job.id,
      aws_api_gateway_method.catalog_get.id,
      aws_api_gateway_method.catalog_options.id,
      aws_api_gateway_method.query_get.id,
      aws_api_gateway_method.query_options.id,
      aws_api_gateway_method.reprocess_post.id,
      aws_api_gateway_method.reprocess_options.id,
      aws_api_gateway_method.reprocess_job_get.id,
      aws_api_gateway_method.reprocess_job_options.id,
      aws_api_gateway_integration.catalog_get.id,
      aws_api_gateway_integration.catalog_options.id,
      aws_api_gateway_integration.query_get.id,
      aws_api_gateway_integration.query_options.id,
      aws_api_gateway_integration.reprocess_post.id,
      aws_api_gateway_integration.reprocess_options.id,
      aws_api_gateway_integration.reprocess_job_get.id,
      aws_api_gateway_integration.reprocess_job_options.id,
      local.cors_allow_origin,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = "prod"

  tags = var.tags
}
