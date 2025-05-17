# image-gen MCP Server

A MCP server that provides text-to-image generation capabilities using Stable Diffusion WebUI API (ForgeUI/AUTOMATIC-1111).

<a href="https://glama.ai/mcp/servers/@Ichigo3766/image-gen-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Ichigo3766/image-gen-mcp/badge" alt="Image Generation Server MCP server" />
</a>

## Installation

### Installing via Smithery

To install Image Generation Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@Ichigo3766/image-gen-mcp):

```bash
npx -y @smithery/cli install @Ichigo3766/image-gen-mcp --client claude
```

### Prerequisites
- Node.js
- Access to a Stable Diffusion WebUI instance with API enabled
- The WebUI must have `--api` flag enabled when starting

### Setup

1. Clone the repository:
```bash
git clone https://github.com/Ichigo3766/image-gen-mcp.git
cd image-gen-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the server:
```bash
npm run build
```

4. Add the server configuration to your environment:

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "node",
      "args": [
        "/path/to/image-gen-mcp/build/index.js"
      ],
      "env": {
        "SD_WEBUI_URL": "http://your-sd-webui-url:7860",
        "SD_AUTH_USER": "your-username",  // Optional: if authentication is enabled
        "SD_AUTH_PASS": "your-password",  // Optional: if authentication is enabled
        "SD_OUTPUT_DIR": "/path/to/output/directory",
        "SD_RESIZE_MODE": "0",           // Optional: upscaling mode (0=multiplier, 1=dimensions)
        "SD_UPSCALE_MULTIPLIER": "4",    // Optional: default upscale multiplier
        "SD_UPSCALE_WIDTH": "512",       // Optional: default upscale width
        "SD_UPSCALE_HEIGHT": "512",      // Optional: default upscale height
        "SD_UPSCALER_1": "R-ESRGAN 4x+", // Optional: default primary upscaler
        "SD_UPSCALER_2": "None"          // Optional: default secondary upscaler
      }
    }
  }
}
```

Replace the environment variables with your values:
- `SD_WEBUI_URL`: URL of your Stable Diffusion WebUI instance
- `SD_AUTH_USER`: Username for basic auth (if enabled)
- `SD_AUTH_PASS`: Password for basic auth (if enabled)
- `SD_OUTPUT_DIR`: Directory where generated images will be saved
- `SD_RESIZE_MODE`: Default upscaling mode (0 for multiplier, 1 for dimensions)
- `SD_UPSCALE_MULTIPLIER`: Default upscale multiplier when resize_mode is 0
- `SD_UPSCALE_WIDTH`: Default target width when resize_mode is 1
- `SD_UPSCALE_HEIGHT`: Default target height when resize_mode is 1
- `SD_UPSCALER_1`: Default primary upscaler model
- `SD_UPSCALER_2`: Default secondary upscaler model

## Features

### Tools
- `generate_image` - Generate images using Stable Diffusion
  - Parameters:
    - `prompt` (required): Text description of the desired image
    - `negative_prompt`: Things to exclude from the image
    - `steps`: Number of sampling steps (default: 4, range: 1-150)
    - `width`: Image width (default: 1024, range: 512-2048)
    - `height`: Image height (default: 1024, range: 512-2048)
    - `cfg_scale`: CFG scale (default: 1, range: 1-30)
    - `sampler_name`: Sampling algorithm (default: "Euler")
    - `scheduler_name`: Scheduler algorithm (default: "Simple")
    - `seed`: Random seed (-1 for random)
    - `batch_size`: Number of images to generate (default: 1, max: 4)
    - `restore_faces`: Enable face restoration
    - `tiling`: Generate tileable images
    - `output_path`: Custom output path for the generated image

- `get_sd_models` - Get list of available Stable Diffusion models
  - No parameters required
  - Returns an array of model names

- `set_sd_model` - Set the active Stable Diffusion model
  - Parameters:
    - `model_name` (required): Name of the model to set as active

- `get_sd_upscalers` - Get list of available upscaler models
  - No parameters required
  - Returns an array of upscaler names

- `upscale_images` - Upscale one or more images using Stable Diffusion
  - Parameters:
    - `images` (required): Array of image file paths to upscale
    - `resize_mode`: 0 for multiplier mode, 1 for dimension mode (default: from env)
    - `upscaling_resize`: Upscale multiplier when resize_mode=0 (default: from env)
    - `upscaling_resize_w`: Target width in pixels when resize_mode=1 (default: from env)
    - `upscaling_resize_h`: Target height in pixels when resize_mode=1 (default: from env)
    - `upscaler_1`: Primary upscaler model (default: from env)
    - `upscaler_2`: Secondary upscaler model (default: from env)
    - `output_path`: Custom output directory for upscaled images

## Development

For development with auto-rebuild:
```bash
npm run watch
```

## Error Handling

Common issues and solutions:
1. Make sure your Stable Diffusion WebUI is running with the `--api` flag
2. Check if the WebUI URL is accessible from where you're running the MCP server
3. If using authentication, ensure credentials are correct
4. Verify the output directory exists and has write permissions
5. When upscaling, ensure the input image files exist and are readable

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
