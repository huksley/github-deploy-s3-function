Deploy to S3 via GitHub Webhook and AWS Lambda
=============

The code fetches the latest version of the repo from GitHub,
sync's the folder to S3 and optionally creates a CloudFront invalidation to clear the cache.

## Setup

This project works by setting a GitHub webhook to trigger an API setup using [AWS API Gateway](https://aws.amazon.com/api-gateway/) which simply triggers
an [AWS Lambda].

### Configuration

- AWS_S3_BUCKET: bucket to sync to
- GITHUB_REPO: The repo where the S3 assets are synced from
- GITHUB_TOKEN: A GitHub [token](https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/) for your account
- GITHUB_USER: GitHub username
- GITHUB_WEBHOOK_SECRET: See https://developer.github.com/webhooks/securing/
- USER_AGENT: Can be anything, something identifying you our your repo is preferred
- AWS_CLOUDFRONT_DISTRIBUTION: Optional, distribution ID
- REGEN_PUBLIC_CMD: This should be defined only if this command should be
    run as part of the hook. If this command changes the repo, they will
    be committed back to the repo.

## Deploy

```
yarn 
source .env | yarn deploy
```

## Caveats

- Each build looks at the commits in the webhook and only uploads files that
are modified or added and deletes files that were removed in those commits.

- GitHub webhooks timeout after 10 seconds so its possible that GitHub
  will report a timeout but the build will still continue and succeed.
  