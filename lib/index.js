(function() {
  var EOL, Q, UglifyJS, amdDependency, async, coffee, coffeeReactTransform, fs, gutil, logErr, mkdirp, mt2amd, path, reactTools, through, _findVendor, _findVendorInDir;

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  coffee = require('gulp-coffee');

  mt2amd = require('gulp-mt2amd');

  amdDependency = require('gulp-amd-dependency');

  reactTools = require('react-tools');

  coffeeReactTransform = require('coffee-react-transform');

  UglifyJS = require('uglify-js');

  mkdirp = require('mkdirp');

  EOL = '\n';

  logErr = function(err, filePath) {
    console.log('Error:', err.message);
    console.log('file:', filePath);
    if (err.line) {
      console.log('line:', err.line);
    }
    throw err;
  };

  _findVendorInDir = function(inDir, outDir, name, opt, callback) {
    var content, err, mainPath, minifyJS, moduleDir, outPath, packageObj, packagePath, _ref, _ref1;
    moduleDir = path.resolve(inDir, name);
    packagePath = path.resolve(moduleDir, 'package.json');
    if (fs.existsSync(packagePath)) {
      packageObj = require(packagePath);
      if (packageObj.main) {
        if ((_ref = opt.mainMap) != null ? _ref[name] : void 0) {
          mainPath = path.resolve(moduleDir, (_ref1 = opt.mainMap) != null ? _ref1[name] : void 0);
        } else {
          mainPath = path.resolve(moduleDir, packageObj.main);
        }
        if (path.extname(mainPath) !== '.js') {
          mainPath = mainPath + '.js';
        }
        if (fs.existsSync(mainPath)) {
          if (opt.suffix) {
            outPath = path.resolve(outDir, name + opt.suffix + '.js');
          } else {
            outPath = path.resolve(outDir, name + '.js');
          }
          if (!fs.existsSync(outPath) || opt.overWrite) {
            content = fs.readFileSync(mainPath).toString();
            if (opt.minifyJS) {
              if (typeof opt.minifyJS === 'object') {
                minifyJS = opt.minifyJS;
              } else {
                minifyJS = {};
              }
              minifyJS.fromString = true;
              try {
                content = UglifyJS.minify(content, minifyJS).code;
              } catch (_error) {
                err = _error;
                logErr(err, mainPath);
              }
            }
            return mkdirp(outDir, function(err) {
              if (err) {
                logErr(err, mainPath);
              }
              fs.writeFileSync(outPath, content);
              return callback(true);
            });
          } else {
            return callback(false);
          }
        }
      } else {
        return callback(false);
      }
    } else {
      return callback(false);
    }
  };

  _findVendor = function(inDir, outDir, name, opt, callback) {
    return _findVendorInDir(path.resolve(inDir, 'node_modules'), outDir, name, opt, function(found) {
      if (found) {
        return callback();
      } else {
        return _findVendorInDir(path.resolve(inDir, 'bower_components'), outDir, name, opt, function(found) {
          return callback();
        });
      }
    });
  };

  module.exports = function(opt) {
    if (opt == null) {
      opt = {};
    }
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-amd-bundler', 'Streams not supported'));
      }
      return module.exports.bundle(file, opt).then((function(_this) {
        return function(file) {
          _this.push(file);
          return next();
        };
      })(this), (function(_this) {
        return function(err) {
          return _this.emit('error', new gutil.PluginError('gulp-amd-bundler', err));
        };
      })(this)).done();
    });
  };

  module.exports.bundle = function(file, opt) {
    var baseDir, baseFile;
    if (opt == null) {
      opt = {};
    }
    baseFile = opt.baseFile;
    baseDir = opt.baseDir;
    if (baseFile && !baseDir) {
      baseDir = path.dirname(baseFile.path);
    }
    return Q.Promise(function(resolve, reject) {
      var depStream, dependFiles;
      if (file.isNull()) {
        return reject(new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return reject(new gutil.PluginError('gulp-amd-bundler', 'Streams not supported'));
      }
      dependFiles = [file];
      depStream = amdDependency({
        excludeDependent: true,
        onlyRelative: !opt.findVendor
      });
      depStream.pipe(through.obj(function(file, enc, next) {
        dependFiles.push(file);
        return next();
      }, function() {
        var content;
        content = [];
        return async.eachSeries(dependFiles, function(depFile, cb) {
          var coffeeStream, cwd, depContent, depId, fileName, findVendorOpt, inDir, outDir, requireBaseDir, trace, typeOfOpt;
          if (depFile._isRelative || depFile.path === file.path) {
            if (depFile.path === file.path) {
              if (baseDir) {
                depId = path.relative(baseDir, depFile.path).replace(/\.(tag|riot\.html|js|jsx|coffee)$/, '');
              } else {
                depId = '';
              }
              file.contents = new Buffer(file.contents.toString().split(/(?:\r\n|\n|\r)__END__\s*(?:\r\n|\n|\r|$)/)[0]);
            } else {
              depId = path.relative(baseDir || path.dirname(file.path), depFile.path).replace(/\.(tag|riot\.html|js|jsx|coffee)$/, '');
            }
            if (opt.trace) {
              trace = '/* trace:' + path.relative(process.cwd(), depFile.path) + ' */' + EOL;
            } else {
              trace = '';
            }
            if (/\.(tag|riot\.html|tpl\.html|css|less|scss)$/.test(depFile.path)) {
              return mt2amd.compile(depFile, {
                riotOpt: opt.riotOpt,
                postcss: opt.postcss,
                generateDataUri: opt.generateDataUri,
                cssSprite: opt.cssSprite,
                beautify: opt.beautifyTemplate,
                trace: opt.trace
              }).then(function(depFile) {
                content.push(mt2amd.fixDefineParams(depFile.contents.toString(), depId, !!opt.baseDir));
                return cb();
              }, function(err) {
                return reject(err);
              }).done();
            } else if (/\.coffee$/.test(depFile.path)) {
              depContent = depFile.contents.toString();
              if (/\.react\.coffee$/.test(depFile.path) || /(^|\r\n|\n|\r)##\s*@jsx\s/.test(depContent)) {
                depContent = coffeeReactTransform(depContent);
                depFile.contents = new Buffer(depContent);
              }
              coffeeStream = coffee(opt.coffeeOpt);
              coffeeStream.pipe(through.obj(function(depFile, enc, next) {
                content.push(trace + mt2amd.fixDefineParams(depFile.contents.toString(), depId, !!opt.baseDir));
                cb();
                return next();
              }));
              coffeeStream.on('error', function(e) {
                console.log('gulp-amd-bundler Error:', e.message);
                console.log('file:', file.path);
                return console.log(e.stack);
              });
              return coffeeStream.end(depFile);
            } else {
              depContent = depFile.contents.toString();
              if (/\.(react\.js|jsx)$/.test(depFile.path) || /(^|\r\n|\n|\r)\/\*\*\s*@jsx\s/.test(depContent)) {
                depContent = reactTools.transform(depContent, opt.reactOpt);
              }
              content.push(trace + mt2amd.fixDefineParams(depContent, depId, !!opt.baseDir));
              return cb();
            }
          } else if (opt.findVendor) {
            typeOfOpt = typeof opt.findVendor;
            findVendorOpt = {};
            if (typeOfOpt === 'object') {
              findVendorOpt = opt.findVendor;
              requireBaseDir = findVendorOpt.requireBaseDir;
              outDir = findVendorOpt.outDir;
              inDir = findVendorOpt.inDir || './';
            } else if (typeOfOpt === 'string') {
              outDir = opt.findVendor;
              inDir = './';
            } else {
              outDir = 'js/vendor';
              inDir = './';
            }
            cwd = process.cwd();
            inDir = path.resolve(cwd, inDir);
            outDir = path.resolve(cwd, outDir);
            fileName = depFile.path;
            if (fileName.indexOf('/') === -1) {
              return _findVendor(inDir, outDir, fileName, findVendorOpt, cb);
            } else if (requireBaseDir) {
              fileName = path.resolve(cwd, requireBaseDir, depFile.path);
              fileName = path.relative(outDir, fileName);
              if (fileName && fileName.indexOf('/') === -1 && fileName.indexOf('.') === -1) {
                return _findVendor(inDir, outDir, fileName, findVendorOpt, cb);
              } else {
                return cb();
              }
            } else {
              return cb();
            }
          }
        }, function(err) {
          if (err) {
            return reject(err);
          }
          if (/\.tpl\.html$/.test(file.path)) {
            file.path = file.path + '.js';
          } else {
            file.path = file.path.replace(/\.coffee$/, '.js');
          }
          file.contents = new Buffer(content.join(EOL + EOL));
          return resolve(file);
        });
      }));
      return depStream.end(file);
    });
  };

}).call(this);
