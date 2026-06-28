# Post-apply Amplify deployment — manual zip upload (no Git repository required).

locals {
  web_dir = abspath("${path.module}/${var.web_source_dir}")
  web_source_files = concat(
    tolist(fileset(local.web_dir, "src/**")),
    [
      for f in ["index.html", "package-lock.json", "package.json", "vite.config.ts", "tsconfig.json", "tsconfig.app.json"] :
      f if fileexists("${local.web_dir}/${f}")
    ],
  )
  web_source_hash = sha256(join("", [for f in local.web_source_files : filesha256("${local.web_dir}/${f}")]))
}

resource "terraform_data" "amplify_deploy" {
  count = var.enable_presentation && var.deploy_amplify_on_apply ? 1 : 0

  triggers_replace = [
    module.presentation[0].api_url,
    local.web_source_hash,
  ]

  depends_on = [module.presentation]

  provisioner "local-exec" {
    command     = "${path.module}/../scripts/deploy-amplify.sh"
    working_dir = path.module
    environment = {
      AMPLIFY_APP_ID = module.presentation[0].amplify_app_id
      AMPLIFY_BRANCH = module.presentation[0].amplify_branch_name
      VITE_API_URL   = module.presentation[0].api_url
      WEB_SOURCE_DIR = local.web_dir
      AWS_REGION     = var.region
    }
  }
}
