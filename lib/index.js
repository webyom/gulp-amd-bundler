(function() {
  var CleanCSS, DEP_ID_SUFFIX_REGEXP, EOL, EXPORTS_REGEXP, Q, UglifyJS, _, _bowerDir, _npmDir, _venderFoundMap, amdDependency, async, child_process, coffee, coffeeReactTransform, findVendor, findVendorInDir, fixBowerDir, fixDefineParams, fs, getBodyDeps, getUnixStylePath, gutil, logErr, mkdirp, mt2amd, path, through, traceur;

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

  coffeeReactTransform = require('coffee-react-transform');

  UglifyJS = require('uglify-js');

  CleanCSS = require('clean-css');

  mkdirp = require('mkdirp');

  EOL = '\n';

  EXPORTS_REGEXP = /(^|[^.])\b(module\.exports|exports\.[^.]+)\s*=[^=]/;

  DEP_ID_SUFFIX_REGEXP = /\.(tag|riot\.html|js|jsx|coffee)$/i;

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
      var pDep, qDep, tmp;
      pDep = dep.replace(/\{\{([^{}]+)\}\}/g, quote + ' + $1 + ' + quote);
      if (opt.baseDir && pDep.indexOf('.') === 0) {
        tmp = path.relative(opt.baseDir, path.resolve(depDir, pDep));
        if (tmp.indexOf('.') !== 0) {
          pDep = tmp;
        }
      }
      qDep = quote + pDep + quote;
      if (!got[dep] && dep.indexOf('*') === -1) {
        deps.push(qDep);
      }
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
    var bodyDeps, depDir, fix, matchDefine;
    if (opt == null) {
      opt = {};
    }
    matchDefine = def.match(/(?:^|[^.])\bdefine\s*\(/g);
    if (matchDefine && matchDefine.length > 1) {
      return def;
    }
    def = getBodyDeps(def, depPath, opt);
    bodyDeps = def.deps;
    depDir = path.dirname(depPath);
    fix = function(full, b, d, quote, definedId, deps) {
      var bodyDep, i, id, len, tmp;
      if (bodyDeps.length) {
        if (/^\[\s*\]$/.test(deps)) {
          deps = "['require', 'exports', 'module', " + bodyDeps.join(', ') + "]";
        } else if (deps) {
          deps = deps.replace(/^\[\s*|\s*\]$/g, '').split(/\s*,\s*/);
          if (opt.baseDir) {
            deps = deps.map(function(dep) {
              var tmp;
              if (dep.indexOf('.') === 1) {
                tmp = dep.slice(1, -1);
                tmp = path.relative(opt.baseDir, path.resolve(depDir, tmp));
                if (tmp.indexOf('.') !== 0) {
                  dep = "'" + tmp + "'";
                }
              }
              return dep;
            });
          }
          tmp = deps.join(',').replace(/'/g, '"').replace(/\s+/g, '').replace(/"\+"/g, '+');
          for (i = 0, len = bodyDeps.length; i < len; i++) {
            bodyDep = bodyDeps[i];
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
    if (matchDefine) {
      def = def.def.replace(/(^|[^.])\b(define\s*\()\s*(?:(["'])([^"'\s]+)\3\s*,\s*)?\s*(\[[^\[\]]*\])?/m, fix);
    } else if (EXPORTS_REGEXP.test(def.def)) {
      def = [fix('define(', '', 'define(') + 'function(require, exports, module) {', def.def, '});'].join(EOL);
    } else {
      def = def.def;
    }
    return def;
  };

  findVendorInDir = function(inDir, outDir, depId, opt, callback) {
    var confFile, content, err, error, i, item, j, len, len1, mainMapped, mainPath, minifyJS, moduleDir, name, outId, outPath, outPathExists, packageObj, packagePath, ref, ref1, ref2, ref3, stylePath;
    name = depId.split('/')[0];
    if (opt.mkdir) {
      outDir = outDir + '/' + name;
    }
    moduleDir = path.resolve(inDir, name);
    mainMapped = (ref = opt.mainMap) != null ? ref[depId] : void 0;
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
    mainMapped = (ref1 = opt.mainMap) != null ? ref1[depId + ".css"] : void 0;
    if (mainMapped) {
      if (mainMapped.indexOf('@') >= 0) {
        mainMapped = mainMapped.split('@');
        moduleDir = path.resolve(inDir, mainMapped[1]);
        mainMapped = mainMapped[0];
      }
      if (mainMapped) {
        stylePath = path.resolve(moduleDir, mainMapped);
      }
    }
    if (!mainPath) {
      if (depId !== name) {
        mainPath = path.resolve(inDir, depId);
      } else {
        ref2 = ['bower.json', 'package.json'];
        for (i = 0, len = ref2.length; i < len; i++) {
          confFile = ref2[i];
          if (!mainPath) {
            packagePath = path.resolve(moduleDir, confFile);
            if (fs.existsSync(packagePath)) {
              packageObj = require(packagePath);
              if (packageObj.main) {
                if (Array.isArray(packageObj.main)) {
                  ref3 = packageObj.main;
                  for (j = 0, len1 = ref3.length; j < len1; j++) {
                    item = ref3[j];
                    if (/\.css$/i.test(item)) {
                      stylePath = path.resolve(moduleDir, item);
                    } else {
                      mainPath = path.resolve(moduleDir, item);
                    }
                  }
                } else {
                  if (/\.css$/i.test(packageObj.main)) {
                    stylePath = path.resolve(moduleDir, packageObj.main);
                  } else {
                    mainPath = path.resolve(moduleDir, packageObj.main);
                  }
                }
              }
              if (packageObj.style) {
                stylePath = path.resolve(moduleDir, packageObj.style);
              }
            }
          }
        }
      }
    }
    if (!mainPath) {
      mainPath = path.resolve(moduleDir, 'index.js');
    }
    if (path.extname(mainPath) !== '.js') {
      mainPath = mainPath + '.js';
    }
    if (mainPath && fs.existsSync(mainPath)) {
      if (depId !== name && opt.mkdir) {
        outId = depId.split(name + '/')[1];
      } else {
        outId = depId;
      }
      outPath = path.resolve(outDir, outId + (opt.suffix || ''));
      outPathExists = fs.existsSync(outPath + ".js");
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
          } catch (error) {
            err = error;
            logErr(err, mainPath);
          }
        }
        return mkdirp(path.dirname(outPath), function(err) {
          var error1, minifyCSS;
          if (err) {
            logErr(err, mainPath);
          }
          fs.writeFileSync(outPath + ".js", content);
          if (stylePath) {
            content = fs.readFileSync(stylePath).toString();
            if (opt.minifyCSS) {
              if (typeof opt.minifyCSS === 'object') {
                minifyCSS = opt.minifyCSS;
              } else {
                minifyCSS = {};
              }
              try {
                content = new CleanCSS(minifyCSS).minify(content).styles;
              } catch (error1) {
                err = error1;
                logErr(err, stylePath);
              }
            }
            fs.writeFileSync(outPath + ".css", content);
          }
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

  findVendor = function(inDir, outDir, depId, opt, callback) {
    fixBowerDir(inDir);
    return findVendorInDir(path.resolve(inDir, _npmDir), outDir, depId, opt, function(found) {
      if (found) {
        return callback();
      } else {
        return findVendorInDir(path.resolve(inDir, _bowerDir), outDir, depId, opt, function(found) {
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
        extnames: opt.dependencyExtnames,
        isRelative: opt.isRelativeDependency
      });
      depStream.pipe(through.obj(function(file, enc, next) {
        dependFiles.push(file);
        return next();
      }, function() {
        var content;
        content = [];
        return async.eachSeries(dependFiles, function(depFile, cb) {
          var coffeeStream, cwd, depContent, depId, depPath, fileName, findVendorOpt, inDir, outDir, prefix, requireBaseDir, tmp, trace, typeOfOpt;
          if (depFile._isRelative || depFile.path === file.path) {
            depPath = depFile.path.replace(DEP_ID_SUFFIX_REGEXP, '');
            if (depFile.path === file.path) {
              if (baseFile) {
                depId = path.relative(baseDir || path.dirname(baseFile.path), depFile.path).replace(DEP_ID_SUFFIX_REGEXP, '');
              } else {
                depId = '';
              }
              file.contents = new Buffer(file.contents.toString().split(/(?:\r\n|\n|\r)__END__\s*(?:\r\n|\n|\r|$)/)[0]);
            } else {
              depId = path.relative(baseDir || path.dirname(file.path), depFile.path).replace(DEP_ID_SUFFIX_REGEXP, '');
            }
            if (opt.trace) {
              trace = '/* trace:' + path.relative(process.cwd(), depFile.path) + ' */' + EOL;
            } else {
              trace = '';
            }
            if (/\.coffee$/i.test(depFile.path)) {
              depContent = depFile.contents.toString();
              if (/\.react\.coffee$/i.test(depFile.path) || /(^|\r\n|\n|\r)##\s*@jsx\s/.test(depContent)) {
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
            } else if (/\.(json|tag|riot\.html|tpl\.html|css|less|scss|png|jpg|jpeg|gif|svg)$/i.test(depFile.path)) {
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
              requireBaseDir = path.resolve(cwd, requireBaseDir);
              prefix = path.relative(requireBaseDir, outDir);
              if (prefix) {
                tmp = fileName.split(prefix + '/');
                if (!tmp[0]) {
                  fileName = tmp[1];
                }
              }
              if (fileName) {
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
          if (!/\.js$/i.test(file.path)) {
            if (/\.coffee$/i.test(file.path)) {
              file.path = file.path.replace(/\.coffee$/i, '.js');
            } else {
              file.path = file.path + '.js';
            }
          }
          file.contents = new Buffer(content.join(EOL + EOL));
          return resolve(file);
        });
      }));
      return depStream.end(file);
    });
  };

}).call(this);
