/**
 * @license
 * Copyright 2016 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const webpack = require('webpack');
const ClosureCompilerPlugin = require('webpack-closure-compiler');
const fs = require('fs');

/**
 * Resolve a path to an absolute path, expanding all symbolic links.  This is
 * used to ensure that the same file is not seen under multiple paths by the
 * TypeScript compiler, leading to the same file being compiled more than once,
 * which can result in various errors.
 */
function resolveReal() {
  return fs.realpathSync(path.resolve.apply(undefined, arguments));
}
exports.resolveReal = resolveReal;

// Note: We use require.resolve below to ensure the plugins are resolved
// relative to this configuration file, rather than relative to the source
// files, in case this configuration is being used from a dependent project that
// doesn't have all of these plugins as direct dependencies.
//
// require.resolve resolves all symlinks.
const DEFAULT_BABEL_PLUGINS = exports.DEFAULT_BABEL_PLUGINS = [
  // Needed until Firefox implements proper handling of default values in
  // destructuring expressions.
  require.resolve('babel-plugin-transform-es2015-destructuring'),
  require.resolve('babel-plugin-transform-es2015-parameters'),

  // Needed until Firefox implements proper for loop scoping of let, which is
  // not fixed as of Firefox 46.
  require.resolve('babel-plugin-transform-es2015-block-scoping'),

  // This is needed in order to avoid transform-es2015-block-scoping generating
  // invalid code.
  require.resolve('babel-plugin-transform-es2015-classes'),
];

const DEFAULT_DATA_SOURCES = exports.DEFAULT_DATA_SOURCES = [
  'neuroglancer/datasource/brainmaps',
  'neuroglancer/datasource/ndstore',
  'neuroglancer/datasource/dvid',
  'neuroglancer/datasource/openconnectome',
  'neuroglancer/datasource/precomputed',
  'neuroglancer/datasource/python',
  'neuroglancer/datasource/nifti',
  'neuroglancer/datasource/vtk',
  'neuroglancer/datasource/csv',
];

/**
 * Returns a loader specification for TypeScript files.
 *
 * @param {boolean=} options.useBabel Use Babel.
 * @param {string[]=} options.babelPlugins Babel plugins to use in place of DEFAULT_BABEL_PLUGINS.
 */
function getTypescriptLoaderEntry(options) {
  if (options === undefined) {
    options = {};
  }
  const useBabel = options.useBabel !== undefined ? options.useBabel : true;
  const babelPlugins =
      options.babelPlugins !== undefined ? options.babelPlugins : DEFAULT_BABEL_PLUGINS;
  const babelConfig = {
    cacheDirectory: true,
    plugins: babelPlugins,
  };

  let tsLoaderPrefix = '';
  tsLoaderPrefix = `babel?${JSON.stringify(babelConfig)}!`;
  return {test: /\.ts$/, loader: tsLoaderPrefix + 'ts'};
}

/**
 * Returns a base webpack configuration.
 *
 * @param {object} options In addition to the options of getTypescriptLoaderEntry, the following
 *     options are also valid.
 * @param {string=} options.tsconfigPath Alternative path to tsconfig.json to use, e.g. in order to
 *     specify additional path aliases.  Any path aliases specified in tsconfig will automatically
 * be added as webpack resolve aliases.
 * @param {Object.<string,string>} options.resolveAliases Additional module aliases for webpack.
 * @param {Object.<string,string>} options.resolveLoaderAliases Additional loader aliases for
 * webpack.
 * @param {string[]} options.resolveLoaderRoots Additional root directories for finding webpack
 *     loaders.  You may want to include the path to the 'node_modules' directory of your project.
 * @param {boolean=} options.noOutput If true, no output section is added to the configuration.
 * @param {string=} options.output Specifies the directory where output will be generated.  Must be
 *     specified unless noOutput === true.
 */
function getBaseConfig(options) {
  options = options || {};
  let tsconfigPath = options.tsconfigPath || resolveReal(__dirname, '../tsconfig.json');
  let tsconfig = require(tsconfigPath);
  let extraResolveAliases = {};
  let newCompilerPaths = {};
  if (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) {
    for (let key of Object.keys(tsconfig.compilerOptions.paths)) {
      let value = tsconfig.compilerOptions.paths[key];
      newCompilerPaths[key] = value;
      if (!key.endsWith('/*') || !Array.isArray(value) || value.length !== 1 ||
          !value[0].endsWith('/*')) {
        // Silently skip.
        console.log(`Skipping ${JSON.stringify(key)} -> ${JSON.stringify(value)}`);
        continue;
      }
      const resolvedTarget =
          resolveReal(path.dirname(tsconfigPath), value[0].substring(0, value[0].length - 2));
      extraResolveAliases[key.substring(0, key.length - 2)] = resolvedTarget;
      newCompilerPaths[key] = [resolvedTarget + '/*'];
    }
  }
  console.log(extraResolveAliases);
  let baseConfig = {
    resolve: {
      extensions: ['', '.ts', '.js'],
      alias: Object.assign(
          {
            'neuroglancer-testdata': resolveReal(__dirname, '../testdata'),

            // Patched version of jpgjs.
            'jpgjs': resolveReal(__dirname, '../third_party/jpgjs/jpg.js'),
          },
          extraResolveAliases, options.resolveAliases || {}),
    },
    resolveLoader: {
      alias: Object.assign(
          {
            'raw-data$': resolveReal(__dirname, 'raw-data-loader.js'),
          },
          options.resolveLoaderAliases || []),
      root: [
        ...(options.resolveLoaderRoots || []),
        resolveReal(__dirname, '../node_modules'),
      ],
    },
    devtool: 'source-map',
    module: {
      loaders: [
        getTypescriptLoaderEntry(options),
        {test: /\.json$/, loader: require.resolve('json-loader')},
        {test: /\.css$/, loader: ExtractTextPlugin.extract('style-loader', 'css-loader')}, {
          test: /\.glsl$/,
          loader: require.resolve('raw-loader'),
        }
      ],
    },
    node: {'Buffer': false},
    ts: {
      compiler: resolveReal(__dirname, 'typescript_compiler_shim.js'),
      configFileName: tsconfigPath,
      compilerOptions: {paths: newCompilerPaths},
      instance: 'main',
    },
  };
  if (!options.noOutput) {
    if (options.outputPath === undefined) {
      throw new Error('options.outputPath must be specified.');
    }
    baseConfig.output = {filename: '[name].bundle.js', path: options.outputPath, sourcePrefix: ''};
  }
  return baseConfig;
}

/**
 * Returns an array containing the webpack configuration objects for the main and worker bundles.
 *
 * @param {object} options Configuration options.  In addition to the options of getBaseConfig and
 *     getTypescriptLoaderEntry, the following options may also be specified.
 * @param {boolean=} [options.minify=false] Specifies whether to produce minified output (using the
 *     SIMPLE mode of Google Closure Compiler).
 * @param {function(object)=} options.modifyBaseConfig Function that is invoked on the result of
 *     getBaseConfig, and is allowed to modify it before it is used to generate the main and worker
 *     bundles.
 * @param {Object.<string,string>=} options.defines Additional defines to pass to
 *     webpack.DefinePlugin.  You can use this to override the BRAINMAPS_CLIENT_ID, for example.  To
 *     insert a string literal, be sure to JSON.stringify.
 * @param {string[]} [options.dataSources=DEFAULT_DATA_SOURCES] Array of data source to include,
 *     specified as directories containing a 'frontend.ts' and 'backend.ts' file to be included in
 *     the frontend and backend bundles, respectively.  Note that if you wish for the default data
 *     sources to be included, you must include them in the array that you pass.
 * @param {string[]=} options.chunkWorkerModules Array of additional modules to include in the chunk
 *     worker.
 * @param {object[]=} options.commonPlugins Array of additional plugins to include in both the main
 *     and worker configurations.
 * @param {object[]=} options.chunkWorkerPlugins Array of additional plugins to include in the
 *     worker configuration.
 * @param {object[]=} options.frontendPlugins Array of additional plugins to include in the main
 *     configuration.
 * @param {string[]=} options.frontendModules Array of modules to include in the frontend bundle.
 *     If specified, '../src/main.ts' will not be included automatically.
 * @param options.cssPlugin If specified, overrides the default CSS plugin for the frontend.
 * @param options.htmlPlugin If specified, overrides the default HTML plugin for the frontend.
 */
function getViewerConfig(options) {
  options = options || {};
  let minify = options.minify;
  if (minify && options.useBabel === undefined) {
    options.useBabel = false;
  }
  let baseConfig = getBaseConfig(options);
  if (options.modifyBaseConfig) {
    options.modifyBaseConfig(baseConfig);
  }
  let dataSources = options.dataSources || DEFAULT_DATA_SOURCES;
  let frontendDataSourceModules = [];
  let backendDataSourceModules = [];
  for (let datasource of dataSources) {
    frontendDataSourceModules.push(`${datasource}/frontend`);
    backendDataSourceModules.push(`${datasource}/backend`);
  }
  let defaultDefines = {
    // This is the default client ID used for the hosted neuroglancer.
    // In addition to the hosted neuroglancer origin, it is valid for
    // the origins:
    //
    //   localhost:8000
    //   127.0.0.1:8000
    //   localhost:8080
    //   127.0.0.1:8080
    //
    // To deploy to a different origin, you will need to generate your
    // own client ID from on the Google Developer Console and substitute
    // it in.
    'BRAINMAPS_CLIENT_ID':
        JSON.stringify('639403125587-4k5hgdfumtrvur8v48e3pr7oo91d765k.apps.googleusercontent.com'),
  };
  let extraDefines = options.defines || {};
  let srcDir = resolveReal(__dirname, '../src');
  let commonPlugins = [];
  if (minify) {
    commonPlugins.push(new ClosureCompilerPlugin({
      compiler: {
        language_in: 'ECMASCRIPT6',
        language_out: 'ECMASCRIPT5',
        compilation_level: 'SIMPLE',
      },
    }));
  }
  let extraChunkWorkerModules = options.chunkWorkerModules || [];
  let extraCommonPlugins = options.commonPlugins || [];
  let extraFrontendPlugins = options.frontendPlugins || [];
  let extraChunkWorkerPlugins = options.chunkWorkerPlugins || [];
  let chunkWorkerModules = [
    'neuroglancer/worker_rpc_context',
    'neuroglancer/chunk_manager/backend',
    'neuroglancer/sliceview/backend',
    ...backendDataSourceModules,
    ...extraChunkWorkerModules,
  ];
  let frontendModules = options.frontendModules || [resolveReal(srcDir, 'main.ts')];
  let htmlPlugin =
      options.htmlPlugin || new HtmlWebpackPlugin({template: resolveReal(srcDir, 'index.html')});
  let cssPlugin = options.cssPlugin || new ExtractTextPlugin('styles.css', {allChunks: true});
  return [
    Object.assign(
        {
          entry: {'main': [...frontendDataSourceModules, ...frontendModules]},
          plugins: [
            htmlPlugin,
            cssPlugin,
            new webpack.DefinePlugin(Object.assign({}, defaultDefines, extraDefines, {
              'WORKER': false,
            })),
            ...extraFrontendPlugins,
            ...commonPlugins,
            ...extraCommonPlugins,
          ],
        },
        baseConfig),
    Object.assign(
        {
          entry: {'chunk_worker': [...chunkWorkerModules]},
          plugins: [
            new webpack.DefinePlugin(
                Object.assign({}, defaultDefines, extraDefines, {'WORKER': true})),
            ...extraChunkWorkerPlugins,
            ...commonPlugins,
            ...extraCommonPlugins,
          ],
        },
        baseConfig),
  ];
}

exports.getTypescriptLoaderEntry = getTypescriptLoaderEntry;
exports.getBaseConfig = getBaseConfig;
exports.getViewerConfig = getViewerConfig;
