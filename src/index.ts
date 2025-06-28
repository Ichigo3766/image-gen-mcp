#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';

const SD_WEBUI_URL = process.env.SD_WEBUI_URL || 'http://127.0.0.1:7860';
const AUTH_USER = process.env.SD_AUTH_USER;
const AUTH_PASS = process.env.SD_AUTH_PASS;
const DEFAULT_OUTPUT_DIR = process.env.SD_OUTPUT_DIR || './output';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "300000", 10);

// Upscaling defaults
const SD_RESIZE_MODE = parseInt(process.env.SD_RESIZE_MODE || "0", 10);
const SD_UPSCALE_MULTIPLIER = parseInt(process.env.SD_UPSCALE_MULTIPLIER || "4", 10);
const SD_UPSCALE_WIDTH = parseInt(process.env.SD_UPSCALE_WIDTH || "512", 10);
const SD_UPSCALE_HEIGHT = parseInt(process.env.SD_UPSCALE_HEIGHT || "512", 10);
const SD_UPSCALER_1 = process.env.SD_UPSCALER_1 || "R-ESRGAN 4x+";
const SD_UPSCALER_2 = process.env.SD_UPSCALER_2 || "None";

interface GenerateImageArgs {
  prompt: string;
  negative_prompt?: string;
  steps?: number;
  width?: number;
  height?: number;
  cfg_scale?: number;
  sampler_name?: string;
  scheduler_name?: string;
  seed?: number;
  batch_size?: number;
  restore_faces?: boolean;
  tiling?: boolean;
  output_path?: string;
  distilled_cfg_scale?: number;
}

interface SDAPIPayload {
  prompt: string;
  negative_prompt: string;
  steps: number;
  width: number;
  height: number;
  cfg_scale: number;
  sampler_name: string;
  scheduler: string;
  seed: number;
  n_iter: number;
  restore_faces?: boolean;
  tiling?: boolean;
  distilled_cfg_scale?: number;
}

interface ModelInfo {
  title: string;
  model_name: string;
  hash: string;
  sha256: string;
  filename: string;
  config: string;
}

interface SetModelArgs {
  model_name: string;
}

interface UpscalerInfo {
  name: string;
  model_name: string;
  model_path: string;
  model_url: string;
  scale: number;
}

interface UpscaleImagesArgs {
  images: string[];
  resize_mode?: number;
  upscaling_resize?: number;
  upscaling_resize_w?: number;
  upscaling_resize_h?: number;
  upscaler_1?: string;
  upscaler_2?: string;
  output_path?: string;
}

interface UpscaleImagePayload {
  resize_mode: number;
  show_extras_results: boolean;
  gfpgan_visibility: number;
  codeformer_visibility: number;
  codeformer_weight: number;
  upscaling_resize: number;
  upscaling_resize_w: number;
  upscaling_resize_h: number;
  upscaling_crop: boolean;
  upscaler_1: string;
  upscaler_2: string;
  extras_upscaler_2_visibility: number;
  upscale_first: boolean;
  imageList: Array<{
    data: string;
    name: string;
  }>;
}

class ImageGenServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      { name: 'image-gen', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    const axiosConfig: any = {
      baseURL: SD_WEBUI_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: REQUEST_TIMEOUT
    };

    if (AUTH_USER && AUTH_PASS) {
      axiosConfig.auth = { username: AUTH_USER, password: AUTH_PASS };
    }

    this.axiosInstance = axios.create(axiosConfig);
    this.setupToolHandlers();

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_image',
          description: 'Generate an image using Stable Diffusion',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'The prompt describing the desired image' },
              negative_prompt: { type: 'string', description: 'Things to exclude from the image' },
              steps: { type: 'number', description: 'Number of sampling steps (default: 4)', minimum: 1, maximum: 150 },
              width: { type: 'number', description: 'Image width (default: 1024)', minimum: 512, maximum: 2048 },
              height: { type: 'number', description: 'Image height (default: 1024)', minimum: 512, maximum: 2048 },
              cfg_scale: { type: 'number', description: 'CFG scale (default: 1)', minimum: 1, maximum: 30 },
              sampler_name: { type: 'string', description: 'Sampling algorithm (default: Euler)', default: 'Euler' },
              scheduler_name: { type: 'string', description: 'Scheduler algorithm (default: Simple)', default: 'Simple' },
              seed: { type: 'number', description: 'Random seed (-1 for random)', minimum: -1 },
              batch_size: { type: 'number', description: 'Number of images to generate (default: 1)', minimum: 1, maximum: 4 },
              restore_faces: { type: 'boolean', description: 'Enable face restoration' },
              tiling: { type: 'boolean', description: 'Generate tileable images' },
              distilled_cfg_scale: { type: 'number', description: 'Distilled CFG scale (default: 3.5)', minimum: 1, maximum: 30 },
              output_path: { type: 'string', description: 'Custom output path for the generated image' }
            },
            required: ['prompt']
          }
        },
        {
          name: 'get_sd_models',
          description: 'Get list of available Stable Diffusion models',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'set_sd_model',
          description: 'Set the active Stable Diffusion model',
          inputSchema: {
            type: 'object',
            properties: {
              model_name: { type: 'string', description: 'Name of the model to set as active' }
            },
            required: ['model_name']
          }
        },
        {
          name: 'get_sd_upscalers',
          description: 'Get list of available upscaler models',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'upscale_images',
          description: 'Upscale one or more images using Stable Diffusion',
          inputSchema: {
            type: 'object',
            properties: {
              images: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of image file paths to upscale'
              },
              resize_mode: {
                type: 'string',
                enum: ['0', '1'],
                description: '0 for multiplier mode (default), 1 for dimension mode'
              },
              upscaling_resize: {
                type: 'number',
                description: 'Upscale multiplier (default: 4) - used when resize_mode is 0'
              },
              upscaling_resize_w: {
                type: 'number',
                description: 'Target width in pixels (default: 512) - used when resize_mode is 1'
              },
              upscaling_resize_h: {
                type: 'number',
                description: 'Target height in pixels (default: 512) - used when resize_mode is 1'
              },
              upscaler_1: {
                type: 'string',
                description: 'Primary upscaler model (default: R-ESRGAN 4x+)'
              },
              upscaler_2: {
                type: 'string',
                description: 'Secondary upscaler model (default: None)'
              },
              output_path: {
                type: 'string',
                description: 'Custom output directory for upscaled images'
              }
            },
            required: ['images']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'generate_image': {
            const args = request.params.arguments;
            if (!isGenerateImageArgs(args)) {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid parameters');
            }

            const outputDir = args.output_path ? path.normalize(args.output_path.trim()) : DEFAULT_OUTPUT_DIR;
            await this.ensureDirectoryExists(outputDir);

            const payload: SDAPIPayload = {
              prompt: args.prompt,
              negative_prompt: args.negative_prompt || '',
              steps: args.steps || 4,
              width: args.width || 1024,
              height: args.height || 1024,
              cfg_scale: args.cfg_scale || 1,
              sampler_name: args.sampler_name || 'Euler',
              seed: args.seed ?? -1,
              n_iter: args.batch_size || 1,
              distilled_cfg_scale: args.distilled_cfg_scale || 3.5,
              scheduler: args.scheduler_name || 'Simple',
              tiling: !!args.tiling,
              restore_faces: !!args.restore_faces
            };

            const response = await this.axiosInstance.post('/sdapi/v1/txt2img', payload);
            if (!response.data.images?.length) throw new Error('No images generated');

            const results = [];
            for (const imageData of response.data.images) {
              const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
              const pngInfoResponse = await this.axiosInstance.post('/sdapi/v1/png-info', { image: `data:image/png;base64,${imageData}` });
              
              const outputPath = path.join(outputDir, `sd_${randomUUID()}.png`);
              const imageBuffer = Buffer.from(base64Data, 'base64');
              
              await sharp(imageBuffer)
                .withMetadata({ exif: { IFD0: { ImageDescription: pngInfoResponse.data.info } } })
                .toFile(outputPath);

              results.push({ path: outputPath, parameters: pngInfoResponse.data.info });
            }

            return { content: [{ type: 'text', text: JSON.stringify(results) }] };
          }

          case 'get_sd_models': {
            const response = await this.axiosInstance.get('/sdapi/v1/sd-models');
            const models = response.data as ModelInfo[];
            return { content: [{ type: 'text', text: JSON.stringify(models.map(m => m.title)) }] };
          }

          case 'set_sd_model': {
            const args = request.params.arguments;
            if (!isSetModelArgs(args)) {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid parameters');
            }

            await this.axiosInstance.post('/sdapi/v1/options', {
              sd_model_checkpoint: args.model_name
            });

            return { content: [{ type: 'text', text: `Model set to: ${args.model_name}` }] };
          }

          case 'get_sd_upscalers': {
            const response = await this.axiosInstance.get('/sdapi/v1/upscalers');
            const upscalers = response.data as UpscalerInfo[];
            return { content: [{ type: 'text', text: JSON.stringify(upscalers.map(u => u.name)) }] };
          }

          case 'upscale_images': {
            const args = request.params.arguments;
            if (!isUpscaleImagesArgs(args)) {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid parameters');
            }

            const outputDir = args.output_path ? path.normalize(args.output_path.trim()) : DEFAULT_OUTPUT_DIR;
            await this.ensureDirectoryExists(outputDir);

            // Read and encode all images
            const encodedImages = await Promise.all(args.images.map(async (imagePath) => {
              const data = await fs.promises.readFile(imagePath);
              return {
                data: data.toString('base64'),
                name: path.basename(imagePath)
              };
            }));

            // Convert resize_mode to number if present, otherwise use default
            const resizeModeNum = args.resize_mode !== undefined ? Number(args.resize_mode) : SD_RESIZE_MODE;

            const payload: UpscaleImagePayload = {
              resize_mode: resizeModeNum,
              show_extras_results: true,
              gfpgan_visibility: 0,
              codeformer_visibility: 0,
              codeformer_weight: 0,
              upscaling_resize: args.upscaling_resize ?? SD_UPSCALE_MULTIPLIER,
              upscaling_resize_w: args.upscaling_resize_w ?? SD_UPSCALE_WIDTH,
              upscaling_resize_h: args.upscaling_resize_h ?? SD_UPSCALE_HEIGHT,
              upscaling_crop: true,
              upscaler_1: args.upscaler_1 ?? SD_UPSCALER_1,
              upscaler_2: args.upscaler_2 ?? SD_UPSCALER_2,
              extras_upscaler_2_visibility: 0,
              upscale_first: false,
              imageList: encodedImages
            };

            const response = await this.axiosInstance.post('/sdapi/v1/extra-batch-images', payload);
            if (!response.data.images?.length) throw new Error('No images upscaled');

            const results = [];
            for (let i = 0; i < response.data.images.length; i++) {
              const imageData = response.data.images[i];
              const outputPath = path.join(outputDir, `upscaled_${path.basename(args.images[i])}`);
              
              await fs.promises.writeFile(outputPath, Buffer.from(imageData, 'base64'));
              results.push({ path: outputPath });
            }

            return { content: [{ type: 'text', text: JSON.stringify(results) }] };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          throw new McpError(
            ErrorCode.InternalError,
            error.response ? `API error: ${error.response.data?.error || error.message}` :
            error.request ? `No response: ${error.message}` : `Request error: ${error.message}`
          );
        }
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error occurred'
        );
      }
    });
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath, fs.constants.F_OK);
    } catch {
      await mkdir(dirPath, { recursive: true });
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

function isGenerateImageArgs(value: unknown): value is GenerateImageArgs {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  
  // Validate string fields
  if (typeof v.prompt !== 'string') return false;
  if (v.negative_prompt !== undefined && typeof v.negative_prompt !== 'string') return false;
  
  // Convert and validate numeric fields
  if (v.steps !== undefined) {
    const steps = Number(v.steps);
    if (isNaN(steps) || steps < 1 || steps > 150) return false;
    v.steps = steps;
  }
  
  if (v.batch_size !== undefined) {
    const batchSize = Number(v.batch_size);
    if (isNaN(batchSize) || batchSize < 1 || batchSize > 4) return false;
    v.batch_size = batchSize;
  }
  
  return true;
}

function isSetModelArgs(value: unknown): value is SetModelArgs {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.model_name === 'string';
}

function isUpscaleImagesArgs(value: unknown): value is UpscaleImagesArgs {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  // Validate images array
  if (!Array.isArray(v.images) || !v.images.every(img => typeof img === 'string')) {
    return false;
  }

  // Validate optional resize_mode as string '0' or '1'
  if (v.resize_mode !== undefined) {
    if (typeof v.resize_mode !== 'string' || !['0', '1'].includes(v.resize_mode)) return false;
  }

  if (v.upscaling_resize !== undefined) {
    const resize = Number(v.upscaling_resize);
    if (isNaN(resize) || resize < 1) return false;
  }

  if (v.upscaling_resize_w !== undefined) {
    const width = Number(v.upscaling_resize_w);
    if (isNaN(width) || width < 1) return false;
  }

  if (v.upscaling_resize_h !== undefined) {
    const height = Number(v.upscaling_resize_h);
    if (isNaN(height) || height < 1) return false;
  }

  // Validate optional string fields
  if (v.upscaler_1 !== undefined && typeof v.upscaler_1 !== 'string') return false;
  if (v.upscaler_2 !== undefined && typeof v.upscaler_2 !== 'string') return false;
  if (v.output_path !== undefined && typeof v.output_path !== 'string') return false;

  return true;
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  setTimeout(() => process.exit(1), 500);
});

const server = new ImageGenServer();
server.run().catch(err => {
  console.error('Server failed:', err);
  process.exit(1);
});