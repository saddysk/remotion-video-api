require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const supabase = require("./config/supabase.config");
const handleVideoGeneration = require("./src/videoGeneration");

// Kubernetes/container specific configurations
const SHUTDOWN_GRACE_PERIOD = 30000; // 30 seconds for graceful shutdown
const RENDER_CONCURRENCY = parseInt(process.env.RENDER_CONCURRENCY || "2"); // How many videos to render simultaneously
const HEALTH_PROBE_INTERVAL = 10000; // Health check interval

// Create output directory if it doesn't exist
const outputDir = path.resolve(__dirname, "./out");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use("/videos", express.static(outputDir));
app.use("/public", express.static(path.join(__dirname, "./public")));

// Max retry count for rendering operations
const MAX_RETRIES = 3;

// Job queue for handling concurrent renders
class RenderQueue {
  constructor(concurrency = 2) {
    this.queue = [];
    this.concurrency = concurrency;
    this.running = 0;
    this.lastHealthCheck = Date.now();
    this.healthy = true;
  }

  add(id, data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, data, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    this.running++;

    try {
      await handleVideoGeneration(job.id, job.data, outputDir);
      job.resolve();
    } catch (error) {
      job.reject(error);
    } finally {
      this.running--;
      // Check for more jobs
      this.process();
    }
  }

  checkHealth() {
    // Check if queue is processing jobs within expected timeframes
    const now = Date.now();
    if (this.running > 0 && now - this.lastHealthCheck > 300000) {
      // 5 minutes
      console.warn(
        "Health check: Queue items have been processing for over 5 minutes"
      );
      this.healthy = false;
    } else {
      this.lastHealthCheck = now;
      this.healthy = true;
    }
    return this.healthy;
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      runningJobs: this.running,
      isHealthy: this.healthy,
    };
  }
}

// Initialize render queue
const renderQueue = new RenderQueue(RENDER_CONCURRENCY);

/**
 * Setup Supabase real-time subscription
 */
async function setupRealTimeSubscription() {
  console.log("Setting up Supabase real-time subscription...");

  // Subscribe to all inserts on the generated_videos table
  const subscription = supabase
    .channel("table-db-changes")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "generated_videos",
      },
      (payload) => {
        console.log("New video generation request received:", payload.new.id);
        // Add to queue instead of processing immediately
        renderQueue
          .add(payload.new.id, payload.new)
          .catch((error) =>
            console.error(
              `Queue processing error for ${payload.new.id}:`,
              error
            )
          );
      }
    )
    .subscribe();

  // .on(
  //   "postgres_changes",
  //   {
  //     event: "UPDATE",
  //     schema: "public",
  //     table: "generated_videos",
  //     filter: "remotion_video=is.null,status=eq.pending",
  //   },
  //   (payload) => {
  //     // Only process updates where remotion_video is null and status is pending
  //     if (!payload.new.remotion_video && payload.new.status === "pending") {
  //       console.log("Video update request received:", payload.new.id);
  //       renderQueue
  //         .add(payload.new.id, payload.new)
  //         .catch((error) =>
  //           console.error(
  //             `Queue processing error for ${payload.new.id}:`,
  //             error
  //           )
  //         );
  //     }
  //   }
  // )

  console.log("Subscription established, waiting for events...");

  return subscription;
}

// Add health check endpoint for Kubernetes probes
app.get("/health", (req, res) => {
  const queueStatus = renderQueue.getStatus();
  const isHealthy = renderQueue.checkHealth();

  if (isHealthy) {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      queue: queueStatus,
    });
  } else {
    res.status(503).json({
      status: "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      queue: queueStatus,
      message: "Render queue processing is delayed",
    });
  }
});

// Add a metrics endpoint for monitoring
app.get("/metrics", (req, res) => {
  const queueStatus = renderQueue.getStatus();

  res.status(200).json({
    queue_length: queueStatus.queueLength,
    active_jobs: queueStatus.runningJobs,
    uptime_seconds: process.uptime(),
    memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    total_memory_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
  });
});

// TODO: [IN CASE REQUIRED] Add a manual trigger endpoint for testing
// app.post("/trigger-video-generation", async (req, res) => {
//   try {
//     const { id } = req.body;

//     if (!id) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required parameter: id",
//       });
//     }

//     // Fetch the record from Supabase
//     const { data, error } = await supabase
//       .from("generated_videos")
//       .select("*")
//       .eq("id", id)
//       .single();

//     if (error) {
//       return res.status(404).json({
//         success: false,
//         message: "Record not found",
//         error: error.message,
//       });
//     }

//     // Update status to pending
//     await supabase
//       .from("generated_videos")
//       .update({ status: "pending" })
//       .eq("id", id);

//     // Add to the render queue
//     renderQueue
//       .add(id, data)
//       .then(() => {
//         console.log(
//           `Manually triggered video generation for ID: ${id} completed`
//         );
//       })
//       .catch((error) => {
//         console.error(
//           `Manually triggered video generation for ID: ${id} failed:`,
//           error
//         );
//       });

//     res.json({
//       success: true,
//       message: "Video generation process added to queue",
//       id,
//       queueStatus: renderQueue.getStatus(),
//     });
//   } catch (error) {
//     console.error("Error triggering video generation:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to trigger video generation",
//       error: error.message,
//     });
//   }
// });

// Start the server and setup Supabase subscription
const server = app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);

  try {
    // Initialize Supabase real-time subscription
    const subscription = await setupRealTimeSubscription();

    // Setup periodic health checks
    const healthInterval = setInterval(() => {
      renderQueue.checkHealth();
    }, HEALTH_PROBE_INTERVAL);

    // Handle graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("SIGTERM received, starting graceful shutdown...");
      clearInterval(healthInterval);

      // Give time for current jobs to complete
      const queueStatus = renderQueue.getStatus();
      if (queueStatus.runningJobs > 0) {
        console.log(
          `Waiting for ${queueStatus.runningJobs} active jobs to complete...`
        );

        // Wait for grace period before forcing shutdown
        setTimeout(() => {
          console.log("Shutdown grace period expired, forcing exit");
          process.exit(0);
        }, SHUTDOWN_GRACE_PERIOD);
      } else {
        console.log("No active jobs, shutting down immediately");
        await subscription.unsubscribe();
        server.close(() => {
          console.log("Server closed");
          process.exit(0);
        });
      }
    });

    console.log("Service started successfully!");
  } catch (error) {
    console.error("Failed to start Supabase subscription:", error);
    console.log(
      "Server is running but Supabase subscription failed to initialize."
    );
  }
});
