const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const githubHelper = require("./github");
const awsHelper = require("./aws");

function unique(array) {
  return array.filter((v, i, arr) => i == arr.indexOf(v));
}

function flatten(array) {
  return array.reduce((a, b) => a.concat(b), []);
}

function getTypeFromCommits(commits, type) {
  return unique(flatten(flatten(commits).map(c => c[type])));
}

const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

function stripPrefix(prefix, array) {
  return array.map(file => {
    if (prefix) {
      if (file.startsWith(prefix + "/")) {
        return file.substring(prefix.length + 1)
      } else {
        return undefined;
      }
    } else {
      return file
    }
  }).filter(f => f !== undefined)
}

exports.handleEvent = async (event, context) => {
  let commits = JSON.parse(event.body).commits;
  let addedFiles = getTypeFromCommits(commits, "added");
  let modifiedFiles = getTypeFromCommits(commits, "modified");
  let deletedFiles = getTypeFromCommits(commits, "removed");
  console.info({ addedFiles, deletedFiles, modifiedFiles });
  let targetDir = `/tmp/${context.awsRequestId ||
    "repo" + new Date().getTime()}`;
  let user = process.env.GITHUB_USER;
  let token = process.env.GITHUB_TOKEN;
  let repo = process.env.GITHUB_REPO;
  await githubHelper.getRepo(repo, user, token, targetDir);
  const prefix = process.env.PREFIX || ""

  let uploadToS3Keys = stripPrefix(prefix, addedFiles.concat(modifiedFiles))

  let uploadResponses = awsHelper.uploadToS3(
    process.env.AWS_S3_BUCKET,
    targetDir,
    prefix,
    uploadToS3Keys
  );

  let deleteResponses = awsHelper.deleteFromS3(
    process.env.AWS_S3_BUCKET,
    stripPrefix(prefix, deletedFiles)
  );

  let distributionId = process.env.AWS_CLOUDFRONT_DISTRIBUTION;
  let cloudFrontResponse;
  if (distributionId) {
    console.info("Resetting cache " + distributionId);
    cloudFrontResponse = awsHelper.resetCloudfrontCache(distributionId);
  }

  if (process.env.REGEN_PUBLIC_CMD) {
    let cmd = process.env.REGEN_PUBLIC_CMD;
    let output = await execP(cmd, { cwd: targetDir });
    console.info(cmd, output);
    if (!(await githubHelper.isClean(targetDir))) {
      await githubHelper.commitAndPushPublic(targetDir);
    }
  }

  const response = {
    statusCode: 200,
    body: JSON.stringify(
      {
        upload: await uploadResponses,
        delete: await deleteResponses,
        cloudFront: await cloudFrontResponse
      },
      getCircularReplacer()
    )
  };

  return response;
};

exports.handler = async (event, context) => {
  let invalidResponse = githubHelper.validateHookEvent(event);
  if (invalidResponse) {
    return invalidResponse;
  }

  return exports.handleEvent(event, context);
};

if (require.main === module) {
  exports
    .handleEvent(
      {
        body: fs.readFileSync("./example-webhook-event.json", {
          encoding: "utf8"
        })
      },
      {}
    )
    .then(console.info);
}
