(function() {
  var CleanCSS, DEP_ID_SUFFIX_REGEXP, EOL, EXPORTS_REGEXP, PluginError, Q, UglifyJS, _, _bowerDir, _npmDir, _venderFoundMap, amdDependency, async, child_process, coffee, coffeeReactTransform, fixDefineParams, fs, getBodyDeps, getUnixStylePath, logErr, mkdirp, mt2amd, path, through;

  child_process = require('child_process');

  _ = require('underscore');

  Q = require('q');

  fs = require('fs');

  path = require('path');

  async = require('async');

  PluginError = require('plugin-error');

  through = require('through2');

  coffee = require('gulp-coffee');

  mt2amd = require('gulp-mt2amd');

  amdDependency = require('gulp-amd-dependency');

  coffeeReactTransform = require('coffee-react-transform');

  UglifyJS = require('uglify-js');

  CleanCSS = require('clean-css');

  mkdirp = require('mkdirp');

  EOL = '\n';

  EXPORTS_REGEXP = /(^|[^.])\b(module\.exports|exports\.[^.]+)\s*=[^=]/;

  DEP_ID_SUFFIX_REGEXP = /\.(js|jsx|coffee)$/i;

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
          deps = '[' + deps.join(',').replace(/,(['"])/g, ', $1') + ']';
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

  module.exports = function(opt) {
    if (opt == null) {
      opt = {};
    }
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new PluginError('gulp-amd-bundler', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-amd-bundler', 'Streams not supported'));
      }
      return module.exports.bundle(file, opt).then((function(_this) {
        return function(file) {
          _this.push(file);
          return next();
        };
      })(this), (function(_this) {
        return function(err) {
          return _this.emit('error', new PluginError('gulp-amd-bundler', err));
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
        return reject(new PluginError('gulp-amd-bundler', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return reject(new PluginError('gulp-amd-bundler', 'Streams not supported'));
      }
      dependFiles = [file];
      depStream = amdDependency({
        excludeDependent: true,
        onlyRelative: true,
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
          var coffeeStream, depContent, depId, depPath, trace;
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
            } else if (/\.(json|md|tpl\.html|css|less|scss|png|jpg|jpeg|gif|svg)$/i.test(depFile.path)) {
              return mt2amd.compile(depFile, {
                postcss: opt.postcss,
                generateDataUri: opt.generateDataUri,
                cssSprite: opt.cssSprite,
                beautify: opt.beautifyTemplate,
                strictMode: opt.strictModeTemplate,
                babel: opt.babel,
                trace: opt.trace,
                markedOptions: opt.markedOptions,
                cssModuleClassNameGenerator: opt.cssModuleClassNameGenerator,
                cssModuleClassNamePlaceholder: opt.cssModuleClassNamePlaceholder,
                useExternalCssModuleHelper: opt.useExternalCssModuleHelper
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
