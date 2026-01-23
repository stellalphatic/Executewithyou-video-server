
export const STREAM_VS = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const STREAM_FS = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uSpeed;
  varying vec2 vUv;
  void main() {
    // Create moving dashed pattern with variable speed
    float dash = sin(vUv.x * 20.0 - uTime * uSpeed);
    
    // Sharpen the wave to create distinct packets with a glow trail
    float alpha = smoothstep(0.8, 1.0, dash);
    
    // Add a subtle trail behind the packet
    float trail = smoothstep(0.0, 1.0, dash) * 0.3;
    
    // Soften edges of the tube
    float edge = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
    
    // Combine for a neon glow look
    gl_FragColor = vec4(uColor, (alpha + trail) * edge);
  }
`;
