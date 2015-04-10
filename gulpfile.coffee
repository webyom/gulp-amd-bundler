gulp = require 'gulp'
coffee = require 'gulp-coffee'

gulp.task 'compile', ->
	gulp.src('src/**/*.coffee')
		.pipe coffee()
		.pipe gulp.dest('lib')

gulp.task 'example', ->
	bundler = require './lib/index'
	gulp.src('example/src/index.js')
		.pipe bundler
			base64img: true
			beautifyTemplate: true
			trace: true
		.pipe gulp.dest('example/dest')

gulp.task 'default', ['compile']