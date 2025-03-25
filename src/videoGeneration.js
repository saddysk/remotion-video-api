const fs = require("fs");
const path = require("path");
const { bundle } = require("@remotion/bundler");
const { getCompositions, renderMedia } = require("@remotion/renderer");
const generateDynamicVideo = require("./generateDynamicVideo");
const { uploadToSupabase } = require("../libs/supabase/storage");
const supabase = require("../config/supabase.config");
const getVideoDuration = require("../libs/utils");
const { ensureCompatibleCodec } = require("./transcoder");
const { s3, BUCKET_NAME } = require("../config/aws.config");
const os = require("os");

// Modify the tempLocalFiles cleanup to ensure proper /tmp usage
// Instead of using the outputDir directly, use a subdirectory in /tmp
const getTempDir = () => {
  const dir = path.join(os.tmpdir(), `remotion-${Date.now()}`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

/**
 * Main function to handle video generation triggered by Supabase
 * @param {string} id The ID of the generated_videos record
 * @param {Object} data The data from the generated_videos record
 * @param {string} outputDir Directory to save output files
 */
async function videoGeneration(id, data, outputDir) {
  console.log(`Processing video generation for ID: ${id}`);

  // Track S3 keys to clean up later
  const s3FilesToCleanup = [];

  // Track temporary local files to clean up
  const tempLocalFiles = [];

  try {
    // Extract properties from data and remotion JSONB field
    const remotionData = data.remotion || {};

    // Map fields based on provided mapping
    const audioOffsetInSeconds = remotionData.audio_offset || 0;
    const titleText = remotionData.caption || "Default Title";
    const textPosition = data.text_alignment || "bottom";
    const videoSource = remotionData.template || null;
    const demoVideoSource = remotionData.demo || null;
    const audioSource = remotionData.sound || null;
    const enableAudio = audioSource !== null;
    const sequentialMode = data.video_alignment === "serial";
    const splitScreen = !sequentialMode && demoVideoSource !== null;

    let splitPosition = null;
    if (splitScreen) {
      if (data.video_alignment === "side") {
        splitPosition = "right-left";
      } else if (data.video_alignment === "top") {
        splitPosition = "bottom-top";
      }
    }

    // Default fallback durations in case we can't determine real durations
    let firstVideoDuration = 6; // Default fallback
    let durationInSeconds = 30; // Default fallback

    // Update Supabase with status
    await supabase
      .from("generated_videos")
      .update({ status: "processing" })
      .eq("id", id);

    // Validate splitPosition value if splitScreen is enabled and not in sequential mode
    const validSplitPositions = [
      "left-right",
      "right-left",
      "top-bottom",
      "bottom-top",
    ];

    if (
      splitScreen &&
      !sequentialMode &&
      !validSplitPositions.includes(splitPosition)
    ) {
      throw new Error(
        "Invalid splitPosition value. Must be one of: left-right, right-left, top-bottom, bottom-top"
      );
    }
    // // Log parameters for debugging
    // console.log("\nParameters for video generation:");
    // console.log("Title Text:", titleText);
    // console.log("Duration (seconds):", durationInSeconds);
    // console.log("Text Position:", textPosition);
    // console.log("Enable Audio:", enableAudio);
    // console.log("Split Screen:", splitScreen);
    // console.log("Sequential Mode:", sequentialMode);
    // console.log("First Video Duration:", firstVideoDuration);
    // console.log("Split Position:", splitPosition);
    // console.log("Video Source URL:", videoSource);
    // console.log("Demo Video Source URL:", demoVideoSource);
    // console.log("Audio Source URL:", audioSource);
    // console.log("Audio Offset (seconds):", audioOffsetInSeconds);

    // Process video sources to ensure codec compatibility
    console.log("\nEnsuring video codec compatibility...");

    // Process main video
    const processedVideoSource = await ensureCompatibleCodec(
      videoSource,
      `${id}-main`
    );

    // If we got back an S3 URL, add it to cleanup list
    if (processedVideoSource !== videoSource && processedVideoSource !== null) {
      console.log(`Template video transcoded to: ${processedVideoSource}`);
      if (processedVideoSource.includes(BUCKET_NAME)) {
        // Extract the S3 key from the URL
        const s3Key = processedVideoSource.split(
          `${BUCKET_NAME}.s3.amazonaws.com/`
        )[1];
        if (s3Key) {
          s3FilesToCleanup.push(s3Key);
        }
      }
    }

    // Process demo video if needed
    let processedDemoSource = null;
    if ((splitScreen || sequentialMode) && demoVideoSource) {
      processedDemoSource = await ensureCompatibleCodec(
        demoVideoSource,
        `${id}-demo`
      );

      // If we got back an S3 URL, add it to cleanup list
      if (
        processedDemoSource !== demoVideoSource &&
        processedDemoSource !== null
      ) {
        console.log(`Demo video transcoded to: ${processedDemoSource}`);
        if (processedDemoSource.includes(BUCKET_NAME)) {
          // Extract the S3 key from the URL
          const s3Key = processedDemoSource.split(
            `${BUCKET_NAME}.s3.amazonaws.com/`
          )[1];
          if (s3Key) {
            s3FilesToCleanup.push(s3Key);
          }
        }
      }
    }

    // Determine video durations
    console.log("\nDetecting video durations...");
    const mainVideoUrl = processedVideoSource || videoSource;
    const demoVideoUrl = processedDemoSource || demoVideoSource;

    const mainVideoDuration = await getVideoDuration(mainVideoUrl);
    const demoVideoDuration = await getVideoDuration(demoVideoUrl);

    console.log(
      `Template video: ${mainVideoDuration || "unknown"} secs, Demo video: ${
        demoVideoDuration || "unknown"
      } secs`
    );

    // Apply the dynamic duration logic based on the requirements
    if (mainVideoDuration !== null) {
      // Case 4: If no demo video, use template video duration
      if (demoVideoSource === null) {
        durationInSeconds = mainVideoDuration;
      }

      // Case 3: In sequential mode, firstVideoDuration = template video duration
      if (sequentialMode) {
        firstVideoDuration = mainVideoDuration;
      }
    }

    if (demoVideoDuration !== null) {
      // Case 1: If splitPosition is not null, use demo video duration
      if (splitPosition !== null) {
        durationInSeconds = demoVideoDuration;
      }

      // Case 2: In sequential mode, use sum of both video durations
      if (sequentialMode && mainVideoDuration !== null) {
        durationInSeconds = mainVideoDuration + demoVideoDuration;
      }
    }

    // Log the calculated durations
    console.log(
      `[Durations] Template: ${firstVideoDuration} secs, Demo: ${durationInSeconds} secs`
    );

    // Generate a dynamic video component with the specified values
    console.log("\nGenerating dynamic component with title:", titleText);
    const { indexPath, componentName } = generateDynamicVideo({
      titleText,
      durationInSeconds,
      audioOffsetInSeconds,
      textPosition,
      videoSource: mainVideoUrl,
      audioSource,
      enableAudio,
      splitScreen,
      demoVideoSource: demoVideoUrl,
      splitPosition,
      sequentialMode,
      firstVideoDuration,
    });

    // Add temporary component files to cleanup list
    tempLocalFiles.push(indexPath);
    tempLocalFiles.push(indexPath.replace("-index.jsx", ".jsx"));

    console.log("Generated dynamic component:", componentName);
    console.log("Dynamic index path:", indexPath);

    // Generate a unique filename
    const outputFilename = `video-${id}-${Date.now()}.mp4`;
    // const outputPath = path.resolve(outputDir, outputFilename);
    const tempDir = getTempDir();
    const outputPath = path.resolve(tempDir, outputFilename);
    tempLocalFiles.push(tempDir); // We'll recursively delete this late
    // tempLocalFiles.push(outputPath);

    // Make sure the filename has the proper extension for the codec
    let finalOutputFilename = outputFilename;
    if (outputFilename.endsWith(".m4a")) {
      console.log(
        "Warning: Changing output extension from .m4a to .mp4 for compatibility"
      );
      finalOutputFilename = outputFilename.replace(".m4a", ".mp4");
    }

    // Bundle the dynamic Remotion project
    console.log("Bundling dynamic component...\n");
    const bundled = await bundle(indexPath);

    // Get the compositions
    const compositions = await getCompositions(bundled);
    const composition = compositions.find((c) => c.id === componentName);

    if (!composition) {
      throw new Error(`Composition '${componentName}' not found`);
    }

    // Render the video with increased timeout for safety
    console.log(`Starting render video - ${id}...`);
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      timeoutInMilliseconds: 900000, // 15 minutes overall timeout
      onProgress: (progress) => {
        // Use process.stdout.write with \r to update the same line
        const percent = Math.floor(progress.progress * 100);

        // process.stdout.write(
        //   `\rRendering progress: ${percent}%`
        // );

        // Log every 25% for debugging
        if (percent % 25 === 0 && percent > 0 && progress.renderedFrames) {
          process.stdout.write(`\rRendering progress video ${id}: ${percent}%`);
        }
      },
    });

    console.log("\nVideo rendered successfully. Uploading to Supabase...");

    // Upload the rendered video to Supabase storage
    const supabaseUrl = await uploadToSupabase(outputPath, finalOutputFilename);
    console.log("Video uploaded to Supabase:", supabaseUrl);

    // Update the remotion_video field in the database
    const { error: updateError } = await supabase
      .from("generated_videos")
      .update({
        remotion_video: supabaseUrl,
        error: null,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(`Failed to update database: ${updateError.message}`);
    }

    // Clean up all files
    console.log("Cleaning up resources...");

    // 1. Clean up local temporary files
    for (const filePath of tempLocalFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted local file: ${filePath}`);
        }
      } catch (err) {
        console.warn(`Failed to delete local file ${filePath}:`, err);
      }
    }

    // 2. Clean up S3 files from transcoding
    if (s3FilesToCleanup.length > 0) {
      console.log(`Cleaning up ${s3FilesToCleanup.length} files from S3`);

      try {
        const deleteParams = {
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: s3FilesToCleanup.map((key) => ({ Key: key })),
            Quiet: false,
          },
        };

        const deleteResult = await s3.deleteObjects(deleteParams).promise();
        console.log(
          `Successfully deleted ${
            deleteResult.Deleted?.length || 0
          } files from S3`
        );

        if (deleteResult.Errors && deleteResult.Errors.length > 0) {
          console.warn(
            `Failed to delete ${deleteResult.Errors.length} files from S3:`,
            deleteResult.Errors
          );
        }
      } catch (err) {
        console.warn("Error deleting files from S3:", err);
      }
    }

    console.log("Video generation and upload completed successfully!");
    console.log(
      "\n-------------------------------------------\n-------------------------------------------\n"
    );
  } catch (error) {
    console.error("Error in video generation:", error);

    // Clean up any local temporary files if an error occurred
    for (const filePath of tempLocalFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up temporary file: ${filePath}`);
        }
      } catch (err) {
        console.warn(`Error cleaning up temporary file ${filePath}:`, err);
      }
    }

    // Clean up S3 files even on error
    if (s3FilesToCleanup.length > 0) {
      console.log(
        `Cleaning up ${s3FilesToCleanup.length} files from S3 after error`
      );

      try {
        const deleteParams = {
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: s3FilesToCleanup.map((key) => ({ Key: key })),
            Quiet: false,
          },
        };

        await s3.deleteObjects(deleteParams).promise();
      } catch (err) {
        console.warn("Error deleting files from S3 after error:", err);
      }
    }

    // Update the database with the error information
    const { error: updateError } = await supabase
      .from("generated_videos")
      .update({
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        },
        status: "failed",
      })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update error in database:", updateError);
    }
  }
}

module.exports = videoGeneration;
