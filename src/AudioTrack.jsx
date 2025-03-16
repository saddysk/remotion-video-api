import React from "react";
import { Audio, staticFile, useVideoConfig } from "remotion";

export const AudioTrack = ({ audioFile, offsetInSeconds }) => {
  const { fps } = useVideoConfig();

  // Convert offset to frames
  const offsetInFrames = Math.round(offsetInSeconds * fps);

  return (
    <Audio
      src={audioFile.startsWith("/public/") ? audioFile : staticFile(audioFile)}
      startFrom={offsetInFrames} // Start audio from specified offset in frames
      volume={0.25} // Volume for external audio - 25%
    />
  );
};
