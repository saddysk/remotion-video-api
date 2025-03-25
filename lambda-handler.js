const videoGeneration = require("./src/videoGeneration");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Create a temporary output directory
const outputDir = path.resolve(os.tmpdir(), "output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Lambda handler function
 * @param {Object} event - Lambda event
 * @param {Object} context - Lambda context
 */
exports.handler = async (event, context) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  try {
    // Check for direct invocation from API Gateway
    if (event.httpMethod) {
      return handleHttpRequest(event);
    }

    // Process Supabase webhook payload (if enabled)
    if (event.type === "INSERT" && event.table === "generated_videos") {
      const { id, ...data } = event.record;
      await videoGeneration(id, data, outputDir);
      return { statusCode: 200, body: JSON.stringify({ success: true, id }) };
    }

    // Standard payload for direct Lambda invocation
    if (event.id && event.data) {
      await videoGeneration(event.id, event.data, outputDir);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, id: event.id }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request format" }),
    };
  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * Handles HTTP requests from API Gateway
 */
async function handleHttpRequest(event) {
  const path = event.path;
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  // Basic routing logic
  if (path === "/status" && method === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      }),
    };
  }

  if (path === "/metrics" && method === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        uptime_seconds: process.uptime(),
        memory_usage_mb: Math.round(
          process.memoryUsage().heapUsed / 1024 / 1024
        ),
        total_memory_mb: Math.round(
          process.memoryUsage().heapTotal / 1024 / 1024
        ),
      }),
    };
  }

  if (path === "/trigger-video-generation" && method === "POST") {
    const { id } = body;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Missing required parameter: id",
        }),
      };
    }

    // Import supabase here to avoid loading it for every request
    const supabase = require("./config/supabase.config");

    // Fetch the record from Supabase
    const { data, error } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "Record not found",
          error: error.message,
        }),
      };
    }

    // Invoke a new Lambda function to handle this task
    const AWS = require("aws-sdk");
    const lambda = new AWS.Lambda();

    await lambda
      .invoke({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvocationType: "Event", // Asynchronous invocation
        Payload: JSON.stringify({ id, data }),
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Video generation process started",
        id,
      }),
    };
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: "Not found" }),
  };
}
