(function() {
  var EOL, Q, amdDependency, async, coffee, coffeeReactTransform, gutil, jsxTransform, mt2amd, path, through;

  Q = require('q');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  coffee = require('gulp-coffee');

  mt2amd = require('gulp-mt2amd');

  amdDependency = require('gulp-amd-dependency');

  jsxTransform = require('jsx-transform');

  coffeeReactTransform = require('coffee-react-transform');

  EOL = '\n';

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
        excludeDependent: true
      });
      depStream.pipe(through.obj(function(file, enc, next) {
        dependFiles.push(file);
        return next();
      }, function() {
        var content;
        content = [];
        return async.eachSeries(dependFiles, function(depFile, cb) {
          var coffeeStream, depContent, depId, trace;
          if (depFile.path === file.path) {
            if (baseDir) {
              depId = path.relative(baseDir, depFile.path).replace(/\.(tag|riot\.html|js|coffee)$/, '');
            } else {
              depId = '';
            }
            file.contents = new Buffer(file.contents.toString().split(/(?:\r\n|\n|\r)__END__\s*(?:\r\n|\n|\r|$)/)[0]);
          } else {
            depId = path.relative(baseDir || path.dirname(file.path), depFile.path).replace(/\.(tag|riot\.html|js|coffee)$/, '');
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
            if (/(^|\r\n|\n|\r)##\s*@jsx\s/.test(depContent)) {
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
            if (/(^|\r\n|\n|\r)\/\*\*\s*@jsx\s/.test(depContent)) {
              depContent = jsxTransform.transform(depContent, {
                ignoreDocblock: true,
                jsx: 'React.createElement'
              });
            }
            content.push(trace + mt2amd.fixDefineParams(depContent, depId, !!opt.baseDir));
            return cb();
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
