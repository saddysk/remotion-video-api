const fs = require("fs");
const path = require("path");
const { bundle } = require("@remotion/bundler");
const { getCompositions, renderMedia } = require("@remotion/renderer");
const generateDynamicVideo = require("./generateDynamicVideo");
const { uploadToSupabase } = require("../libs/supabase/storage");
const supabase = require("../config/supabase.config");

/**
 * Main function to handle video generation triggered by Supabase
 * @param {string} id The ID of the generated_videos record
 * @param {Object} data The data from the generated_videos record
 * @param {number} retryCount Current retry count (default 0)
 */
async function handleVideoGeneration(id, data, outputDir, retryCount = 0) {
  console.log(`Processing video generation for ID: ${id}`);
  console.log(`Data received:`, JSON.stringify(data));

  try {
    // Extract properties from data and remotion JSONB field
    const remotionData = data.remotion || {};

    // Map fields based on provided mapping
    const durationInSeconds = remotionData.duration || 10;
    const audioOffsetInSeconds = remotionData.audio_offset || 0;
    const titleText = remotionData.caption || "Default Title";
    const textPosition = data.text_alignment || "bottom";
    const videoSource = remotionData.template || null;
    const demoVideoSource = remotionData.demo || null;
    const audioSource = remotionData.sound || null;
    const enableAudio = audioSource !== null;
    const splitScreen = demoVideoSource !== null;
    const splitPosition = "left-right";
    // const splitPosition = data.video_alignment || "left-right";

    // Validate splitPosition value if splitScreen is enabled
    const validSplitPositions = [
      "left-right",
      "right-left",
      "top-bottom",
      "bottom-top",
    ];

    if (splitScreen && !validSplitPositions.includes(splitPosition)) {
      throw new Error(
        "Invalid splitPosition value. Must be one of: left-right, right-left, top-bottom, bottom-top"
      );
    }

    // Update Supabase with status
    await supabase
      .from("generated_videos")
      .update({ status: "processing" })
      .eq("id", id);

    // Log parameters for debugging
    console.log("\nParameters for video generation:");
    console.log("Title Text:", titleText);
    console.log("Duration (seconds):", durationInSeconds);
    console.log("Text Position:", textPosition);
    console.log("Enable Audio:", enableAudio);
    console.log("Split Screen:", splitScreen);
    console.log("Split Position:", splitPosition);
    console.log("Video Source URL:", videoSource);
    console.log("Demo Video Source URL:", demoVideoSource);
    console.log("Audio Source URL:", audioSource);
    console.log("Audio Offset (seconds):", audioOffsetInSeconds);

    // Generate a dynamic video component with the specified values
    console.log("\nGenerating dynamic component with title:", titleText);
    const { indexPath, componentName } = generateDynamicVideo({
      titleText,
      durationInSeconds,
      audioOffsetInSeconds,
      textPosition,
      videoSource,
      audioSource,
      enableAudio,
      splitScreen,
      demoVideoSource,
      splitPosition,
    });

    console.log("Generated dynamic component:", componentName);
    console.log("Dynamic index path:", indexPath);

    // Generate a unique filename
    const outputFilename = `video-${id}-${Date.now()}.mp4`;
    const outputPath = path.resolve(outputDir, outputFilename);

    // Bundle the dynamic Remotion project
    console.log("Bundling dynamic component...\n");
    const bundled = await bundle(indexPath);

    // Get the compositions
    const compositions = await getCompositions(bundled);
    const composition = compositions.find((c) => c.id === componentName);

    if (!composition) {
      throw new Error(`Composition '${componentName}' not found`);
    }

    // Calculate frames based on duration
    const durationInFrames = Math.floor(durationInSeconds * composition.fps);

    // Render the video
    console.log("Starting render...");
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      durationInFrames,
      timeoutInMilliseconds: 420000, // 7 minutes overall timeout
      delayRenderTimeoutInMilliseconds: 300000, // 5 minutes for delayRender timeouts

      onProgress: (progress) => {
        // // Use process.stdout.write with \r to update the same line
        // process.stdout.write(
        //   `\rRendering progress: ${Math.floor(progress.progress * 100)}%`
        // );

        // Add a newline when rendering is complete
        if (progress.progress === 1) {
          process.stdout.write("\n");
        }
      },
    });

    // Clean up the generated component files
    try {
      fs.unlinkSync(indexPath);
      fs.unlinkSync(indexPath.replace("-index.jsx", ".jsx"));
      console.log("Cleaned up temporary component files");
    } catch (err) {
      console.warn("Failed to clean up temporary component files:", err);
    }

    console.log("Video rendered successfully. Uploading to Supabase...");

    // Upload the rendered video to Supabase storage
    const supabaseUrl = await uploadToSupabase(outputPath, outputFilename);
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

    // Clean up the local video file
    try {
      fs.unlinkSync(outputPath);
      console.log("Deleted local video file");
    } catch (err) {
      console.warn("Failed to delete local video file:", err);
    }

    console.log("Video generation and upload completed successfully!");
    console.log(
      "\n-------------------------------------------\n-------------------------------------------\n"
    );
  } catch (error) {
    console.error("Error in video generation:", error);

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`Retry attempt ${retryCount + 1} of ${MAX_RETRIES}...`);
      return handleVideoGeneration(id, data, retryCount + 1);
    } else {
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
}

module.exports = handleVideoGeneration;
