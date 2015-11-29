var React = require('react');

class Counter extends React.Component {
	constructor(props) {
		super(props);
		this.state = {count: props.initialCount};
	}
	tick() {
		this.setState({count: this.state.count + 1});
	}
}

module.exports = Counter;