output "api_url" {
  description = "Base URL of the deployed API Gateway stage"
  value       = aws_api_gateway_stage.prod.invoke_url
}

output "amplify_app_id" {
  description = "Amplify application ID"
  value       = aws_amplify_app.portal.id
}

output "amplify_branch_name" {
  description = "Amplify branch used for manual deployments"
  value       = aws_amplify_branch.main.branch_name
}

output "app_domain" {
  description = "Default domain of the Amplify app (hostname only)"
  value       = aws_amplify_app.portal.default_domain
}

output "app_url" {
  description = "Full HTTPS URL of the deployed Amplify portal"
  value       = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.portal.default_domain}"
}

output "cors_domain" {
  description = "Amplify branch hostname for API Gateway CORS (branch.default_domain)"
  value       = "${aws_amplify_branch.main.branch_name}.${aws_amplify_app.portal.default_domain}"
}

output "query_api_function_name" {
  description = "Name of the query-api Lambda function"
  value       = aws_lambda_function.query_api.function_name
}

output "reprocess_api_function_name" {
  description = "Name of the reprocess-api Lambda function"
  value       = aws_lambda_function.reprocess_api.function_name
}
