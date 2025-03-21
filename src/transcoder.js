const fs = require("fs");
const path = require("path");
const axios = require("axios");
const util = require("util");
const { exec } = require("child_process");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
const {
  s3,
  lambda,
  BUCKET_NAME,
  INPUT_PREFIX,
  OUTPUT_PREFIX,
} = require("../config/aws.config");

// Set ffmpeg path for local operations
ffmpeg.setFfmpegPath(ffmpegPath);
const execPromise = util.promisify(exec);

/**
 * Ensures video is using a compatible codec (H.264) for Remotion
 * @param {string} videoUrl URL of the video to check/transcode
 * @param {string} outputDir Directory to save transcoded file
 * @param {string} id Unique identifier for the file
 * @returns {Promise<string>} Path to the compatible video file
 */
async function ensureCompatibleCodec(videoUrl, outputDir, id) {
  if (!videoUrl) return null;

  console.log(`Checking codec compatibility for: ${videoUrl}`);

  try {
    // Try to detect source video codec using ffprobe
    let needsTranscode = false;

    try {
      const ffprobeCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoUrl}"`;
      const { stdout } = await execPromise(ffprobeCommand);

      const detectedCodec = stdout.trim().toLowerCase();
      console.log(`Detected source codec: ${detectedCodec}`);

      // Check if transcoding is needed
      if (detectedCodec === "hevc" || detectedCodec === "h265") {
        needsTranscode = true;
        console.log("HEVC/H.265 codec detected, transcoding required");
      }
    } catch (err) {
      console.warn(
        "Could not detect video codec, will transcode to be safe:",
        err.message
      );
      needsTranscode = true;
    }

    // If transcoding is not needed, return original URL
    if (!needsTranscode) {
      console.log("Video already uses compatible codec, no transcoding needed");
      return videoUrl;
    }

    // FOR LOCAL TESTING ONLY: Uncomment the line below to transcode locally
    // return transcodeLocally(videoUrl, path.dirname(videoUrl) || ".", id);

    return await transcodeWithLambda(videoUrl, id);
  } catch (error) {
    console.error("Error in codec compatibility check:", error);
    return videoUrl; // Fall back to original URL if anything fails
  }
}

/**
 * Transcodes a video using AWS Lambda
 * @param {string} videoUrl URL of the video to transcode
 * @param {string} id Unique identifier for the file
 * @returns {Promise<string>} URL of the transcoded video
 */
async function transcodeWithLambda(videoUrl, id) {
  console.log(`Transcoding with Lambda: ${videoUrl}`);

  try {
    // 1. Download the video if it's a remote URL
    let videoData;
    if (videoUrl.startsWith("http")) {
      console.log("Downloading video from URL...");
      const response = await axios.get(videoUrl, {
        responseType: "arraybuffer",
      });
      videoData = response.data;
    } else {
      // If it's a local file
      console.log("Reading video from local path...");
      videoData = fs.readFileSync(videoUrl);
    }

    // 2. Upload to S3 input bucket
    // Determine file extension and content type from the original URL
    const fileExtension = getFileExtension(videoUrl);
    const contentType = getContentTypeFromExtension(fileExtension);

    const inputKey = `${INPUT_PREFIX}${id}-${Date.now()}.${fileExtension}`;
    console.log(
      `Uploading to S3: ${inputKey} with content type: ${contentType}`
    );

    await s3
      .putObject({
        Bucket: BUCKET_NAME,
        Key: inputKey,
        Body: videoData,
        ContentType: contentType,
      })
      .promise();

    // 3. Invoke Lambda function
    console.log("Invoking Lambda transcoder function...");
    const outputKey = `${OUTPUT_PREFIX}${id}-${Date.now()}.mp4`;
    const lambdaParams = {
      FunctionName: "video-transcoder",
      InvocationType: "RequestResponse", // Use 'Event' for async invocation
      Payload: JSON.stringify({
        input: {
          bucket: BUCKET_NAME,
          key: inputKey,
        },
        output: {
          bucket: BUCKET_NAME,
          key: outputKey,
          contentType: "video/mp4", // Output is always MP4
        },
        options: {
          preset: "fast",
          crf: 23,
        },
      }),
    };

    const lambdaResponse = await lambda.invoke(lambdaParams).promise();
    const result = JSON.parse(lambdaResponse.Payload);

    if (result.error) {
      throw new Error(`Lambda transcoding failed: ${result.error}`);
    }

    // 4. Get the URL of the transcoded video
    const outputUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${
      result.outputKey || outputKey
    }`;
    console.log(`Transcoding completed successfully: ${outputUrl}`);

    return outputUrl;
  } catch (error) {
    console.error("Lambda transcoding error:", error);
    throw new Error("Lambda transcoding failed");
  }
}

/**
 * Fallback: Transcodes a video locally (only used if Lambda fails)
 * @param {string} videoUrl URL of the video to transcode
 * @param {string} outputDir Directory to save transcoded file
 * @param {string} id Unique identifier for the file
 * @returns {Promise<string>} Path to the transcoded video
 */
async function transcodeLocally(videoUrl, outputDir, id) {
  const tempFile = path.join(outputDir, `temp-h264-${id}-${Date.now()}.mp4`);
  console.log(`Fallback: Transcoding locally to H.264: ${tempFile}`);

  return new Promise((resolve, reject) => {
    ffmpeg(videoUrl)
      .outputOptions([
        "-c:v libx264", // Use H.264 codec
        "-crf 23", // Reasonable quality
        "-preset fast", // Fast encoding speed
        "-c:a aac", // AAC audio codec
        "-strict experimental",
      ])
      .output(tempFile)
      .on("progress", (progress) => {
        // Progress handling if needed
      })
      .on("end", () => {
        console.log("Local transcoding completed successfully");
        resolve(tempFile);
      })
      .on("error", (err) => {
        console.error("Local transcoding error:", err);
        reject(err);
      })
      .run();
  });
}

/**
 * Gets the file extension from a URL or file path
 * @param {string} filePathOrUrl URL or file path
 * @returns {string} File extension without the dot
 */
function getFileExtension(filePathOrUrl) {
  if (!filePathOrUrl) return "mp4"; // Default fallback

  // Extract the filename from the URL or path
  const filename = filePathOrUrl.split(/[#?]/)[0].split("/").pop();
  if (!filename || filename.indexOf(".") === -1) return "mp4"; // Default if no extension found

  // Get the extension and remove the dot
  const extension = filename.split(".").pop().toLowerCase();

  // If extension is empty or too long (probably not an extension), return default
  return extension && extension.length < 5 ? extension : "mp4";
}

/**
 * Gets the content type based on file extension
 * @param {string} extension File extension without the dot
 * @returns {string} MIME content type
 */
function getContentTypeFromExtension(extension) {
  const contentTypeMap = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    mkv: "video/x-matroska",
    webm: "video/webm",
    "3gp": "video/3gpp",
    m4v: "video/x-m4v",
    ts: "video/mp2t",
    mts: "video/avchd",
    mpg: "video/mpeg",
    mpeg: "video/mpeg",
  };

  return contentTypeMap[extension] || "video/mp4"; // Default to video/mp4 if not found
}

module.exports = {
  ensureCompatibleCodec,
};
