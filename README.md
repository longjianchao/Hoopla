# Hoopla - Interactive Gravitational Lens Modeling

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Hoopla** is a simple JavaScript application for modeling images of strong gravitational lenses. It allows you to hand-craft a model lens out of elliptically-symmetric mass distributions (representing massive foreground galaxies) and elliptically symmetric light sources (representing faint background galaxies), and then dynamically predict the shape of the resulting gravitationally lensed image features as you tune the model.

You can provide your own image to model, and you can save your tuned model's parameters to a shareable JSON file.

## Download and Installation

### Prerequisites

- Modern web browser (Chrome, Firefox, Edge, Safari)
- ES6+ compatible JavaScript runtime

### Installation Methods

#### Method 1: Direct Download

```bash
# Clone from GitHub
git clone https://github.com/longjianchao/Hoopla.git

# Or from Gitee
git clone https://gitee.com/long-jianchao/Hoopla.git
```

#### Method 2: Docker Deployment

The project includes Docker support for quick deployment:

```bash
# Pull image and start container
docker-compose up -d

# Stop container
docker-compose down
```

#### Method 3: Local Development Server

```bash
# Install dependencies
npm install

# Start development server
npm start

# Or use webpack-dev-server
npm run dev
```

## Quick Start

### Basic Workflow

1. **Draw Model Ellipses**
   - Place your mouse on the `Mass Model` and `Source Model` canvases
   - Click and drag to draw an ellipse
   - The ellipse in `Mass Model` represents the foreground lensing galaxy
   - The ellipse in `Source Model` represents the background source galaxy

2. **Adjust the Model**
   - Move your mouse on the `Source Plane` - you will see a blue circle appear on the `Image Plane`
   - As you move the cursor on the `Source Plane`, the blue circle on the `Image Plane` changes accordingly
   - Find the position where the circle on the `Image Plane` best matches the lensed image
   - Click the left mouse button on the `Source Plane` to freeze the `Source Plane` - the circle will no longer change when you move your mouse

3. **Optimize the Model**
   - Click the blue `Optimization` button below
   - The program will help you find a better-fitting model
   - The `Residual Map` displays the residuals between the model and the lensed image
   - The `Chi-Square Curve` shows the chi-square value at each optimization iteration

4. **Save the Model**
   - Click `Save Models` to save your model
   - The file is saved in JSON format

### Other Features

- **Load Models**: Click `Load Models` to select and load a previously saved model file, allowing for further adjustment and optimization
- **Upload Images**: Click `Upload Images` to select an image from your computer for modeling. Note: All required information must be correctly filled in
- **Adjust Pixel Scale**: Enter the pixel scale at the bottom of the page and click the `Reset` button to change it

## Project Structure

```
Hoopla/
├── images/              # Sample images
├── lib/                 # Third-party libraries
│   └── marking/        # Marking surface library
├── index.html           # Main page
├── hoopla.js            # Core application logic
├── imageProcessor.js     # Image processing module
├── optimization.js       # Optimization algorithms
├── uiHandler.js         # UI interaction handling
├── fileHandler.js       # File I/O handling
├── webgpu-utils.js       # WebGPU utilities
├── style.css            # Stylesheet
└── package.json         # Project configuration
```

## Technology Stack

- **Frontend Framework**: Vanilla JavaScript (ES6+)
- **Graphics Library**: D3.js
- **Mathematical Computing**: Pyodide (Python in WebAssembly)
- **Accelerated Computing**: WebGPU
- **Image Processing**: Canvas API

## Dependencies

- [astro.js](https://github.com/astrofits/astrojs) - FITS file parsing
- [hdf5.js](https://github.com/NaturalHistoryMuseum/hdf5-js) - HDF5 file support
- [pako](https://github.com/nodeca/pako) - gzip decompression
- [D3.js](https://d3js.org/) - Data visualization
- [pyodide](https://github.com/pyodide/pyodide) - Python WebAssembly runtime

## Notes

1. After uploading an image, all required information must be correctly filled in for the modeling process to proceed
2. It is recommended to use standard image formats (FITS, HDF5, PNG)
3. For optimal modeling results, ensure a PSF (Point Spread Function) file is uploaded

## License

MIT License - See [LICENSE](LICENSE) file for details
