(function() {
  var DEP_ID_SUFFIX_REGEXP, EOL, EXPORTS_REGEXP, Q, UglifyJS, amdDependency, async, child_process, coffee, coffeeReactTransform, findVendor, findVendorInDir, fixBowerDir, fixDefineParams, fs, getBodyDeps, getUnixStylePath, gutil, logErr, mkdirp, mt2amd, path, reactTools, through, traceur, _, _bowerDir, _npmDir, _venderFoundMap;

  child_process = require('child_process');

  _ = require('underscore');

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  traceur = require('traceur');

  coffee = require('gulp-coffee');

  mt2amd = require('gulp-mt2amd');

  amdDependency = require('gulp-amd-dependency');

  reactTools = require('react-tools');

  coffeeReactTransform = require('coffee-react-transform');

  UglifyJS = require('uglify-js');

  mkdirp = require('mkdirp');

  EOL = '\n';

  EXPORTS_REGEXP = /(^|[^.])\b(module\.exports|exports\.[^.]+)\s*=[^=]/;

  DEP_ID_SUFFIX_REGEXP = /\.(tag|riot\.html|js|jsx|es6|coffee)$/;

  _npmDir = 'node_modules';

  _bowerDir = 'bower_components';

  _venderFoundMap = {};

  logErr = function(err, filePath) {
    console.log('Error:', err.message);
    console.log('file:', filePath);
    if (err.line) {
      console.log('line:', err.line);
    }
    throw err;
  };

  getUnixStylePath = function(p) {
    return p.split(path.sep).join('/');
  };

  getBodyDeps = function(def, depPath, opt) {
    var depDir, deps, got;
    if (opt == null) {
      opt = {};
    }
    deps = [];
    got = {};
    depDir = path.dirname(depPath);
    def = def.replace(/(^|[^.])\brequire\s*\(\s*(["'])([^"']+?)\2\s*\)/mg, function(full, lead, quote, dep) {
      var pDep, qDep;
      pDep = dep.replace(/\{\{([^{}]+)\}\}/g, quote + ' + $1 + ' + quote);
      if (opt.baseDir && pDep.indexOf('.') === 0) {
        pDep = path.relative(opt.baseDir, path.resolve(depDir, pDep));
      }
      qDep = quote + pDep + quote;
      got[dep] || deps.push(qDep);
      got[dep] = 1;
      if (pDep === dep) {
        return full;
      } else {
        return lead + 'require(' + qDep + ')';
      }
    });
    return {
      def: def,
      deps: deps
    };
  };

  fixDefineParams = function(def, depId, depPath, opt) {
    var bodyDeps, depDir, fix;
    if (opt == null) {
      opt = {};
    }
    def = getBodyDeps(def, depPath, opt);
    bodyDeps = def.deps;
    depDir = path.dirname(depPath);
    fix = function(full, b, d, quote, definedId, deps) {
      var bodyDep, id, tmp, _i, _len;
      if (bodyDeps.length) {
        if (/^\[\s*\]$/.test(deps)) {
          deps = "['require', 'exports', 'module', " + bodyDeps.join(', ') + "]";
        } else if (deps) {
          deps = deps.replace(/^\[\s*|\s*\]$/g, '').split(/\s*,\s*/);
          if (opt.baseDir) {
            deps = deps.map(function(dep) {
              if (dep.indexOf('.') === 1) {
                dep = dep.slice(1, -1);
                dep = path.relative(opt.baseDir, path.resolve(depDir, dep));
                dep = "'" + dep + "'";
              }
              return dep;
            });
          }
          tmp = deps.join(',').replace(/'/g, '"').replace(/\s+/g, '').replace(/"\+"/g, '+');
          for (_i = 0, _len = bodyDeps.length; _i < _len; _i++) {
            bodyDep = bodyDeps[_i];
            if (tmp.indexOf(bodyDep.replace(/'/g, '"').replace(/\s+/g, '').replace(/"\+"/g, '+')) === -1) {
              deps.push(bodyDep);
            }
          }
          deps = '[' + deps.join(', ') + ']';
        } else {
          deps = "['require', 'exports', 'module', " + bodyDeps.join(', ') + "], ";
        }
      }
      if (definedId && !/^\./.test(definedId)) {
        id = definedId;
      } else {
        id = depId || '';
        if (id && !opt.baseDir && !/^\./.test(id)) {
          id = './' + id;
        }
      }
      return [b, d, id && ("'" + getUnixStylePath(id) + "', "), deps || "['require', 'exports', 'module'], "].join('');
    };
    if (!/(^|[^.])\bdefine\s*\(/.test(def.def) && EXPORTS_REGEXP.test(def.def)) {
      def = [fix('define(', '', 'define(') + 'function(require, exports, module) {', def.def, '});'].join(EOL);
    } else {
      def = def.def.replace(/(^|[^.])\b(define\s*\()\s*(?:(["'])([^"'\s]+)\3\s*,\s*)?\s*(\[[^\[\]]*\])?/m, fix);
    }
    return def;
  };

  findVendorInDir = function(inDir, outDir, name, opt, callback) {
    var confFile, content, err, mainMapped, mainPath, minifyJS, moduleDir, outPath, outPathExists, packageObj, packagePath, _i, _len, _ref, _ref1;
    moduleDir = path.resolve(inDir, name);
    mainMapped = (_ref = opt.mainMap) != null ? _ref[name] : void 0;
    if (mainMapped) {
      if (mainMapped.indexOf('@') >= 0) {
        mainMapped = mainMapped.split('@');
        moduleDir = path.resolve(inDir, mainMapped[1]);
        mainMapped = mainMapped[0];
      }
      if (mainMapped) {
        mainPath = path.resolve(moduleDir, mainMapped);
      }
    }
    _ref1 = ['bower.json', 'package.json'];
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      confFile = _ref1[_i];
      if (!mainPath) {
        packagePath = path.resolve(moduleDir, confFile);
        if (fs.existsSync(packagePath)) {
          packageObj = require(packagePath);
          if (packageObj.main) {
            mainPath = path.resolve(moduleDir, packageObj.main);
          }
        }
      }
    }
    if (mainPath && path.extname(mainPath) !== '.js') {
      mainPath = mainPath + '.js';
    }
    if (mainPath && fs.existsSync(mainPath)) {
      if (opt.suffix) {
        outPath = path.resolve(outDir, name + opt.suffix + '.js');
      } else {
        outPath = path.resolve(outDir, name + '.js');
      }
      outPathExists = fs.existsSync(outPath);
      if ((!outPathExists || opt.overWrite) && !_venderFoundMap[outPath]) {
        _venderFoundMap[outPath] = true;
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
        return callback(outPathExists || _venderFoundMap[outPath]);
      }
    } else {
      return callback(false);
    }
  };

  fixBowerDir = function(inDir) {
    var bowerrc, bowerrcPath;
    bowerrcPath = path.resolve(inDir, '.bowerrc');
    if (fs.existsSync(bowerrcPath)) {
      bowerrc = JSON.parse(fs.readFileSync(bowerrcPath).toString());
      if (bowerrc.directory) {
        _bowerDir = bowerrc.directory;
      }
    }
    return fixBowerDir = function() {};
  };

  findVendor = function(inDir, outDir, name, opt, callback) {
    fixBowerDir(inDir);
    return findVendorInDir(path.resolve(inDir, _npmDir), outDir, name, opt, function(found) {
      if (found) {
        return callback();
      } else {
        return findVendorInDir(path.resolve(inDir, _bowerDir), outDir, name, opt, function(found) {
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
        onlyRelative: !opt.findVendor,
        extnames: opt.dependencyExtnames
      });
      depStream.pipe(through.obj(function(file, enc, next) {
        dependFiles.push(file);
        return next();
      }, function() {
        var content;
        content = [];
        return async.eachSeries(dependFiles, function(depFile, cb) {
          var coffeeStream, cwd, depContent, depId, depPath, fileName, findVendorOpt, inDir, outDir, reactOpt, requireBaseDir, trace, typeOfOpt;
          if (depFile._isRelative || depFile.path === file.path) {
            depPath = depFile.path.replace(DEP_ID_SUFFIX_REGEXP, '');
            if (depFile.path === file.path) {
              depId = '';
              file.contents = new Buffer(file.contents.toString().split(/(?:\r\n|\n|\r)__END__\s*(?:\r\n|\n|\r|$)/)[0]);
            } else {
              depId = path.relative(baseDir || path.dirname(file.path), depFile.path).replace(DEP_ID_SUFFIX_REGEXP, '');
            }
            if (opt.trace) {
              trace = '/* trace:' + path.relative(process.cwd(), depFile.path) + ' */' + EOL;
            } else {
              trace = '';
            }
            if (/\.coffee$/.test(depFile.path)) {
              depContent = depFile.contents.toString();
              if (/\.react\.coffee$/.test(depFile.path) || /(^|\r\n|\n|\r)##\s*@jsx\s/.test(depContent)) {
                depContent = coffeeReactTransform(depContent);
                depFile.contents = new Buffer(depContent);
              }
              coffeeStream = coffee(opt.coffeeOpt);
              coffeeStream.pipe(through.obj(function(depFile, enc, next) {
                content.push(trace + fixDefineParams(depFile.contents.toString(), depId, depPath, opt));
                cb();
                return next();
              }));
              coffeeStream.on('error', function(e) {
                console.log('gulp-amd-bundler Error:', e.message);
                console.log('file:', file.path);
                return console.log(e.stack);
              });
              return coffeeStream.end(depFile);
            } else if (/\.es6$/.test(depFile.path)) {
              depContent = depFile.contents.toString();
              if (/\.react\.es6$/.test(depFile.path) || /(^|\r\n|\n|\r)\/\*\*\s*@jsx\s/.test(depContent)) {
                reactOpt = _.extend({}, opt.reactOpt, {
                  es6module: true,
                  harmony: true
                });
                depContent = reactTools.transform(depContent, reactOpt);
              } else {
                depContent = traceur.compile(depContent, opt.traceurOpt);
              }
              content.push(trace + fixDefineParams(depContent, depId, depPath, opt));
              return cb();
            } else if (/\.(tag|riot\.html|tpl\.html|css|less|scss)$/.test(depFile.path)) {
              return mt2amd.compile(depFile, {
                riotOpt: opt.riotOpt,
                postcss: opt.postcss,
                generateDataUri: opt.generateDataUri,
                cssSprite: opt.cssSprite,
                beautify: opt.beautifyTemplate,
                trace: opt.trace
              }).then(function(depFile) {
                content.push(fixDefineParams(depFile.contents.toString(), depId, depPath, opt));
                return cb();
              }, function(err) {
                return reject(err);
              }).done();
            } else {
              depContent = depFile.contents.toString();
              if (/\.(react\.js|jsx)$/.test(depFile.path) || /(^|\r\n|\n|\r)\/\*\*\s*@jsx\s/.test(depContent)) {
                reactOpt = _.extend({}, opt.reactOpt, {
                  es6module: true,
                  harmony: true
                });
                depContent = reactTools.transform(depContent, reactOpt);
              }
              content.push(trace + fixDefineParams(depContent, depId, depPath, opt));
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
              return findVendor(inDir, outDir, fileName, findVendorOpt, cb);
            } else if (requireBaseDir) {
              fileName = path.resolve(cwd, requireBaseDir, depFile.path);
              fileName = path.relative(outDir, fileName);
              if (fileName && fileName.indexOf('/') === -1 && fileName.indexOf('.') === -1) {
                return findVendor(inDir, outDir, fileName, findVendorOpt, cb);
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
            file.path = file.path.replace(/\.(coffee|es6)$/, '.js');
          }
          file.contents = new Buffer(content.join(EOL + EOL));
          return resolve(file);
        });
      }));
      return depStream.end(file);
    });
  };

}).call(this);
