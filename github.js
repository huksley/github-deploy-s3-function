const crypto = require("crypto");
const fs = require("fs");
const git = require("simple-git/promise")();

function signRequestBody(key, body) {
  return `sha1=${crypto
    .createHmac("sha1", key)
    .update(body, "utf-8")
    .digest("hex")}`;
}

exports.validateHookEvent = function(event) {
  const token = process.env.GITHUB_WEBHOOK_SECRET;
  const headers = event.headers;
  const sig = headers["X-Hub-Signature"];
  const githubEvent = headers["X-GitHub-Event"];
  const id = headers["X-GitHub-Delivery"];
  const calculatedSig = signRequestBody(token, event.body);

  if (typeof token !== "string") {
    const msg = "Must provide a 'GITHUB_WEBHOOK_SECRET' env variable";
    return {
      statusCode: 401,
      headers: { "Content-Type": "text/plain" },
      body: msg
    };
  }

  if (!sig) {
    const msg = "No X-Hub-Signature found on request";
    return {
      statusCode: 401,
      headers: { "Content-Type": "text/plain" },
      body: msg
    };
  }

  if (!githubEvent) {
    const msg = "No X-Github-Event found on request";
    return {
      statusCode: 422,
      headers: { "Content-Type": "text/plain" },
      body: msg
    };
  }

  if (!id) {
    const msg = "No X-Github-Delivery found on request";
    return {
      statusCode: 401,
      headers: { "Content-Type": "text/plain" },
      body: msg
    };
  }

  if (sig !== calculatedSig) {
    const msg = "X-Hub-Signature incorrect. Github webhook token doesn't match";
    return {
      statusCode: 401,
      headers: { "Content-Type": "text/plain" },
      body: msg
    };
  }

  if (githubEvent !== "push") {
    const msg = "Unsupported event type: " + githubEvent;
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: msg
    };
  }
};

exports.getRepo = async function(repo, user, token, path, branch) {
  if (!fs.existsSync(path)) {
    console.info(
      `Cloning https://${user}:xxx@github.com/${repo}.git into ${path}`
    );
    const repoUrl = `https://${user}:${token}@github.com/${repo}.git`;
    const result = await git.clone(repoUrl, path, [
      "--depth",
      "1",
      "--branch",
      branch
    ]);
    console.info("Cloned");
    return result;
  } else {
    console.info(
      `Updating https://${user}:xxx@github.com/${repo}.git into ${path}`
    );
    const result = git.cwd(path).then(_ => git.pull());
    console.info("Updated");
    return result;
  }
};

exports.isClean = async function(dir) {
  let status = await git.cwd(dir).then(_ => git.status());
  return status.isClean();
};

exports.commitAndPush = async function(dir, files, email, user, branch, msg) {
  await git
    .cwd(dir)
    .then(_ => git.addConfig("user.email", email))
    .then(_ => git.addConfig("user.name", user));

  return git
    .cwd(dir)
    .then(_ => git.add(files))
    .then(_ => git.commit(msg))
    .then(_ => git.push("origin", branch));
};
