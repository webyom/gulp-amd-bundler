Q = require 'q'
fs = require 'fs'
path = require 'path'
async = require 'async'
gutil = require 'gulp-util'
through = require 'through2'
coffee = require 'gulp-coffee'
mt2amd = require 'gulp-mt2amd'
amdDependency = require 'gulp-amd-dependency'
reactTools = require 'react-tools'
coffeeReactTransform = require 'coffee-react-transform'
UglifyJS = require 'uglify-js'
mkdirp = require 'mkdirp'

EOL = '\n'

logErr = (err, filePath) ->
	console.log 'Error:', err.message
	console.log 'file:', filePath
	if err.line
		console.log 'line:', err.line
	throw err

_findVendorInDir = (inDir, outDir, name, opt, callback) ->
	moduleDir = path.resolve inDir, name
	packagePath = path.resolve moduleDir, 'package.json'
	if fs.existsSync packagePath
		packageObj = require packagePath
		if packageObj.main
			mainPath = path.resolve moduleDir, packageObj.main
			mainPath = mainPath + '.js' if path.extname(mainPath) isnt '.js'
			if fs.existsSync mainPath
				outPath = path.resolve outDir, path.basename(mainPath)
				if not fs.existsSync(outPath) or opt.overWrite
					content = fs.readFileSync(mainPath).toString()
					if opt.minifyJS
						if typeof opt.minifyJS is 'object'
							minifyJS = opt.minifyJS
						else
							minifyJS = {}
						minifyJS.fromString = true
						try
							content = UglifyJS.minify(content, minifyJS).code
						catch err
							logErr err, mainPath
					mkdirp outDir, (err) ->
						logErr err, mainPath if err
						fs.writeFileSync outPath, content
						callback true
				else
					callback false
		else
			callback false
	else
		callback false

_findVendor = (inDir, outDir, name, opt, callback) ->
	_findVendorInDir path.resolve(inDir, 'node_modules'), outDir, name, opt, (found) ->
		if found
			callback()
		else
			_findVendorInDir path.resolve(inDir, 'bower_components'), outDir, name, opt, (found) ->
				callback()

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
		depStream = amdDependency
			excludeDependent: true
			onlyRelative: not opt.findVendor
		depStream.pipe through.obj(
			(file, enc, next) ->
				dependFiles.push file
				next()
			->
				content = []
				async.eachSeries(
					dependFiles
					(depFile, cb) ->
						if depFile._isRelative or depFile.path is file.path
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
						else if opt.findVendor
							typeOfOpt = typeof opt.findVendor
							findVendorOpt = {}
							if typeOfOpt is 'object'
								findVendorOpt = opt.findVendor
								requireBaseDir = findVendorOpt.requireBaseDir
								outDir = findVendorOpt.outDir
								inDir = findVendorOpt.inDir || './'
							else if typeOfOpt is 'string'
								outDir = opt.findVendor
								inDir = './'
							else
								outDir = 'js/vendor'
								inDir = './'
							cwd = process.cwd()
							inDir = path.resolve cwd, inDir
							outDir = path.resolve cwd, outDir
							fileName = depFile.path
							if fileName.indexOf('/') is -1
								_findVendor inDir, outDir, fileName, findVendorOpt, cb
							else if requireBaseDir
								fileName = path.resolve cwd, requireBaseDir, depFile.path
								fileName = path.relative outDir, fileName
								if fileName and fileName.indexOf('/') is -1 and fileName.indexOf('.') is -1
									_findVendor inDir, outDir, fileName, findVendorOpt, cb
								else
									cb()
							else
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
