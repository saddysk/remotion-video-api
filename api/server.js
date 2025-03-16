const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const { bundle } = require("@remotion/bundler");
const { getCompositions, renderMedia } = require("@remotion/renderer");
const generateDynamicVideo = require("../src/generateDynamicVideo");

// Create output directory if it doesn't exist
const outputDir = path.resolve(__dirname, "../out");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use("/videos", express.static(outputDir));
app.use("/public", express.static(path.join(__dirname, "../public")));

// Test endpoint to verify props are being received correctly
app.post("/test-props", (req, res) => {
  console.log("Test endpoint received:", req.body);
  res.json({
    received: req.body,
    message: "Props received successfully",
  });
});

app.post("/render-video", async (req, res) => {
  try {
    // Log the raw request body first
    console.log("Raw request body:", JSON.stringify(req.body));

    // Extract props with defaults
    const durationInSeconds = req.body.durationInSeconds || 10;
    const audioOffsetInSeconds = req.body.audioOffsetInSeconds || 6.9;
    const audioFile = req.body.audioFile || "/audio.mp3";
    const coverImage = req.body.coverImage || "/cover.jpg";
    const videoSource = req.body.videoSource;
    const titleText = req.body.titleText || "Default Title";
    const textPosition = req.body.textPosition || "bottom";
    const enableAudio = req.body.enableAudio || false;

    // Log explicit values for debugging
    console.log("Extracted titleText:", titleText);
    console.log("Extracted textPosition:", textPosition);
    console.log("Enable additional audio:", enableAudio);

    // Ensure paths are consistent
    const formattedAudioFile = audioFile.replace(/^\/public\//, "/");
    const formattedCoverImage = coverImage.replace(/^\/public\//, "/");
    const formattedVideoSource = videoSource?.replace(/^\/public\//, "/");

    // Log which audio source will be used
    console.log(
      formattedVideoSource
        ? "Using video's original audio"
        : "Using external audio file"
    );

    // Generate a dynamic video component with the specified values
    console.log("Generating dynamic component with title:", titleText);
    const { indexPath, componentName } = generateDynamicVideo({
      titleText,
      textPosition,
      videoSource: formattedVideoSource,
      enableAudio,
    });

    console.log("Generated dynamic component:", componentName);
    console.log("Dynamic index path:", indexPath);

    // Generate a unique filename
    const outputFilename = `video-${Date.now()}.mp4`;
    const outputPath = path.resolve(outputDir, outputFilename);

    // Bundle the dynamic Remotion project
    console.log("Bundling dynamic component...");
    const bundled = await bundle(indexPath);

    // Get the compositions
    const compositions = await getCompositions(bundled);
    const composition = compositions.find((c) => c.id === componentName);

    if (!composition) {
      throw new Error(`Composition '${componentName}' not found`);
    }

    // Calculate frames based on duration
    const durationInFrames = Math.floor(durationInSeconds * composition.fps);

    // Create an explicit inputProps object
    const inputProps = {
      durationInSeconds,
      audioOffsetInSeconds,
      audioFile: formattedAudioFile,
      coverImage: formattedCoverImage,
    };

    // Add a delay to make sure files are written completely
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Log final props being passed to renderer
    console.log("Final inputProps:", JSON.stringify(inputProps));

    // Render the video
    console.log("Starting render...");
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      durationInFrames,
      onProgress: (progress) => {
        console.log(
          `Rendering progress: ${Math.floor(progress.progress * 100)}%`
        );
      },
      assetsInfo: {
        root: path.resolve(__dirname, ".."),
        publicPath: "/public",
      },
    });

    // Clean up the generated files
    try {
      fs.unlinkSync(indexPath);
      fs.unlinkSync(indexPath.replace("-index.jsx", ".jsx"));
      console.log("Cleaned up temporary files");
    } catch (err) {
      console.warn("Failed to clean up temporary files:", err);
    }

    // Return the URL to download the video
    const videoUrl = `/videos/${outputFilename}`;

    res.json({
      success: true,
      message: "Video rendered successfully",
      videoUrl,
      usedValues: {
        titleText,
        textPosition,
      },
    });
  } catch (error) {
    console.error("Error rendering video:", error);
    res.status(500).json({
      success: false,
      message: "Failed to render video",
      error: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Videos will be available at http://localhost:${port}/videos/`);
});
