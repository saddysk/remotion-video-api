const fs = require("fs");
const path = require("path");

/**
 * Generates a dynamic video component with hardcoded values
 * @param {Object} options Options for the video
 * @param {string} options.titleText The title text to display
 * @param {string} options.textPosition The position of the text (top, center, bottom)
 * @param {string} options.videoSource Path to the video source
 * @param {boolean} options.enableAudio Whether to enable additional audio alongside video
 * @returns {string} The path to the generated component
 */
function generateDynamicVideo(options) {
  const { titleText, textPosition, videoSource, enableAudio } = options;

  // Create a unique filename based on timestamp
  const timestamp = Date.now();
  const componentName = `DynamicVideo${timestamp}`;
  const filePath = path.join(__dirname, `${componentName}.jsx`);

  // Generate the component code with hardcoded values
  const componentCode = `
import React from 'react';
import { AbsoluteFill, staticFile, Img, Video as RemotionVideo } from 'remotion';
import { AudioTrack } from './AudioTrack';

// Dynamically generated component
export const ${componentName} = (props) => {
  console.log('Dynamic component rendering with props:', JSON.stringify(props));
  
  const { 
    durationInSeconds = 10,
    audioOffsetInSeconds = 6.9,
    audioFile = '/audio.mp3',
    coverImage = '/cover.jpg',
  } = props || {};
  
  // Hardcoded values from generation
  const videoSource = ${videoSource ? `"${videoSource}"` : "null"};
  const titleText = "${titleText.replace(/"/g, '\\"')}";
  const textPosition = "${textPosition}";
  const enableAudio = ${enableAudio ? "true" : "false"};
  
  // Determine text position style
  const getTextPositionStyle = () => {
    switch(textPosition) {
      case 'top':
        return {
          top: '10%',
          bottom: 'auto'
        };
      case 'center':
        return {
          top: '50%',
          transform: 'translateY(-50%)',
          bottom: 'auto'
        };
      case 'bottom':
      default:
        return {
          bottom: '10%',
          top: 'auto'
        };
    }
  };
  
  // Get position style
  const positionStyle = getTextPositionStyle();
  
  // Determine whether to show video or image
  const useVideo = videoSource && typeof videoSource === 'string';

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Video or Image Background */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {useVideo ? (
          <RemotionVideo
            src={videoSource.startsWith('/public/') ? videoSource : staticFile(videoSource)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
          />
        ) : (
          <Img
            src={coverImage.startsWith('/public/') ? coverImage : staticFile(coverImage)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
          />
        )}
        
        {/* Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
        />
        
        {/* Title with dynamic position */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            textAlign: 'center',
            padding: '0 20px',
            ...positionStyle
          }}
        >
          <h1
            style={{
              color: 'white',
              fontSize: '64px',
              fontWeight: 'bold',
              textShadow: '0 0 10px rgba(0, 0, 0, 0.8)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {titleText}
          </h1>
        </div>
      </div>
      
      {/* Audio handling - Either add external audio only if video is not available 
          OR add it alongside video's audio if enableAudio is true */}
      {(!useVideo && audioFile) || (enableAudio && audioFile) ? (
        <AudioTrack 
          audioFile={audioFile} 
          offsetInSeconds={audioOffsetInSeconds}
        />
      ) : null}
    </AbsoluteFill>
  );
};
  `;

  // Write the component to a file
  fs.writeFileSync(filePath, componentCode);

  // Generate dynamic index file that exports this component
  const dynamicIndexPath = path.join(__dirname, `${componentName}-index.jsx`);
  const indexCode = `
import {Composition} from 'remotion';
import {${componentName}} from './${componentName}';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="${componentName}"
        component={${componentName}}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};

import {registerRoot} from 'remotion';
registerRoot(RemotionRoot);
  `;

  fs.writeFileSync(dynamicIndexPath, indexCode);

  return {
    componentPath: filePath,
    indexPath: dynamicIndexPath,
    componentName,
  };
}

module.exports = generateDynamicVideo;
