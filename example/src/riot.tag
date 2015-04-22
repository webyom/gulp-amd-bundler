var $ = require('jquery');

/** @riot coffeescript */
<todo>

  <h3>{ opts.title }</h3>
  <child />
  <ul>
    <li each={ items.filter(filter) }>
      <label class={ completed: done }>
        <input type="checkbox" checked={ done } onclick={ parent.toggle }> { title }
      </label>
    </li>
  </ul>

  <form onsubmit={ add }>
    <input name="input" onkeyup={ edit }>
    <button disabled={ not text }>Add #{ items.filter(filter).length + 1 }</button>
  </form>

  <style>
  .menu {
    height: 200px;
  }
  </style>
  <!-- include "./style.less" -->

  <!-- this script tag is optional -->
  <script>
    @items = opts.items

    @edit = (e) ->
      @text = e.target.value

    @add = (e) ->
      if @text
        @items.push({ title: this.text })
        @text = this.input.value = ''

    @filter = (item) ->
      not item.hidden

    @toggle = (e) ->
      item = e.item
      item.done = not item.done
      true
  </script>

</todo>

<child>

</child>

module.exports = 'todo';