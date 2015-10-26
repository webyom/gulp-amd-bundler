Q = require 'q'
path = require 'path'
async = require 'async'
gutil = require 'gulp-util'
through = require 'through2'
coffee = require 'gulp-coffee'
mt2amd = require 'gulp-mt2amd'
amdDependency = require 'gulp-amd-dependency'
reactTools = require 'react-tools'
coffeeReactTransform = require 'coffee-react-transform'

EOL = '\n'

module.exports = (opt = {}) ->
	through.obj (file, enc, next) ->
		return @emit 'error', new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null') if file.isNull()
		return @emit 'error', new gutil.PluginError('gulp-amd-bundler', 'Streams not supported') if file.isStream()
		module.exports.bundle(file, opt).then(
			(file) =>
				@push file
				next()
			(err) =>
				@emit 'error', new gutil.PluginError('gulp-amd-bundler', err)
		).done()

module.exports.bundle = (file, opt = {}) ->
	baseFile = opt.baseFile
	baseDir = opt.baseDir
	if baseFile and not baseDir
		baseDir = path.dirname(baseFile.path)
	Q.Promise (resolve, reject) ->
		return reject new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null') if file.isNull()
		return reject new gutil.PluginError('gulp-amd-bundler', 'Streams not supported') if file.isStream()
		dependFiles = [file]
		depStream = amdDependency excludeDependent: true
		depStream.pipe through.obj(
			(file, enc, next) ->
				dependFiles.push file
				next()
			->
				content = []
				async.eachSeries(
					dependFiles
					(depFile, cb) ->
						if depFile.path is file.path
							if baseDir
								depId = path.relative(baseDir, depFile.path).replace /\.(tag|riot\.html|js|jsx|coffee)$/, ''
							else
								depId = ''
							# remove inline templates srouce code
							file.contents = new Buffer file.contents.toString().split(/(?:\r\n|\n|\r)__END__\s*(?:\r\n|\n|\r|$)/)[0]
						else
							depId = path.relative(baseDir || path.dirname(file.path), depFile.path).replace /\.(tag|riot\.html|js|jsx|coffee)$/, ''
						if opt.trace
							trace = '/* trace:' + path.relative(process.cwd(), depFile.path) + ' */' + EOL
						else
							trace = ''
						if (/\.(tag|riot\.html|tpl\.html|css|less|scss)$/).test depFile.path
							mt2amd.compile(depFile, riotOpt: opt.riotOpt, postcss: opt.postcss, generateDataUri: opt.generateDataUri, cssSprite: opt.cssSprite, beautify: opt.beautifyTemplate, trace: opt.trace).then(
								(depFile) ->
									content.push mt2amd.fixDefineParams(depFile.contents.toString(), depId, !!opt.baseDir)
									cb()
								(err) ->
									reject err
							).done()
						else if (/\.coffee$/).test depFile.path
							depContent = depFile.contents.toString()
							if (/\.react\.coffee$/).test(depFile.path) or (/(^|\r\n|\n|\r)##\s*@jsx\s/).test(depContent)
								depContent = coffeeReactTransform depContent
								depFile.contents = new Buffer depContent
							coffeeStream = coffee opt.coffeeOpt
							coffeeStream.pipe through.obj(
								(depFile, enc, next) ->
									content.push trace + mt2amd.fixDefineParams(depFile.contents.toString(), depId, !!opt.baseDir)
									cb()
									next()
							)
							coffeeStream.on 'error', (e) ->
								console.log 'gulp-amd-bundler Error:', e.message
								console.log 'file:', file.path
								console.log e.stack
							coffeeStream.end depFile
						else
							depContent = depFile.contents.toString()
							if (/\.(react\.js|jsx)$/).test(depFile.path) or (/(^|\r\n|\n|\r)\/\*\*\s*@jsx\s/).test(depContent)
								depContent = reactTools.transform depContent, opt.reactOpt
							content.push trace + mt2amd.fixDefineParams(depContent, depId, !!opt.baseDir)
							cb()
					(err) ->
						return reject err if err
						if (/\.tpl\.html$/).test file.path
							file.path = file.path + '.js'
						else
							file.path = file.path.replace /\.coffee$/, '.js'
						file.contents = new Buffer content.join EOL + EOL
						resolve file
				)
		)
		depStream.end file
