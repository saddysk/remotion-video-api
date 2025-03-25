const AWS = require("aws-sdk");

// Initialize AWS SDK
AWS.config.update({ region: "us-east-1" });

const s3 = new AWS.S3({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const lambda = new AWS.Lambda();

module.exports = {
  s3,
  lambda,
  BUCKET_NAME:
    process.env.AWS_S3_BUCKET_NAME || "video-transcoding-microservice",
  INPUT_PREFIX: "input/",
  OUTPUT_PREFIX: "output/",
};
