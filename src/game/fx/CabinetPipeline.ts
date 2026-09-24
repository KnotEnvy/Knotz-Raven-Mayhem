import Phaser from 'phaser';

// Desktop-tier camera post process. One pipeline does all the "arcade glass"
// work so the GPU only pays for a handful of full-screen passes:
//   1. bright pass  -> half-res target (only neon/explosions survive the threshold)
//   2. separable gaussian blur, ping-ponged twice at half res
//   3. composite    -> scene + bloom, chromatic aberration kicks, scanlines,
//                      vignette, film grain and an impact flash tint
// There is deliberately no barrel curvature: bending the image would move
// ravens away from where the pointer hit-tests them.

const BRIGHT_FRAG = `
#define SHADER_NAME KNOTZ_BRIGHT_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uThreshold;
varying vec2 outTexCoord;
void main () {
  vec4 color = texture2D(uMainSampler, outTexCoord);
  float luma = max(max(color.r, color.g), color.b);
  float keep = smoothstep(uThreshold, uThreshold + 0.28, luma);
  gl_FragColor = vec4(color.rgb * keep, 1.0);
}
`;

const BLUR_FRAG = `
#define SHADER_NAME KNOTZ_BLUR_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uDirection;
varying vec2 outTexCoord;
void main () {
  vec4 sum = texture2D(uMainSampler, outTexCoord) * 0.2270270270;
  sum += texture2D(uMainSampler, outTexCoord + uDirection * 1.3846153846) * 0.3162162162;
  sum += texture2D(uMainSampler, outTexCoord - uDirection * 1.3846153846) * 0.3162162162;
  sum += texture2D(uMainSampler, outTexCoord + uDirection * 3.2307692308) * 0.0702702703;
  sum += texture2D(uMainSampler, outTexCoord - uDirection * 3.2307692308) * 0.0702702703;
  gl_FragColor = sum;
}
`;

const COMPOSITE_FRAG = `
#define SHADER_NAME KNOTZ_COMPOSITE_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBloomStrength;
uniform float uAberration;
uniform float uScanline;
uniform float uVignette;
uniform float uGrain;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec2 outTexCoord;

float hash (vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main () {
  vec2 uv = outTexCoord;
  vec2 centered = uv - 0.5;
  vec2 shift = centered * uAberration;
  vec3 color;
  color.r = texture2D(uMainSampler, uv + shift).r;
  color.g = texture2D(uMainSampler, uv).g;
  color.b = texture2D(uMainSampler, uv - shift).b;

  vec3 bloom = texture2D(uBloom, uv).rgb;
  color += bloom * uBloomStrength;

  float scan = sin(uv.y * uResolution.y * 3.14159265) * 0.5 + 0.5;
  color *= 1.0 - uScanline * (1.0 - scan);

  float edge = length(centered * vec2(1.0, 0.9));
  float vignette = smoothstep(0.82, 0.28, edge);
  color *= mix(1.0 - uVignette, 1.0, vignette);

  float grain = hash(uv * uResolution + fract(uTime) * 91.0) - 0.5;
  color += grain * uGrain;

  color += uFlashColor * uFlash;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const CABINET_PIPELINE_KEY = 'CabinetPipeline';

export class CabinetPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  bloomStrength = 0.8;
  threshold = 0.6;
  baseAberration = 0.0018;
  scanline = 0.09;
  vignette = 0.42;
  grain = 0.03;
  blurRadius = 1.6;

  private aberrationKick = 0;
  private flash = 0;
  private flashColor: [number, number, number] = [1, 1, 1];
  private lastTick = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: CABINET_PIPELINE_KEY,
      shaders: [
        { name: 'bright', fragShader: BRIGHT_FRAG },
        { name: 'blur', fragShader: BLUR_FRAG },
        { name: 'composite', fragShader: COMPOSITE_FRAG },
      ],
    });
  }

  kick(amount: number): void {
    this.aberrationKick = Math.min(1, this.aberrationKick + amount);
  }

  flashScreen(color: number, amount: number): void {
    const rgb = Phaser.Display.Color.IntegerToRGB(color);
    this.flashColor = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
    this.flash = Math.min(0.6, Math.max(this.flash, amount));
  }

  onPreRender(): void {
    const now = performance.now();
    const delta = this.lastTick ? Math.min(100, now - this.lastTick) : 16;
    this.lastTick = now;
    this.aberrationKick *= Math.pow(0.86, delta / 16.67);
    this.flash *= Math.pow(0.8, delta / 16.67);
    if (this.aberrationKick < 0.001) this.aberrationKick = 0;
    if (this.flash < 0.002) this.flash = 0;
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    const gl = this.gl;
    const bright = this.shaders[0];
    const blur = this.shaders[1];
    const composite = this.shaders[2];
    const half1 = this.halfFrame1;
    const half2 = this.halfFrame2;

    if (!bright || !blur || !composite || !half1 || !half2) {
      this.bindAndDraw(renderTarget);
      return;
    }

    this.set1f('uThreshold', this.threshold, bright);
    this.bindAndDraw(renderTarget, half1, true, true, bright);

    for (let pass = 0; pass < 2; pass++) {
      const radius = this.blurRadius * (pass + 1);
      this.set2f('uDirection', radius / half1.width, 0, blur);
      this.bindAndDraw(half1, half2, true, true, blur);
      this.set2f('uDirection', 0, radius / half1.height, blur);
      this.bindAndDraw(half2, half1, true, true, blur);
    }

    this.set2f('uResolution', renderTarget.width, renderTarget.height, composite);
    this.set1f('uTime', (performance.now() % 100000) / 1000, composite);
    this.set1f('uBloomStrength', this.bloomStrength, composite);
    this.set1f('uAberration', this.baseAberration + this.aberrationKick * 0.014, composite);
    this.set1f('uScanline', this.scanline, composite);
    this.set1f('uVignette', this.vignette, composite);
    this.set1f('uGrain', this.grain, composite);
    this.set1f('uFlash', this.flash, composite);
    this.set3f('uFlashColor', this.flashColor[0], this.flashColor[1], this.flashColor[2], composite);
    this.set1i('uBloom', 1, composite);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, half1.texture.webGLTexture);
    this.bindAndDraw(renderTarget, undefined, false, false, composite);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
  }
}

export function registerCabinetPipeline(game: Phaser.Game): boolean {
  if (game.renderer.type !== Phaser.WEBGL) return false;
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer.pipelines.postPipelineClasses.has(CABINET_PIPELINE_KEY)) {
    renderer.pipelines.addPostPipeline(CABINET_PIPELINE_KEY, CabinetPipeline);
  }
  return true;
}

export function attachCabinetPipeline(camera: Phaser.Cameras.Scene2D.Camera, enabled: boolean): CabinetPipeline | undefined {
  camera.resetPostPipeline();
  if (!enabled) return undefined;
  camera.setPostPipeline(CABINET_PIPELINE_KEY);
  const pipeline = camera.getPostPipeline(CABINET_PIPELINE_KEY);
  return (Array.isArray(pipeline) ? pipeline[0] : pipeline) as CabinetPipeline | undefined;
}
