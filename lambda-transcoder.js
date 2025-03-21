// Lambda function for video transcoding using ES modules
import { S3 } from "@aws-sdk/client-s3";
import { spawn } from "child_process";
import fs from "fs";

// Initialize S3 client
const s3 = new S3({ region: "us-east-1" });

export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event));

  // Extract parameters
  const { input, output, options } = event;

  // Configure paths
  const inputPath = `/tmp/input-${Date.now()}.mp4`;
  const outputPath = `/tmp/output-${Date.now()}.mp4`;

  try {
    // Download video from S3
    console.log(`Downloading from s3://${input.bucket}/${input.key}`);
    const s3Object = await s3.getObject({
      Bucket: input.bucket,
      Key: input.key,
    });

    // Write to temp file (S3 object Body is now a readable stream in v3)
    if (s3Object.Body) {
      const responseBuffer = await s3Object.Body.transformToByteArray();
      fs.writeFileSync(inputPath, Buffer.from(responseBuffer));
      console.log(`Video saved to ${inputPath}`);
    } else {
      throw new Error("S3 response body is empty");
    }

    // Perform transcoding
    await transcode(inputPath, outputPath, options);
    console.log("Transcoding completed");

    // Upload to S3
    console.log(`Uploading to s3://${output.bucket}/${output.key}`);
    await s3.putObject({
      Bucket: output.bucket,
      Key: output.key,
      Body: fs.readFileSync(outputPath),
      ContentType: "video/mp4",
    });

    // Clean up
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    return {
      statusCode: 200,
      outputKey: output.key,
      message: "Transcoding completed successfully",
    };
  } catch (error) {
    console.error("Error during transcoding:", error);

    // Clean up if files exist
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (e) {
      console.error("Error during cleanup:", e);
    }

    return {
      statusCode: 500,
      error: error.message || "Unknown error during transcoding",
    };
  }
};

/**
 * Transcode video using ffmpeg
 */
function transcode(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const preset = options.preset || "fast";
    const crf = options.crf || 23;

    const args = [
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf.toString(),
      "-c:a",
      "aac",
      "-strict",
      "experimental",
      "-f",
      "mp4",
      outputPath,
    ];

    console.log("ffmpeg args:", args.join(" "));

    const ffmpeg = spawn("ffmpeg", args);

    // Log output for debugging
    ffmpeg.stdout.on("data", (data) => {
      console.log(`ffmpeg stdout: ${data}`);
    });

    ffmpeg.stderr.on("data", (data) => {
      console.log(`ffmpeg stderr: ${data}`);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        console.log("Transcoding process completed successfully");
        resolve();
      } else {
        reject(new Error(`ffmpeg process exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`Failed to start ffmpeg process: ${err.message}`));
    });
  });
}
