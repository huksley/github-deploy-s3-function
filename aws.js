const AWS = require("aws-sdk");
const s3 = new AWS.S3({ region: process.env.AWS_REGION || "eu-west-1" });
const cloudfront = new AWS.CloudFront();
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");

function makeFileDatas(s3Contents) {
  return s3Contents.map(content => ({
    key: content.Key,
    lastModified: content.LastModified,
    etag: content.ETag,
    size: content.Size
  }));
}

exports.listBucketObjects = async function(bucket) {
  let params = {
    Bucket: bucket
  };

  let objects = await s3.listObjectsV2(params).promise();
  let results = makeFileDatas(objects.Contents);
  while (objects.IsTruncated) {
    objects = await s3.listObjectsV2(params).promise();
    results = results.concat(makeFileDatas(objects.Contents));
  }

  return results;
};

exports.uploadToS3 = async function(bucket, dir, prefix, keys) {
  let upload = async function(key) {
    return new Promise(resolve => {
      if (fs.existsSync(dir + "/" + (prefix ? prefix + "/" : "") + key)) {
        return fs.readFile(
          path.join(dir, prefix ? prefix : "", key),
          (err, filedata) => {
            console.info(
              "Uploading " +
                dir +
                "/" +
                (prefix ? prefix + "/" : "") +
                key +
                " " +
                (filedata ? filedata.length : 0) +
                " to " +
                bucket
            );
            resolve(
              s3
                .putObject({
                  Bucket: bucket,
                  Key: key,
                  Body: filedata,
                  ContentType: mime.lookup(key) || "application/octet-stream",
                  ACL: process.env.AWS_S3_ACL || "public-read"
                })
                .promise()
                .then(r => 1)
            );
          }
        );
      } else {
        console.info(
          "File not found " + dir + "/" + (prefix ? prefix + "/" : "") + key
        );
        return Promise.resolve(0);
      }
    });
  };

  let promises = keys.map(key => {
    return upload(key);
  });

  return Promise.all(promises).then(r => r.length);
};

exports.deleteFromS3 = async function(bucket, keys) {
  if (keys.length == 0) {
    return;
  }
  let deleteKeys = keys.map(key => ({ Key: key }));
  console.info("Deleting " + JSON.stringify(keys) + " from " + bucket);
  let params = {
    Bucket: bucket,
    Delete: {
      Objects: deleteKeys
    }
  };
  return s3
    .deleteObjects(params)
    .promise()
    .then(r => (r.Deleted ? r.Deleted.length : 0));
};

exports.resetCloudfrontCache = async function(distributionId) {
  var params = {
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: Date.now().toString(),
      Paths: {
        Quantity: 1,
        Items: ["/*"]
      }
    }
  };
  console.info("Resetting cloudfront cache", params);
  return cloudfront.createInvalidation(params).promise();
};
