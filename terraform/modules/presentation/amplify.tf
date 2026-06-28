resource "aws_amplify_app" "portal" {
  name     = "event-driven-platform-portal"
  platform = "WEB"

  # build_spec is unused for manual zip deployments; kept for Amplify console compatibility.
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: dist
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
  EOT

  # VITE_API_URL is injected at build time by scripts/deploy-amplify.sh (manual zip deploy).
  # Avoid referencing API Gateway here — it would create a Terraform dependency cycle with Lambdas/CORS.

  tags = var.tags
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.portal.id
  branch_name = "main"

  # Manual deployment only — no Git repository connection.
  enable_auto_build = false

  tags = var.tags
}
