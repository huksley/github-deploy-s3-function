const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const githubHelper = require("./github");
const awsHelper = require("./aws");
const execP = promisify(exec);

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
  return array
    .map(file => {
      if (prefix) {
        if (file.startsWith(prefix + "/")) {
          return file.substring(prefix.length + 1);
        } else {
          return undefined;
        }
      } else {
        return file;
      }
    })
    .filter(f => f !== undefined);
}

exports.handleEvent = async (event, context) => {
  const body = JSON.parse(event.body);
  const commits = body.commits;
  const addedFiles = getTypeFromCommits(commits, "added");
  const modifiedFiles = getTypeFromCommits(commits, "modified");
  const deletedFiles = getTypeFromCommits(commits, "removed");
  const targetDir = `/tmp/git${body.after || "git" + new Date().getTime()}`;
  let user = body.repository.owner.login;
  let token = process.env.GITHUB_TOKEN;
  let repo = body.repository.full_name;
  const branch = body.ref
  await githubHelper.getRepo(repo, user, token, targetDir, branch);
  const prefix = process.env.PREFIX || "";

  let uploadToS3Keys = stripPrefix(prefix, addedFiles.concat(modifiedFiles));

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

  let cmdOutput;
  if (process.env.AFTER_PUBLISH_CMD) {
    let cmd = process.env.AFTER_PUBLISH_CMD;
    cmdOutput = await execP(cmd, { cwd: targetDir });
    const isClean = await githubHelper.isClean(targetDir);
    if (!isClean) {
      await githubHelper.commitAndPush(
        targetDir,
        prefix ? prefix : ".",
        body.repository.owner.email,
        body.repository.owner.name,
        branch,
        process.env.GITHUB_COMMIT_MESSAGE || "Updates"
      );
    }
  }

  const stats = {
    upload: await uploadResponses,
    delete: await deleteResponses,
    cloudFront: await cloudFrontResponse,
    cmdOutput
  };

  const response = {
    statusCode: 200,
    body: JSON.stringify(stats, getCircularReplacer())
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
