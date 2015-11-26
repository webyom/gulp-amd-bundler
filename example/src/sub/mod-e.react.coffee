async = require 'async'
modB = require '../mod-b'

ModE = react.createClass
	render: ->
		<div className="commentBox">
			<p>
				Hello, world! I am a CommentBox.
			</p>
		</div>

module.exports = ModE