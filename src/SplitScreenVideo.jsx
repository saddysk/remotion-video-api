import React from "react";
import { AbsoluteFill, staticFile, Video as RemotionVideo } from "remotion";

/**
 * Component for displaying two videos with configurable split layout
 *
 * @param {Object} props Component props
 * @param {string} props.leftVideoSource Path to the first video
 * @param {string} props.demoVideoSource Path to the second video
 * @param {number} props.volume Video volume (0-1)
 * @param {number} props.opacity Video opacity (0-1)
 * @param {string} props.splitPosition Layout of the videos (left-right, right-left, top-bottom, bottom-top)
 */
export const SplitScreenVideo = ({
  leftVideoSource,
  demoVideoSource,
  volume = 1,
  opacity = 0.7,
  splitPosition, // Default to left-right split
}) => {
  // Check if video sources are provided
  const hasFirstVideo = leftVideoSource && typeof leftVideoSource === "string";
  const hasSecondVideo = demoVideoSource && typeof demoVideoSource === "string";

  // Determine flex direction based on split position
  let flexDirection = "row"; // Default for left-right and right-left
  if (splitPosition === "top-bottom" || splitPosition === "bottom-top") {
    flexDirection = "column";
  }

  // Determine video order based on split position
  const reverseOrder =
    splitPosition === "right-left" || splitPosition === "bottom-top";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "black",
        display: "flex",
        flexDirection: flexDirection,
      }}
    >
      {/* First video container */}
      <div
        style={{
          flex: 1,
          position: "relative",
          order: reverseOrder ? 1 : 0,
        }}
      >
        {hasFirstVideo ? (
          <RemotionVideo
            src={
              leftVideoSource.startsWith("/public/")
                ? leftVideoSource
                : staticFile(leftVideoSource)
            }
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: opacity,
            }}
            volume={volume}
          />
        ) : (
          <div
            style={{ width: "100%", height: "100%", backgroundColor: "#333" }}
          />
        )}
      </div>

      {/* Second video container */}
      <div
        style={{
          flex: 1,
          position: "relative",
          order: reverseOrder ? 0 : 1,
        }}
      >
        {hasSecondVideo ? (
          <RemotionVideo
            src={
              demoVideoSource.startsWith("/public/")
                ? demoVideoSource
                : staticFile(demoVideoSource)
            }
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: opacity,
            }}
            volume={volume}
          />
        ) : (
          <div
            style={{ width: "100%", height: "100%", backgroundColor: "#333" }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
