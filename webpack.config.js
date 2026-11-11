import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';

// Get the directory name of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  entry: {
    main: './modules/hoopla.js',
    optimization: './modules/optimization.js',
    fileHandler: './modules/fileHandler.js',
    uiHandler: './modules/uiHandler.js',
    mcmcHandler: './modules/mcmcHandler.js',
    imageViewer: './modules/imageViewer.js',
    imageProcessor: './modules/imageProcessor.js'
  },
  output: {
    filename: '[name].[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './index.html',
      filename: 'index.html'
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, '.'),
    },
    compress: true,
    port: 8070,
    hot: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpg|gif|fits|h5)$/,
        type: 'asset/resource'
      }
    ]
  },
  resolve: {
    extensions: ['.js'],
    fallback: {
      "buffer": "buffer/"
    }
  }
};