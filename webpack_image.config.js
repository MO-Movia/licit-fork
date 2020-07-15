/*eslint-disable */

const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const WriteFilePlugin = require('write-file-webpack-plugin');
const env = require('./utils/env');
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

var isDev = env.NODE_ENV === 'development' || 0;

var options = {
  mode: 'production',//development
  entry: {
      image: path.join(__dirname, 'licit', 'server/image', 'index.js'),
  },
  output: {
    path: path.join(__dirname, 'servers/image'),
    filename: '[name].bundle.js'
  },
  //devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
          presets: [['@babel/preset-env', { 'targets': { 'node': true } }]],
          plugins: [
            '@babel/plugin-proposal-class-properties',
            '@babel/plugin-proposal-export-default-from',
            [
              '@babel/plugin-transform-runtime',
              {
                helpers: true,
                regenerator: true,
              },
            ],
            '@babel/plugin-proposal-object-rest-spread',
            '@babel/plugin-transform-flow-strip-types',
            '@babel/plugin-syntax-dynamic-import',
          ],
        },
      },
    ]
  },
  devServer: {
    headers: {
      'Access-Control-Allow-Origin': '*'
	}
  },
  resolve: {
    alias: {}
  },
  plugins: [
    // clean the web folder
    new CleanWebpackPlugin(),
    // expose and write the allowed env vars on the compiled bundle
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV)
    }),
    new WriteFilePlugin()
  ]
};

if (env.NODE_ENV === 'development') {
  options.devtool = 'source-map';
} else {
  options.optimization =  {
    minimize: true,
    minimizer: [new TerserPlugin()],
  }
}

module.exports = options;
