/** @jsx */
var modC = require('./sub/mod-c');

var ModA = react.createClass({
	render: function() {
		return (
			<div className="commentBox">
				<p>
					Hello, world! I am a CommentBox.
				</p>
			</div>
		);
	}
});

module.exports = ModA;